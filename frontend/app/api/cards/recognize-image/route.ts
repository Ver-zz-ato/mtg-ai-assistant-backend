/**
 * POST /api/cards/recognize-image — AI fallback for card recognition.
 *
 * Mobile Scan Card: optional `scanContext` JSON (normalized OCR, candidates, fuzzy hints, trigger reason).
 * - Request: multipart/form-data with "image" (file), optional "scanContext" (JSON string),
 *   optional "assistMode" (fallback|improve), optional "imageRole" (title|full)
 * - Auth: Optional (Bearer for mobile; guest allowed)
 * - Response: { ok, recognition: { ... } }
 */

import { NextRequest, NextResponse } from "next/server";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";
import { recordAiUsage } from "@/lib/ai/log-usage";
import { costUSD } from "@/lib/ai/pricing";
import { SCAN_AI_FREE, SCAN_AI_GUEST, SCAN_AI_PRO } from "@/lib/feature-limits";
import type { ScannerContextPayload } from "@/lib/scanner/recognition";
import {
  buildValidatedScanRecognition,
  parseScanAiJsonResponse,
  type ScanAssistMode,
  type ScanImageRole,
} from "@/lib/scanner/scan-ai-core";
import { getScannerVisionModel } from "@/lib/scanner/scan-ai-models";
import { resolveScanAiRouteAuth, scanAiRateLimitMeta } from "@/lib/scanner/scan-ai-route-auth";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const TIMEOUT_MS = 20000;
const ROUTE_PATH = "/api/cards/recognize-image";
const DEFAULT_SOURCE_PAGE = "app_scan_ai_fallback";

type ScanContextPayload = ScannerContextPayload & {
  normalizedOcrText?: string;
  ocrCandidates?: string[];
  fuzzyMatches?: Array<{ name: string; score?: number }>;
  aiTriggerReason?: string;
};

function parseImageRole(raw: string | null): ScanImageRole {
  return raw?.toLowerCase() === "title" ? "title" : "full";
}

function buildRecognitionPrompt(ctx: ScanContextPayload | null): string {
  const lines: string[] = [
    `You are helping identify a Magic: The Gathering card from a photo.`,
    ``,
    `Primary task: read the card from the image. The title line at the top is the most important; artwork and frame are secondary (frames vary by set; alt art exists).`,
    `Printed titles may differ from the official (oracle) English name — e.g. Universes Beyond, promos, or double-faced cards (use " // " between faces when both names are visible).`,
    `Do not invent card names. Do not output set codes, collector numbers, or flavor text as the name.`,
    ``,
    `Return ONLY valid JSON with this exact shape (no markdown, no extra keys):`,
    `{"primary":"Official-style English card name or empty string","alternatives":[],"confidence":"high|medium|low","reason":"One short sentence"}`,
    `- primary: best guess for the oracle-style name; empty string if unreadable.`,
    `- alternatives: 0-3 other plausible oracle names if uncertain (strings only).`,
    `- confidence: high only if the title line is clearly readable; medium if partially readable or you rely on art; low if guessing.`,
    `- reason: brief, factual (e.g. "Title line readable" / "Title obscured, using art").`,
    `If you cannot identify any real MTG card: {"primary":"","alternatives":[],"confidence":"low","reason":"Could not identify"}`,
  ];

  if (ctx && (ctx.normalizedOcrText || (ctx.ocrCandidates?.length ?? 0) > 0 || (ctx.fuzzyMatches?.length ?? 0) > 0)) {
    lines.push(``, `Context from the app (hints only — often noisy; verify against the image; do not trust blindly):`);
    if (ctx.aiTriggerReason) lines.push(`- Why AI was called: ${ctx.aiTriggerReason}`);
    if (ctx.normalizedOcrText?.trim()) lines.push(`- Normalized OCR text: ${ctx.normalizedOcrText.trim().slice(0, 500)}`);
    if (ctx.ocrCandidates?.length) lines.push(`- OCR title candidates: ${ctx.ocrCandidates.slice(0, 3).join(" | ")}`);
    if (ctx.fuzzyMatches?.length) {
      const fm = ctx.fuzzyMatches
        .slice(0, 3)
        .map((m) => (typeof m.score === "number" ? `${m.name} (${m.score.toFixed(2)})` : m.name))
        .join(" | ");
      lines.push(`- Fuzzy database matches (0-1 score): ${fm}`);
    }
    lines.push(
      `Use hints only to disambiguate when the image is unclear; prefer what you read on the title line. If hints conflict with the image, follow the image.`
    );
  } else {
    lines.push(``, `No OCR/fuzzy context was sent — rely on the image.`);
  }

  return lines.join("\n");
}

