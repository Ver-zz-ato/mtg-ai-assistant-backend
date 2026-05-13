/**
 * POST /api/cards/recognize-image — AI fallback for card recognition.
 *
 * Mobile Scan Card: optional `scanContext` JSON (normalized OCR, candidates, fuzzy hints, trigger reason).
 * - Request: multipart/form-data with "image" (file), optional "scanContext" (JSON string)
 * - Auth: Optional (Bearer for mobile; guest allowed)
 * - Response: { ok, recognition: { ... } }
 */

import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_FALLBACK_MODEL, DEFAULT_PRO_DECK_MODEL } from "@/lib/ai/default-models";
import { createClient } from "@/lib/supabase/server";
import { cleanCardName, stringSimilarity } from "@/lib/deck/cleanCardName";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";
import { recordAiUsage } from "@/lib/ai/log-usage";
import { costUSD } from "@/lib/ai/pricing";
import { SCAN_AI_FREE, SCAN_AI_GUEST, SCAN_AI_PRO } from "@/lib/feature-limits";
import { checkDurableRateLimit } from "@/lib/api/durable-rate-limit";
import { getUserAndSupabase } from "@/lib/api/get-user-from-request";
import { getGuestToken } from "@/lib/api/get-guest-token";
import { hashGuestToken, hashString } from "@/lib/guest-tracking";
import {
  canAutoAddScannerRecognition,
  inferScannerEvidence,
  normalizeScannerText,
  scannerConfidenceScore,
  type ScannerConfidence,
  type ScannerContextPayload,
  type ScannerEvidence,
} from "@/lib/scanner/recognition";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MODEL = process.env.MODEL_SCAN_RECOGNIZE || DEFAULT_FALLBACK_MODEL;
const PRO_MODEL = process.env.MODEL_SCAN_RECOGNIZE_PRO || process.env.MODEL_SCAN_RECOGNIZE || DEFAULT_PRO_DECK_MODEL;
const TIMEOUT_MS = 20000;
const ROUTE_PATH = "/api/cards/recognize-image";
const DEFAULT_SOURCE_PAGE = "app_scan_ai_fallback";

type ScanContextPayload = ScannerContextPayload & {
  normalizedOcrText?: string;
  ocrCandidates?: string[];
  fuzzyMatches?: Array<{ name: string; score?: number }>;
  aiTriggerReason?: string;
};

type AssistMode = "fallback" | "improve";
type UserTier = "guest" | "free" | "pro";
type RecognitionEvidence = ScannerEvidence;

