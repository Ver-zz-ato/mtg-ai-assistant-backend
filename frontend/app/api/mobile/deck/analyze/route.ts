import { NextRequest, NextResponse } from "next/server";
import { runDeckAnalyzeCore } from "@/app/api/deck/analyze/route";
import { generateAppSafeDeckExplanation } from "@/lib/deck/analyze-app-explainer";
import { getUserAndSupabase } from "@/lib/api/get-user-from-request";
import { rowsToDeckTextForAnalysis } from "@/lib/deck/formatCompliance";
import { deckHash } from "@/lib/deck/deck-context-summary";
import { getServerSupabase } from "@/lib/server-supabase";
import { hashCacheKey, supabaseCacheGet, supabaseCacheSet } from "@/lib/utils/supabase-cache";

export const runtime = "nodejs";
const MOBILE_ANALYZE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MOBILE_ANALYZE_CACHE_VERSION = 2;

function pickTrimmedString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

async function resolveMobileAnalyzeCacheKey(req: NextRequest, parsedBody: Record<string, unknown>): Promise<string | null> {
  const requestFormat = pickTrimmedString(parsedBody.format) ?? "Commander";
  const requestCommander = pickTrimmedString(parsedBody.commander);
  let deckText = pickTrimmedString(parsedBody.deckText) ?? null;

  if (!deckText && typeof parsedBody.deckId === "string" && parsedBody.deckId.trim()) {
    const { supabase, user } = await getUserAndSupabase(req);
    if (!user) return null;
    const deckId = parsedBody.deckId.trim();
    const { data: deckRow } = await supabase
      .from("decks")
      .select("deck_text, commander, format, user_id")
      .eq("id", deckId)
      .maybeSingle();
    const deck = deckRow as { deck_text?: string | null; commander?: string | null; format?: string | null; user_id?: string | null } | null;
    if (!deck || deck.user_id !== user.id) return null;
    const fmt = pickTrimmedString(parsedBody.format) ?? pickTrimmedString(deck.format) ?? "Commander";
    const { data: cards } = await supabase
      .from("deck_cards")
      .select("name, qty, zone")
      .eq("deck_id", deckId)
      .limit(400);
    if (cards?.length) {
      deckText = rowsToDeckTextForAnalysis(cards as Array<{ name: string; qty: number; zone?: string | null }>, fmt);
    } else {
      deckText = pickTrimmedString(deck.deck_text) ?? null;
    }
  }

  if (!deckText) return null;
  return await hashCacheKey({
    cache_version: MOBILE_ANALYZE_CACHE_VERSION,
    model: "mobile-deck-analyze-response",
    sysPromptHash: "app-safe-explainer",
    intent: "mobile_deck_analyze",
    normalized_user_text: "",
    deck_context_included: true,
    deck_hash: deckHash(deckText),
    tier: "mobile",
    locale: null,
    scope: [
      requestFormat.toLowerCase(),
      requestCommander?.toLowerCase() ?? "",
      pickTrimmedString(parsedBody.sourcePage) ?? pickTrimmedString(parsedBody.source_page) ?? "",
    ].join("|"),
  });
}