function trimFormString(formData: FormData, ...keys: string[]): string | null {
  for (const key of keys) {
    const raw = formData.get(key);
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return null;
}

function parseAssistMode(raw: string | null): ScanAssistMode {
  return raw?.toLowerCase() === "improve" ? "improve" : "fallback";
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "recognition_unavailable" }, { status: 503 });
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
    }

    const { resolveAiUsageSourceForRequest } = await import("@/lib/ai/manatap-client-origin");
    const fdUsage = formData.get("usageSource");
    const fdUsageSnake = formData.get("usage_source");
    const usageSourceBody = {
      usageSource:
        typeof fdUsage === "string" ? fdUsage : typeof fdUsageSnake === "string" ? fdUsageSnake : undefined,
    };
    const usageSource = resolveAiUsageSourceForRequest(req, usageSourceBody, null);
    const sourceScreen = trimFormString(formData, "sourceScreen", "source_screen");
    const scanSessionId = trimFormString(formData, "scanSessionId", "scan_session_id");
    const scanAttemptId = trimFormString(formData, "scanAttemptId", "scan_attempt_id");
    const assistMode = parseAssistMode(trimFormString(formData, "assistMode", "assist_mode"));
    const imageRole = parseImageRole(trimFormString(formData, "imageRole", "image_role"));
    const sourcePageRaw = formData.get("sourcePage") ?? formData.get("source_page");
    const sourcePage =
      typeof sourcePageRaw === "string" && sourcePageRaw.trim()
        ? sourcePageRaw.trim()
        : assistMode === "improve"
          ? "app_scan_ai_improve"
          : DEFAULT_SOURCE_PAGE;

    let scanContext: ScanContextPayload | null = null;
    const rawCtx = formData.get("scanContext") ?? formData.get("scan_context");
    if (typeof rawCtx === "string" && rawCtx.trim()) {
      try {
        scanContext = JSON.parse(rawCtx) as ScanContextPayload;
      } catch {
        scanContext = null;
      }
    }

    const topFuzzyNameFromClient =
      scanContext?.fuzzyMatches?.length && scanContext.fuzzyMatches[0]?.name
        ? String(scanContext.fuzzyMatches[0].name).trim()
        : undefined;

    const file = formData.get("image") ?? formData.get("file");
    const blob = file instanceof Blob ? file : null;
    if (!blob || blob.size === 0) {
      return NextResponse.json({ ok: false, error: "no_image" }, { status: 400 });
    }
    if (blob.size > MAX_FILE_BYTES) {
      return NextResponse.json({ ok: false, error: "image_too_large" }, { status: 400 });
    }
    const mime = (blob.type?.toLowerCase() || "image/jpeg").trim();
    const allowed = SUPPORTED_TYPES.includes(mime);
    if (!allowed) {
      return NextResponse.json({ ok: false, error: "unsupported_format" }, { status: 400 });
    }

    const authResult = await resolveScanAiRouteAuth(req, ROUTE_PATH, {
      guest: SCAN_AI_GUEST,
      free: SCAN_AI_FREE,
      pro: SCAN_AI_PRO,
    });
    if (authResult instanceof NextResponse) return authResult;
    const auth = authResult;

    if (assistMode === "improve" && !auth.isPro) {
      return NextResponse.json(
        {
          ok: false,
          code: "PRO_REQUIRED",
          error: "Improve with AI is a Pro feature.",
          tier: auth.userTier,
          limit: auth.dailyLimit,
          remaining: 0,
          resetAt: null,
          proRequired: true,
        },
        { status: 403 }
      );
    }

    const buf = await blob.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    const dataUrl = `data:${blob.type || "image/jpeg"};base64,${base64}`;

    const userPrompt = buildRecognitionPrompt(scanContext);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const { model, tier: modelTier } = getScannerVisionModel(auth, assistMode);
    const body = prepareOpenAIBody({
      model,
      max_completion_tokens: 320,
      messages: [
        { role: "system", content: "You return only valid JSON. No markdown fences, no extra text." },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const json = (await res.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = json?.choices?.[0]?.message?.content?.trim() ?? "";
    const usage = json?.usage ?? {};
    const inputTokens = usage.prompt_tokens ?? 0;
    const outputTokens = usage.completion_tokens ?? 0;
    const cost = costUSD(model, inputTokens, outputTokens);

    recordAiUsage({
      user_id: auth.realUserId,
      anon_id: auth.realUserId ? null : auth.keyHash,
      model,
      model_tier: modelTier,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: cost,
      route: "scan_recognize_image",
      source_page: sourcePage,
      source: usageSource ?? undefined,
      prompt_preview:
        `scan_session_id=${scanSessionId || ""}; scan_attempt_id=${scanAttemptId || ""}; source_screen=${sourceScreen || ""}; assist_mode=${assistMode}; image_role=${imageRole}; ` +
        (scanContext ? "card recognition vision+context" : "card recognition vision"),
      response_preview: content?.slice(0, 200) ?? null,
      latency_ms: Date.now() - t0,
      user_tier: auth.userTier,
      is_guest: auth.userTier === "guest",
      scanner_session_id: scanSessionId,
      scanner_attempt_id: scanAttemptId,
      source_screen: sourceScreen,
      assist_mode: assistMode,
    }).catch(() => {});

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: "recognition_failed" }, { status: 502 });
    }

    const parsed = parseScanAiJsonResponse(content);
    if (!parsed?.primary) {
      return NextResponse.json({
        ok: false,
        error: "recognition_failed",
      });
    }

    const origin = new URL(req.url).origin;
    const recognition = await buildValidatedScanRecognition({
      parsed,
      supabase: auth.supabase,
      origin,
      scanContext,
      topFuzzyNameFromClient,
      source: "ai_vision",
      assistMode,
      imageRole,
      scanSessionId,
      scanAttemptId,
      sourceScreen,
    });

    if (!recognition) {
      return NextResponse.json({ ok: false, error: "recognition_failed" });
    }

    return NextResponse.json({
      ok: true,
      recognition,
      ...scanAiRateLimitMeta(auth),
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      return NextResponse.json({ ok: false, error: "timeout" }, { status: 504 });
    }
    return NextResponse.json({ ok: false, error: "recognition_failed" }, { status: 502 });
  }
}