function norm(s: string) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`´]/g, "'")
    .trim();
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

type FuzzyValidateResult = { validated: string; alternatives: string[]; source?: string };

async function fuzzyValidate(
  guessed: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
  origin?: string
): Promise<FuzzyValidateResult> {
  const q0 = cleanCardName(guessed);
  if (!q0 || q0.length < 2) return { validated: "", alternatives: [] };
  const qn = norm(q0);

  try {
    const { data: exact } = await supabase.from("scryfall_cache").select("name").ilike("name", q0).limit(1);
    if (exact?.length) return { validated: exact[0].name, alternatives: [], source: "cache_exact" };

    const escaped = q0.replace(/[%_]/g, "\\$&");
    const { data: contains } = await supabase
      .from("scryfall_cache")
      .select("name")
      .ilike("name", `%${escaped}%`)
      .limit(5);
    if (contains?.length) {
      const sorted = contains
        .map((r) => ({ name: r.name, score: stringSimilarity(qn, norm(r.name)) }))
        .sort((a, b) => b.score - a.score);
      return {
        validated: sorted[0].name,
        alternatives: sorted.slice(1, 4).map((r) => r.name),
        source: "cache_contains",
      };
    }

    if (origin) {
      try {
        const fr = await fetch(`${origin}/api/cards/fuzzy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names: [q0] }),
        });
        const j = (await fr.json().catch(() => ({}))) as {
          ok?: boolean;
          results?: Record<string, { suggestion?: string; all?: string[]; matches?: Array<{ name: string }> }>;
        };
        if (j?.ok && j.results) {
          const entry = j.results[q0];
          const matches = entry?.matches;
          if (Array.isArray(matches) && matches.length > 0) {
            const sug = String(matches[0].name ?? "").trim();
            const rest = matches
              .slice(1, 4)
              .map((m) => String(m.name ?? "").trim())
              .filter(Boolean);
            if (sug) return { validated: sug, alternatives: rest, source: "fuzzy_api_matches" };
          }
          const sug = entry?.suggestion?.trim();
          const all = Array.isArray(entry?.all)
            ? entry.all.map((s) => String(s).trim()).filter(Boolean)
            : [];
          if (sug) {
            const alts = all.filter((n) => norm(n) !== norm(sug)).slice(0, 3);
            return { validated: sug, alternatives: alts, source: "fuzzy_api_legacy" };
          }
        }
      } catch {
        /* fall through */
      }
    }

    const r = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(q0)}`, {
      cache: "no-store",
    });
    const j = (await r.json().catch(() => ({}))) as { name?: string };
    if (j?.name) return { validated: String(j.name).trim(), alternatives: [], source: "scryfall_named_fuzzy" };
  } catch {}
  return { validated: "", alternatives: [] };
}

function parseAiResponse(text: string): {
  primary: string;
  alternatives: string[];
  confidence: "high" | "medium" | "low";
  reason: string;
} | null {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const j = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const primary = String(j?.primary ?? "").trim();
    const alternatives = Array.isArray(j?.alternatives)
      ? (j.alternatives as string[]).slice(0, 3).filter((s) => typeof s === "string" && s.trim())
      : [];
    const conf = String(j?.confidence ?? "low").toLowerCase();
    const confidence = ["high", "medium", "low"].includes(conf) ? (conf as "high" | "medium" | "low") : "low";
    const reason = String(j?.reason ?? "").trim() || "AI recognition";
    return { primary, alternatives, confidence, reason };
  } catch {
    return null;
  }
}

function trimFormString(formData: FormData, ...keys: string[]): string | null {
  for (const key of keys) {
    const raw = formData.get(key);
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return null;
}

function parseAssistMode(raw: string | null): AssistMode {
  return raw?.toLowerCase() === "improve" ? "improve" : "fallback";
}

function getIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0]?.trim() || "unknown" : req.headers.get("x-real-ip") || "unknown";
}

function isSupabaseAnonymousUser(user: unknown): boolean {
  return Boolean((user as { is_anonymous?: unknown } | null)?.is_anonymous === true);
}

function confidenceScore(confidence: ScannerConfidence): number {
  return scannerConfidenceScore(confidence);
}

function contextAgreesWithName(ctx: ScanContextPayload | null, name: string): boolean {
  const target = norm(name);
  if (!target) return false;
  if (ctx?.fuzzyMatches?.some((m) => norm(m.name) === target)) return true;
  if (ctx?.ocrCandidates?.some((c) => norm(c) === target || target.includes(norm(c)) || norm(c).includes(target))) {
    return true;
  }
  const ocr = norm(ctx?.normalizedOcrText || "");
  return Boolean(ocr && (ocr.includes(target) || target.includes(ocr)));
}

function inferEvidence(params: {
  parsedReason: string;
  ctx: ScanContextPayload | null;
  validatedName: string;
  validationSource: string;
}): RecognitionEvidence {
  return inferScannerEvidence(params);
}

function canAutoAddRecognition(params: {
  confidence: ScannerConfidence;
  validationSource: string;
  ctx: ScanContextPayload | null;
  validatedName: string;
}): boolean {
  return canAutoAddScannerRecognition(params);
}

function adjustConfidence(
  model: "high" | "medium" | "low",
  triggerReason: string | undefined,
  validatedName: string,
  topFuzzyNameFromClient: string | undefined
): "high" | "medium" | "low" {
  if (model === "low") return "low";
  if (topFuzzyNameFromClient && validatedName && norm(validatedName) === norm(topFuzzyNameFromClient)) {
    return model;
  }
  const downrank = ["ambiguous_scores", "low_top_score", "short_text", "zero_matches", "no_text"];
  if (triggerReason && downrank.includes(triggerReason) && model === "high") {
    return "medium";
  }
  return model;
}

function rankAlternativesDeduped(
  primaryValidated: string,
  extras: string[],
  max: number
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (n: string) => {
    const t = n.trim();
    if (!t) return;
    const k = norm(t);
    if (seen.has(k)) return;
    if (norm(t) === norm(primaryValidated)) return;
    seen.add(k);
    out.push(t);
  };
  for (const e of extras) add(e);
  return out.slice(0, max);
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

    const { supabase, user } = await getUserAndSupabase(req);
    const isAnonymousUser = isSupabaseAnonymousUser(user);
    const realUserId = user && !isAnonymousUser ? user.id : null;
    let isPro = false;
    if (realUserId) {
      const { checkProStatus } = await import("@/lib/server-pro-check");
      isPro = await checkProStatus(realUserId);
    }
    const userTier: UserTier = realUserId ? (isPro ? "pro" : "free") : "guest";
    const dailyLimit = userTier === "pro" ? SCAN_AI_PRO : userTier === "free" ? SCAN_AI_FREE : SCAN_AI_GUEST;

    if (assistMode === "improve" && !isPro) {
      return NextResponse.json(
        {
          ok: false,
          code: "PRO_REQUIRED",
          error: "Improve with AI is a Pro feature.",
          tier: userTier,
          limit: dailyLimit,
          remaining: 0,
          resetAt: null,
          proRequired: true,
        },
        { status: 403 }
      );
    }

    const { guestToken } = await getGuestToken(req);
    const ip = getIp(req);
    const keyHash = realUserId
      ? `user:${await hashString(realUserId)}`
      : guestToken
        ? `guest:${await hashGuestToken(guestToken)}`
        : isAnonymousUser && user?.id
          ? `guest:${await hashString(`anonymous-user:${user.id}`)}`
          : `ip:${await hashString(ip)}`;
    const rateLimit = await checkDurableRateLimit(supabase, keyHash, ROUTE_PATH, dailyLimit, 1);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          code: "RATE_LIMIT_DAILY",
          error: "Daily scanner AI limit reached. Try again tomorrow.",
          tier: userTier,
          limit: rateLimit.limit,
          remaining: rateLimit.remaining,
          resetAt: rateLimit.resetAt ?? null,
          requiresAuth: userTier === "guest",
        },
        { status: 429 }
      );
    }

    const { allowAIRequest } = await import("@/lib/server/budgetEnforcement");
    const budgetCheck = await allowAIRequest(supabase);
    if (!budgetCheck.allow) {
      return NextResponse.json(
        {
          ok: false,
          code: "BUDGET_LIMIT",
          error: budgetCheck.reason || "Server AI budget limit reached. Try again later.",
          tier: userTier,
          limit: rateLimit.limit,
          remaining: rateLimit.remaining,
          resetAt: rateLimit.resetAt ?? null,
          requiresAuth: userTier === "guest",
        },
        { status: 429 }
      );
    }

    const buf = await blob.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    const dataUrl = `data:${blob.type || "image/jpeg"};base64,${base64}`;

    const userPrompt = buildRecognitionPrompt(scanContext);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const model = isPro || assistMode === "improve" ? PRO_MODEL : MODEL;
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
      user_id: realUserId,
      anon_id: realUserId ? null : keyHash,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: cost,
      route: "scan_recognize_image",
      source_page: sourcePage,
      source: usageSource ?? undefined,
      prompt_preview:
        `scan_session_id=${scanSessionId || ""}; scan_attempt_id=${scanAttemptId || ""}; source_screen=${sourceScreen || ""}; assist_mode=${assistMode}; ` +
        (scanContext ? "card recognition vision+context" : "card recognition vision"),
      response_preview: content?.slice(0, 200) ?? null,
      latency_ms: Date.now() - t0,
      user_tier: userTier,
      is_guest: userTier === "guest",
      scanner_session_id: scanSessionId,
      scanner_attempt_id: scanAttemptId,
      source_screen: sourceScreen,
      assist_mode: assistMode,
    }).catch(() => {});

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: "recognition_failed" }, { status: 502 });
    }

    const parsed = parseAiResponse(content);
    if (!parsed || !parsed.primary) {
      return NextResponse.json({
        ok: false,
        error: "recognition_failed",
      });
    }

    const origin = new URL(req.url).origin;
    const primaryRes = await fuzzyValidate(parsed.primary, supabase, origin);
    const altResults = await Promise.all(parsed.alternatives.slice(0, 3).map((a) => fuzzyValidate(a, supabase, origin)));

    const allValidated: string[] = [];
    if (primaryRes.validated) allValidated.push(primaryRes.validated);
    for (const p of altResults) {
      if (p.validated && !allValidated.some((n) => norm(n) === norm(p.validated))) {
        allValidated.push(p.validated);
      }
    }

    const bestValidated = primaryRes.validated || allValidated[0];
    if (!bestValidated) {
      return NextResponse.json({ ok: false, error: "recognition_failed" });
    }

    const extraFromAlts = altResults.flatMap((r) => (r.validated ? [r.validated] : [])).filter((n) => norm(n) !== norm(bestValidated));
    const mergedAlts = rankAlternativesDeduped(
      bestValidated,
      [...primaryRes.alternatives, ...extraFromAlts, ...allValidated.slice(1)],
      5
    );

    const finalConfidence = adjustConfidence(
      parsed.confidence,
      scanContext?.aiTriggerReason,
      bestValidated,
      topFuzzyNameFromClient
    );

    const validationSource = primaryRes.source ?? "unknown";
    const canAutoAdd = canAutoAddRecognition({
      confidence: finalConfidence,
      validationSource,
      ctx: scanContext,
      validatedName: bestValidated,
    });
    const evidence = inferEvidence({
      parsedReason: parsed.reason,
      ctx: scanContext,
      validatedName: bestValidated,
      validationSource,
    });

    return NextResponse.json({
      ok: true,
      recognition: {
        source: "ai_vision",
        assist_mode: assistMode,
        guessed_name: parsed.primary,
        validated_name: bestValidated,
        confidence: finalConfidence,
        confidence_score: confidenceScore(finalConfidence),
        reason: parsed.reason,
        alternatives: mergedAlts,
        validation_source: validationSource,
        evidence,
        requires_confirmation: !canAutoAdd,
        can_auto_add: canAutoAdd,
        ai_trigger_reason: scanContext?.aiTriggerReason,
        top_fuzzy_name_before: topFuzzyNameFromClient,
        scan_session_id: scanSessionId,
        scan_attempt_id: scanAttemptId,
        source_screen: sourceScreen,
      },
      tier: userTier,
      limit: rateLimit.limit,
      remaining: rateLimit.remaining,
      resetAt: rateLimit.resetAt ?? null,
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      return NextResponse.json({ ok: false, error: "timeout" }, { status: 504 });
    }
    return NextResponse.json({ ok: false, error: "recognition_failed" }, { status: 502 });
  }
}
