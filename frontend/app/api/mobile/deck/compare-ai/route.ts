import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_FALLBACK_MODEL, DEFAULT_PRO_DECK_MODEL } from "@/lib/ai/default-models";
import { createClient } from "@/lib/supabase/server";
import { DECK_COMPARE_AI_MOBILE_FREE_DAILY } from "@/lib/feature-limits";
import {
  buildComparisonSummaryLine,
  buildMobileDeckCompareSystemPrompt,
  buildMobileDeckCompareUserPrompt,
} from "@/lib/mobile/deck-compare-mobile-prompt";
import {
  normalizeMobileDeckCompareResponse,
  parseJsonObjectFromLlmText,
} from "@/lib/mobile/deck-compare-mobile-response";
import {
  buildAiRouteExecutionContext,
  buildCompactGroundingPacket,
  buildTierCapabilityBlock,
  runStructuredAiFlow,
} from "@/lib/ai/structured-pipeline";
import { buildDeckCompareGrounding } from "@/lib/mobile/deck-compare-grounding";

export const runtime = "nodejs";

const ROUTE_PATH = "/api/mobile/deck/compare-ai";
const FEATURE_KEY = "deck_compare_mobile";
const RATE_LIMIT_KEY = ROUTE_PATH;

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

    // Free: server-enforced daily cap; Pro: no durable limit (client may still hint limits for UX only).
    if (!isPro) {
      const { checkDurableRateLimit } = await import("@/lib/api/durable-rate-limit");
      const { hashString } = await import("@/lib/guest-tracking");
      const userKeyHash = `user:${await hashString(user.id)}`;
      const rateLimit = await checkDurableRateLimit(
        supabase,
        userKeyHash,
        "deck_compare_ai",
        DECK_COMPARE_AI_MOBILE_FREE_DAILY,
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

    const model = process.env.MODEL_DECK_COMPARE_MOBILE || process.env.MODEL_DECK_COMPARE || DEFAULT_PRO_DECK_MODEL;
    const executionContext = buildAiRouteExecutionContext({
      userId: user.id,
      isGuest: false,
      isPro,
      source: usageSource ?? null,
      sourcePage,
      featureKey: FEATURE_KEY,
      rateLimitKey: RATE_LIMIT_KEY,
    });
    const grounded = await buildDeckCompareGrounding(decks.trim(), formatLabel).catch(() => null);
    const deterministicNormalized = normalizeMobileDeckCompareResponse(
      {
        summary: {
          better_for_fast_tables: grounded?.matrix.fasterDeck || "Deck A",
          better_for_slower_pods: grounded?.matrix.lateGameDeck || (safeDeckCount >= 2 ? "Deck B" : "Deck A"),
          more_consistent: grounded?.matrix.resilientDeck || "Deck A",
          highest_ceiling: grounded?.matrix.explosiveDeck || (safeDeckCount >= 2 ? "Deck B" : "Deck A"),
          one_line_verdict: grounded?.matrix.verdict || "Each deck has a distinct lane; compare speed, resilience, and closing power.",
        },
        sections: {
          key_differences: grounded?.decks.map((deck) => `${deck.label}: ${deck.summary}`) ?? [],
          strategy: [
            grounded ? `${grounded.matrix.fasterDeck} is the cleaner fast-start list.` : "One list is better at fast starts.",
            grounded ? `${grounded.matrix.interactionDeck} carries the stronger interaction package.` : "Another list is more interactive.",
          ],
          strengths_weaknesses: grounded?.decks.map((deck) => `${deck.label} plays as a ${deck.speed} ${deck.archetypes[0] || "midrange"} shell.`) ?? [],
          recommended_scenarios: [
            grounded ? `Pick ${grounded.matrix.fasterDeck} when you need quicker pressure.` : "Pick the faster deck for aggressive tables.",
            grounded ? `Pick ${grounded.matrix.lateGameDeck} when you expect longer games.` : "Pick the slower deck for grindier games.",
          ],
        },
        full_analysis: {
          key_differences: grounded?.decks.map((deck) => `${deck.label}: ${deck.summary}`).join(" ") || "",
          strategy: grounded?.matrix.verdict || "",
          strengths_and_weaknesses: grounded
            ? `${grounded.matrix.interactionDeck} is better at interacting, while ${grounded.matrix.explosiveDeck} has the more explosive starts.`
            : "",
          recommendations: "Tune lands, ramp, and interaction around the pace you expect to face.",
          best_in_different_scenarios: grounded
            ? `${grounded.matrix.fasterDeck} is better for fast games, while ${grounded.matrix.lateGameDeck} is better for grindier games.`
            : "",
        },
      },
      safeDeckCount,
      "deterministic",
    );

    try {
      const groundingPacket = buildCompactGroundingPacket({
        title: "GROUND TRUTH",
        format: formatLabel,
        lines: [
          comparisonSummary,
          grounded?.decks.map((deck) => `${deck.label}: ${deck.summary}`).join(" || ") || "",
          grounded
            ? `Deterministic winners: fast=${grounded.matrix.fasterDeck}, resilience=${grounded.matrix.resilientDeck}, late=${grounded.matrix.lateGameDeck}, interaction=${grounded.matrix.interactionDeck}.`
            : "",
        ],
      });
      const flowResult = await runStructuredAiFlow({
        context: {
          ...executionContext,
          model,
          fallbackModel: DEFAULT_FALLBACK_MODEL,
        },
        routePath: ROUTE_PATH,
        deterministic: deterministicNormalized,
        judge: {
          passName: "judge",
          maxTokens: 1800,
          buildMessages: () => [
            {
              role: "system",
              content: [
                buildMobileDeckCompareSystemPrompt(formatLabel),
                "Use the deterministic comparison matrix as authoritative grounding. Do not invent card presence or Commander-only assumptions for 60-card formats.",
                buildTierCapabilityBlock(executionContext),
              ].join("\n\n"),
            },
            {
              role: "user",
              content: [
                userPrompt,
                "",
                groundingPacket,
                "",
                "Return the same JSON shape, but improve clarity and specificity while staying aligned to the grounded winners.",
              ].join("\n"),
            },
          ],
          parse: (text, current) => {
            const parsed = parseJsonObjectFromLlmText(text);
            return parsed ? normalizeMobileDeckCompareResponse(parsed, safeDeckCount, model) : current;
          },
        },
        writer: {
          passName: "writer",
          maxTokens: 1500,
          buildMessages: (current) => [
            {
              role: "system",
              content: [
                buildMobileDeckCompareSystemPrompt(formatLabel),
                "Rewrite for mobile clarity. Keep verdicts tight, non-repetitive, and grounded.",
              ].join("\n\n"),
            },
            {
              role: "user",
              content: [
                groundingPacket,
                "",
                `Current JSON draft:\n${JSON.stringify(current)}`,
                "",
                "Return improved JSON only. Keep the same shape and make the reasons sharper.",
              ].join("\n"),
            },
          ],
          parse: (text, current) => {
            const parsed = parseJsonObjectFromLlmText(text);
            return parsed ? normalizeMobileDeckCompareResponse(parsed, safeDeckCount, model) : current;
          },
        },
        critic: {
          passName: "critic",
          maxTokens: 1200,
          buildMessages: (current) => [
            {
              role: "system",
              content: "Act as a final consistency critic. Only return corrected JSON if the draft drifts from the deterministic winners or repeats itself too much.",
            },
            {
              role: "user",
              content: [
                groundingPacket,
                "",
                `Draft JSON:\n${JSON.stringify(current)}`,
                "",
                "If it is already aligned and concise, return it unchanged. Otherwise fix only the inconsistent or repetitive parts.",
              ].join("\n"),
            },
          ],
          parse: (text, current) => {
            const parsed = parseJsonObjectFromLlmText(text);
            return parsed ? normalizeMobileDeckCompareResponse(parsed, safeDeckCount, model) : current;
          },
        },
      });

      const normalized = flowResult.value;

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
      return NextResponse.json(deterministicNormalized);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("[mobile/deck/compare-ai] route error:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
