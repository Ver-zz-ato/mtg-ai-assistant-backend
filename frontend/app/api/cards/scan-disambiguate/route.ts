/**
 * POST /api/cards/scan-disambiguate — text-only AI to pick among fuzzy OCR candidates (Phase A).
 *
 * Request: application/json
 * - normalizedOcrText, ocrCandidates, fuzzyMatches (required: at least one fuzzy or OCR hint)
 * - optional: collectorHint, sessionCardNames, aiTriggerReason, scanSessionId, scanAttemptId
 * Auth: optional Bearer (guest allowed with IP/guest limits)
 */

import { NextRequest, NextResponse } from "next/server";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";
import { recordAiUsage } from "@/lib/ai/log-usage";
import { costUSD } from "@/lib/ai/pricing";
import {
  SCAN_DISAMBIGUATE_FREE,
  SCAN_DISAMBIGUATE_GUEST,
  SCAN_DISAMBIGUATE_PRO,
} from "@/lib/feature-limits";
import {
  buildDisambiguateFuzzyFallbackRecognition,
  buildValidatedScanRecognition,
  parseScanAiJsonResponse,
  snapParsedPrimaryToFuzzyCandidates,
} from "@/lib/scanner/scan-ai-core";
import { buildScanDisambiguatePrompt } from "@/lib/scanner/scan-disambiguate-prompt";
import { getScannerDisambiguateModel } from "@/lib/scanner/scan-ai-models";
import { resolveScanAiRouteAuth, scanAiRateLimitMeta } from "@/lib/scanner/scan-ai-route-auth";
import type { ScannerContextPayload } from "@/lib/scanner/recognition";

export const runtime = "nodejs";

const ROUTE_PATH = "/api/cards/scan-disambiguate";
const TIMEOUT_MS = 12000;
const DEFAULT_SOURCE_PAGE = "app_scan_ai_disambiguate";

const MAX_OCR_LEN = 400;
const MAX_LIST = 5;
const MAX_SESSION_NAMES = 8;

type ScanDisambiguateBody = ScannerContextPayload & {
  collectorHint?: string | null;
  sessionCardNames?: string[];
  scanSessionId?: string;
  scanAttemptId?: string;
  sourcePage?: string;
  sourceScreen?: string;
  usageSource?: string;
};