export async function POST(req: NextRequest) {
  try {
    let requestMode: "deckId" | "deckText" | "unknown" = "unknown";
    let requestCommander: string | null = null;
    let requestFormat: string | null = null;
    /** Single read: runDeckAnalyzeCore also needs this JSON for usageSource/sourcePage; a second req.json() can be empty. */
    let parsedBody: Record<string, unknown> = {};
    try {
      parsedBody = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const hasDeckId = typeof parsedBody.deckId === "string" && parsedBody.deckId.trim().length > 0;
      const hasDeckText =
        typeof parsedBody.deckText === "string" && parsedBody.deckText.trim().length > 0;
      requestMode = hasDeckId ? "deckId" : hasDeckText ? "deckText" : "unknown";
      requestCommander = pickTrimmedString(parsedBody.commander);
      requestFormat = pickTrimmedString(parsedBody.format);
    } catch {
      requestMode = "unknown";
    }
    console.log("[mobile/deck/analyze][debug] before core", {
      requestMode,
    });
    const cacheKey = await resolveMobileAnalyzeCacheKey(req, parsedBody).catch(() => null);
    const cacheSupabase = cacheKey ? await getServerSupabase() : null;
    if (cacheKey && cacheSupabase) {
      const cached = await supabaseCacheGet(cacheSupabase, "ai_private_cache", cacheKey);
      if (cached?.text) {
        try {
          const cachedBody = JSON.parse(cached.text) as Record<string, unknown>;
          return NextResponse.json(
            {
              ...cachedBody,
              cacheHit: true,
              cacheKind: "mobile_deck_analyze",
            },
            { status: 200 }
          );
        } catch {
          // Bad cache entry should not block fresh analysis.
        }
      }
    }

    const coreRes = await runDeckAnalyzeCore(req, {
      includeValidatedNarrative: false,
      parsedBody,
    });
    const status = coreRes.status;
    const body = (await coreRes.json().catch(() => ({}))) as Record<string, unknown>;
    const coreKeys = Object.keys(body);
    const coreAnalysisValidationErrors = parseStringArray(body.analysis_validation_errors);
    const coreAnalysisValidationWarnings = parseStringArray(body.analysis_validation_warnings);
    console.log("[mobile/deck/analyze][debug] after core", {
      status,
      coreOk: coreRes.ok,
      keyCount: coreKeys.length,
      keys: coreKeys,
      hasAnalysis: typeof body.analysis === "string" || body.analysis != null,
      hasAnalysisJson: body.analysis_json != null,
      hasAnalysisValidationErrors: Array.isArray(body.analysis_validation_errors),
      hasValidatedAnalysisOk: Object.prototype.hasOwnProperty.call(body, "validated_analysis_ok"),
      hasValidatedAnalysisCode: Object.prototype.hasOwnProperty.call(body, "validated_analysis_code"),
      analysisValidationErrorCount: coreAnalysisValidationErrors.length,
      analysisValidationErrorSample: coreAnalysisValidationErrors[0]?.slice(0, 200),
      analysisValidationWarningCount: coreAnalysisValidationWarnings.length,
    });

    if (!coreRes.ok) {
      const code = pickTrimmedString(body.code) ?? `HTTP_${status}`;
      const message =
        pickTrimmedString(body.error) ??
        pickTrimmedString(body.message) ??
        `Analyze returned ${status}.`;
      return NextResponse.json(
        {
          ok: false,
          partial: false,
          code,
          message,
        },
        { status }
      );
    }

    const score = typeof body.score === "number" ? body.score : null;
    const suggestions = Array.isArray(body.suggestions)
      ? (body.suggestions as Array<{ card?: string; reason?: string }>)
      : [];
    const whatsGood = parseStringArray(body.whatsGood);
    const quickFixes = parseStringArray(body.quickFixes);
    const issues = parseStringArray(body.issues);
    const fixes = parseStringArray(body.fixes);
    const priority = parseStringArray(body.priority);
    const validationErrors = parseStringArray(body.analysis_validation_errors);
    const validationWarnings = parseStringArray(body.analysis_validation_warnings);
    const promptVersion =
      pickTrimmedString(body.prompt_version) ??
      pickTrimmedString(body.prompt_version_id);

    const responseCommander =
      requestCommander ?? pickTrimmedString(body.commander) ?? null;
    const responseFormat =
      requestFormat ?? pickTrimmedString(body.format) ?? "Commander";

    let analysis = null as Awaited<
      ReturnType<typeof generateAppSafeDeckExplanation>
    > | null;
    let partial = false;
    let code: string | null = null;
    let message: string | null = null;
    try {
      analysis = await generateAppSafeDeckExplanation({
        score,
        whatsGood,
        quickFixes,
        suggestions,
        counts: (body.counts as Record<string, unknown> | undefined) ?? null,
        commander: responseCommander,
        format: responseFormat,
        userId: null,
        isPro: false,
      });
      console.log("[mobile/deck/analyze][debug] after explainer", {
        hasExplainerSummary: typeof analysis?.summary === "string" && analysis.summary.trim().length > 0,
        hasExplainerArchetype:
          typeof analysis?.archetype === "string" && analysis.archetype.trim().length > 0,
        hasExplainerGamePlan:
          typeof analysis?.game_plan === "string" && analysis.game_plan.trim().length > 0,
        suggestionExplanationCount: Array.isArray(analysis?.suggestion_explanations)
          ? analysis.suggestion_explanations.length
          : 0,
      });
    } catch {
      partial = true;
      code = "ANALYSIS_EXPLANATION_UNAVAILABLE";
      message = "Detailed AI explanation unavailable for this run.";
      analysis = null;
      console.log("[mobile/deck/analyze][debug] explainer threw", {
        partial,
        code,
        message,
      });
    }

    console.log("[mobile/deck/analyze]", {
      status,
      requestMode,
      ok: true,
      partial,
      code,
      validationErrorCount: validationErrors.length,
      validationErrorSample: validationErrors[0]?.slice(0, 200),
      analysisNulled: analysis === null,
    });
    console.log("[mobile/deck/analyze][debug] final response", {
      ok: true,
      partial,
      code,
      message,
      hasAnalysis: analysis !== null,
      validationErrorCount: validationErrors.length,
      validationErrorSample: validationErrors[0]?.slice(0, 200),
    });
    const responseBody = {
      ok: true,
      partial,
      code,
      message,
      score,
      issues,
      fixes,
      priority,
      whatsGood,
      quickFixes,
      suggestions,
      analysis,
      validationErrors,
      validationWarnings,
      promptVersion,
    };
    if (cacheKey && cacheSupabase && !partial) {
      await supabaseCacheSet(cacheSupabase, "ai_private_cache", cacheKey, {
        text: JSON.stringify(responseBody),
        usage: { route: "/api/mobile/deck/analyze", cache_version: MOBILE_ANALYZE_CACHE_VERSION },
        fallback: false,
      }, MOBILE_ANALYZE_CACHE_TTL_MS).catch(() => undefined);
    }
    return NextResponse.json(responseBody, { status });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unexpected mobile analyze error";
    return NextResponse.json(
      {
        ok: false,
        code: "MOBILE_ANALYZE_INTERNAL_ERROR",
        message,
        partial: false,
        result: null,
      },
      { status: 500 }
    );
  }
}
