import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DECK_COMPARE_PRO } from "@/lib/feature-limits";
import {
  buildComparisonSummaryLine,
  buildMobileDeckCompareSystemPrompt,
  buildMobileDeckCompareUserPrompt,
} from "@/lib/mobile/deck-compare-mobile-prompt";
import {
  normalizeMobileDeckCompareResponse,
  parseJsonObjectFromLlmText,
} from "@/lib/mobile/deck-compare-mobile-response";

export const runtime = "nodejs";

const ROUTE_PATH = "/api/mobile/deck/compare-ai";

export async function POST(req: NextRequest) {
  try {
    let supabase = await createClient();
    let {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const authHeader = req.headers.get("Authorization");
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (bearerToken) {
        const { createClientWithBearerToken } = await import("@/lib/server-supabase");
        const bearerSupabase = createClientWithBearerToken(bearerToken);
        const {
          data: { user: bearerUser },
        } = await bearerSupabase.auth.getUser();
        if (bearerUser) {
          user = bearerUser;
          supabase = bearerSupabase;
        }
      }
    }

    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { checkProStatus } = await import("@/lib/server-pro-check");
    const isPro = await checkProStatus(user.id);

    if (!isPro) {
      try {
        const { logOpsEvent } = await import("@/lib/ops-events");
        await logOpsEvent(supabase, {
          event_type: "ops_pro_access_denied",
          route: ROUTE_PATH,
          status: "ok",
          reason: "pro_required",
          user_id: user.id,
          source: "deck_compare_mobile_ai",
        });
      } catch {
        /* non-fatal */
      }
      return NextResponse.json(
        {
          ok: false,
          error:
            "AI deck comparison is a Pro feature. Upgrade to unlock AI-powered deck analysis!",
        },
        { status: 403 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "OpenAI API key not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const { resolveAiUsageSourceForRequest } = await import("@/lib/ai/manatap-client-origin");
    const usageSource = resolveAiUsageSourceForRequest(req, body, null);
    const sourcePage =
      (typeof body.sourcePage === "string"
        ? body.sourcePage
        : typeof body.source_page === "string"
          ? body.source_page
          : null
      )?.trim() || null;

    const { decks, comparison } = body as {
      decks?: unknown;
      comparison?: unknown;
    };

    if (typeof decks !== "string" || !decks.trim()) {
      return NextResponse.json({ ok: false, error: "Missing decks data" }, { status: 400 });
    }
    if (!comparison || typeof comparison !== "object") {
      return NextResponse.json({ ok: false, error: "Missing comparison data" }, { status: 400 });
    }

    const comp = comparison as {
      sharedCards?: unknown;
      uniqueToDecks?: Array<{ deckIndex?: number; cards?: unknown }>;
    };
    const deckCount = Array.isArray(comp.uniqueToDecks) ? comp.uniqueToDecks.length : 2;
    const safeDeckCount = deckCount >= 3 ? 3 : 2;

    const formatRaw = String(body?.format ?? body?.deckFormat ?? "Commander").trim();
    const formatLabel =
      formatRaw.length > 0
        ? formatRaw.charAt(0).toUpperCase() + formatRaw.slice(1).toLowerCase()
        : "Commander";

    const comparisonSummary = buildComparisonSummaryLine({
      comparison: comp,
    });

    const systemPrompt = buildMobileDeckCompareSystemPrompt(formatLabel);
    const userPrompt = buildMobileDeckCompareUserPrompt({
      decks: decks.trim(),
      comparisonSummary,
      formatLabel,
    });

    const { checkDurableRateLimit } = await import("@/lib/api/durable-rate-limit");
    const { hashString } = await import("@/lib/guest-tracking");
    const userKeyHash = `user:${await hashString(user.id)}`;
    /** Share daily quota with web compare — same feature budget. */
    const rateLimit = await checkDurableRateLimit(
      supabase,
      userKeyHash,
      "/api/deck/compare-ai",
      DECK_COMPARE_PRO,
      1
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          code: "RATE_LIMIT_DAILY",
          error: "You've reached your daily limit. Contact support if you need higher limits.",
          resetAt: rateLimit.resetAt,
        },
        { status: 429 }
      );
    }

    const model = process.env.MODEL_DECK_COMPARE_MOBILE || process.env.MODEL_DECK_COMPARE || "gpt-4o-mini";

    try {
      const { callLLM } = await import("@/lib/ai/unified-llm-client");
      const response = await callLLM(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        {
          route: ROUTE_PATH,
          feature: "deck_compare_mobile",
          model,
          fallbackModel: "gpt-4o-mini",
          timeout: 90000,
          maxTokens: 4096,
          apiType: "chat",
          userId: user.id,
          isPro: true,
          source_page: sourcePage,
          source: usageSource ?? null,
          jsonResponse: true,
          promptPreview: userPrompt.slice(0, 500),
        }
      );

      let parsed = parseJsonObjectFromLlmText(response.text);
      if (parsed == null) {
        parsed = { _parse_error: true };
      }

      const normalized = normalizeMobileDeckCompareResponse(parsed, safeDeckCount, response.actualModel);

      try {
        const { stripIllegalBracketCardTokensFromText } = await import("@/lib/deck/recommendation-legality");
        const strip = async (s: string) =>
          stripIllegalBracketCardTokensFromText(s, formatLabel, { logPrefix: ROUTE_PATH });
        normalized.summary.one_line_verdict = await strip(normalized.summary.one_line_verdict);
        normalized.summary.better_for_fast_tables = await strip(normalized.summary.better_for_fast_tables);
        normalized.summary.better_for_slower_pods = await strip(normalized.summary.better_for_slower_pods);
        normalized.summary.more_consistent = await strip(normalized.summary.more_consistent);
        normalized.summary.highest_ceiling = await strip(normalized.summary.highest_ceiling);
        for (const key of Object.keys(normalized.sections) as (keyof typeof normalized.sections)[]) {
          const arr = normalized.sections[key];
          for (let i = 0; i < arr.length; i++) {
            arr[i] = await strip(arr[i]);
          }
        }
        for (const key of Object.keys(normalized.full_analysis) as (keyof typeof normalized.full_analysis)[]) {
          normalized.full_analysis[key] = await strip(normalized.full_analysis[key]);
        }
        for (const row of normalized.ui.verdict_cards) {
          row.label = await strip(row.label);
          row.winner = await strip(row.winner);
        }
        normalized.ui.deck_strengths.deck_a = await Promise.all(
          normalized.ui.deck_strengths.deck_a.map((s) => strip(s))
        );
        normalized.ui.deck_strengths.deck_b = await Promise.all(
          normalized.ui.deck_strengths.deck_b.map((s) => strip(s))
        );
        if (normalized.ui.deck_strengths.deck_c?.length) {
          normalized.ui.deck_strengths.deck_c = await Promise.all(
            normalized.ui.deck_strengths.deck_c.map((s) => strip(s))
          );
        }
        for (const sc of normalized.ui.scenario_cards) {
          sc.label = await strip(sc.label);
          sc.winner = await strip(sc.winner);
          sc.reason = await strip(sc.reason);
        }
      } catch {
        /* non-fatal */
      }

      return NextResponse.json(normalized);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to generate analysis";
      console.error("[mobile/deck/compare-ai] AI error:", e);
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("[mobile/deck/compare-ai] route error:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