function sanitizeBody(raw: unknown): ScanDisambiguateBody | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const normalizedOcrText =
    typeof o.normalizedOcrText === "string" ? o.normalizedOcrText.trim().slice(0, MAX_OCR_LEN) : undefined;
  const ocrCandidates = Array.isArray(o.ocrCandidates)
    ? o.ocrCandidates
        .map((c) => (typeof c === "string" ? c.trim() : ""))
        .filter(Boolean)
        .slice(0, MAX_LIST)
    : undefined;
  const fuzzyMatches = Array.isArray(o.fuzzyMatches)
    ? o.fuzzyMatches
        .map((m) => {
          if (!m || typeof m !== "object") return null;
          const row = m as Record<string, unknown>;
          const name = typeof row.name === "string" ? row.name.trim() : "";
          if (!name) return null;
          const score = typeof row.score === "number" && Number.isFinite(row.score) ? row.score : undefined;
          return score !== undefined ? { name, score } : { name };
        })
        .filter((m): m is { name: string; score?: number } => m != null)
        .slice(0, MAX_LIST)
    : undefined;
  const collectorHint = typeof o.collectorHint === "string" ? o.collectorHint.trim().slice(0, 80) : undefined;
  const sessionCardNames = Array.isArray(o.sessionCardNames)
    ? o.sessionCardNames
        .map((n) => (typeof n === "string" ? n.trim() : ""))
        .filter(Boolean)
        .slice(0, MAX_SESSION_NAMES)
    : undefined;
  const aiTriggerReason = typeof o.aiTriggerReason === "string" ? o.aiTriggerReason.trim().slice(0, 64) : undefined;

  const hasSignal =
    Boolean(normalizedOcrText) ||
    Boolean(ocrCandidates?.length) ||
    Boolean(fuzzyMatches?.length) ||
    Boolean(collectorHint);
  if (!hasSignal) return null;

  return {
    normalizedOcrText: normalizedOcrText || undefined,
    ocrCandidates: ocrCandidates?.length ? ocrCandidates : undefined,
    fuzzyMatches: fuzzyMatches?.length ? fuzzyMatches : undefined,
    collectorHint: collectorHint || undefined,
    sessionCardNames: sessionCardNames?.length ? sessionCardNames : undefined,
    aiTriggerReason: aiTriggerReason || undefined,
    scanSessionId: typeof o.scanSessionId === "string" ? o.scanSessionId.trim().slice(0, 64) : undefined,
    scanAttemptId: typeof o.scanAttemptId === "string" ? o.scanAttemptId.trim().slice(0, 64) : undefined,
    sourcePage: typeof o.sourcePage === "string" ? o.sourcePage.trim().slice(0, 64) : undefined,
    sourceScreen: typeof o.sourceScreen === "string" ? o.sourceScreen.trim().slice(0, 64) : undefined,
    usageSource: typeof o.usageSource === "string" ? o.usageSource.trim().slice(0, 64) : undefined,
  };
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "disambiguate_unavailable" }, { status: 503 });
    }

    let bodyRaw: unknown;
    try {
      bodyRaw = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const body = sanitizeBody(bodyRaw);
    if (!body) {
      return NextResponse.json({ ok: false, error: "missing_scan_context" }, { status: 400 });
    }

    const authResult = await resolveScanAiRouteAuth(req, ROUTE_PATH, {
      guest: SCAN_DISAMBIGUATE_GUEST,
      free: SCAN_DISAMBIGUATE_FREE,
      pro: SCAN_DISAMBIGUATE_PRO,
    });
    if (authResult instanceof NextResponse) return authResult;
    const auth = authResult;
    const { model, tier: modelTier } = getScannerDisambiguateModel(auth);

    const { resolveAiUsageSourceForRequest } = await import("@/lib/ai/manatap-client-origin");
    const usageSource = resolveAiUsageSourceForRequest(req, { usageSource: body.usageSource }, null);
    const sourcePage = body.sourcePage?.trim() || DEFAULT_SOURCE_PAGE;
    const sourceScreen = body.sourceScreen?.trim() || null;

    const scanContext: ScannerContextPayload = {
      normalizedOcrText: body.normalizedOcrText,
      ocrCandidates: body.ocrCandidates,
      fuzzyMatches: body.fuzzyMatches,
      aiTriggerReason: body.aiTriggerReason,
    };

    const topFuzzyNameFromClient = body.fuzzyMatches?.[0]?.name
      ? String(body.fuzzyMatches[0].name).trim()
      : undefined;

    const userPrompt = buildScanDisambiguatePrompt({
      ...scanContext,
      collectorHint: body.collectorHint,
      sessionCardNames: body.sessionCardNames,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const openAiBody = prepareOpenAIBody({
      model,
      max_completion_tokens: 220,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You return only valid JSON. No markdown fences, no extra text." },
        { role: "user", content: userPrompt },
      ],
    });

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(openAiBody),
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
      route: "scan_disambiguate",
      source_page: sourcePage,
      source: usageSource ?? undefined,
      prompt_preview:
        `scan_session_id=${body.scanSessionId || ""}; scan_attempt_id=${body.scanAttemptId || ""}; ` +
        `source_screen=${sourceScreen || ""}; text_disambiguate`,
      response_preview: content?.slice(0, 200) ?? null,
      latency_ms: Date.now() - t0,
      user_tier: auth.userTier,
      is_guest: auth.userTier === "guest",
      cache_hit: false,
      scanner_session_id: body.scanSessionId,
      scanner_attempt_id: body.scanAttemptId,
      source_screen: sourceScreen,
    }).catch(() => {});

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: "disambiguate_failed" }, { status: 502 });
    }

    let parsed = parseScanAiJsonResponse(content);
    if (parsed && body.fuzzyMatches?.length) {
      parsed = snapParsedPrimaryToFuzzyCandidates(parsed, body.fuzzyMatches);
    }

    const origin = new URL(req.url).origin;
    let recognition: Awaited<ReturnType<typeof buildValidatedScanRecognition>> = null;

    if (parsed?.primary) {
      recognition = await buildValidatedScanRecognition({
        parsed,
        supabase: auth.supabase,
        origin,
        scanContext,
        topFuzzyNameFromClient,
        source: "ai_text",
        assistMode: "fallback",
        scanSessionId: body.scanSessionId ?? null,
        scanAttemptId: body.scanAttemptId ?? null,
        sourceScreen,
      });
    }

    if (!recognition && body.fuzzyMatches?.length) {
      recognition = await buildDisambiguateFuzzyFallbackRecognition({
        fuzzyMatches: body.fuzzyMatches,
        supabase: auth.supabase,
        origin,
        scanContext,
        topFuzzyNameFromClient,
        scanSessionId: body.scanSessionId ?? null,
        scanAttemptId: body.scanAttemptId ?? null,
        sourceScreen,
      });
    }

    if (!recognition) {
      return NextResponse.json({
        ok: false,
        error: "disambiguate_failed",
        code: parsed?.primary ? "validation_failed" : "parse_failed",
      });
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
    return NextResponse.json({ ok: false, error: "disambiguate_failed" }, { status: 502 });
  }
}
