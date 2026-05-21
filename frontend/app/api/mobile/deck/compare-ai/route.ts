import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_FALLBACK_MODEL, DEFAULT_FREE_MODEL } from "@/lib/ai/default-models";
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
import type { MobileDeckCompareSuccess } from "@/lib/mobile/deck-compare-mobile-response";
import {
  buildAiRouteExecutionContext,
  buildCompactGroundingPacket,
  buildTierCapabilityBlock,
  runStructuredAiFlow,
} from "@/lib/ai/structured-pipeline";
import { buildDeckCompareGrounding } from "@/lib/mobile/deck-compare-grounding";
import type { CompareDeckGrounding, DeterministicComparisonMatrix } from "@/lib/mobile/deck-compare-grounding";

export const runtime = "nodejs";

const ROUTE_PATH = "/api/mobile/deck/compare-ai";
const FEATURE_KEY = "deck_compare_mobile";
const RATE_LIMIT_KEY = ROUTE_PATH;

const CONTESTED = "Contested";

function isContestedWinner(value: string | null | undefined): boolean {
  return !value || /^(?:-|—|contested|tie|same list|no clear edge|table-dependent)$/i.test(value.trim());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceDeckSlots(text: string, decks: CompareDeckGrounding[]): string {
  let out = text;
  for (let i = 0; i < decks.length; i++) {
    const label = decks[i]?.label;
    if (!label) continue;
    out = out.replace(new RegExp(`\\bDeck\\s+${String.fromCharCode(65 + i)}\\b`, "gi"), label);
  }
  return out;
}

function normalizeWinnerToGroundedLabel(
  raw: string | null | undefined,
  decks: CompareDeckGrounding[],
): string {
  const value = String(raw || "").replace(/\s+/g, " ").trim();
  if (/^same list$/i.test(value)) return "Same list";
  if (isContestedWinner(value)) return CONTESTED;

  const slot = value.match(/\bDeck\s+([A-C])\b/i)?.[1]?.toUpperCase();
  if (slot) {
    const deck = decks[slot.charCodeAt(0) - 65];
    if (deck?.label) return deck.label;
  }

  const lowered = value.toLowerCase();
  for (const deck of decks) {
    if (deck.label && lowered.includes(deck.label.toLowerCase())) return deck.label;
  }

  const commanderMatches = decks.filter(
    (deck) => deck.commander && lowered.includes(deck.commander.toLowerCase()),
  );
  if (commanderMatches.length === 1) return commanderMatches[0].label;

  return CONTESTED;
}

function sentenceList(lines: string[]): string {
  return lines.filter(Boolean).join(" ");
}

function deterministicStrategyLines(grounded: { decks: CompareDeckGrounding[]; matrix: { fasterDeck: string; interactionDeck: string } }): string[] {
  const lines: string[] = [];
  if (isContestedWinner(grounded.matrix.fasterDeck)) {
    lines.push("Fast-start pressure is contested; lean on mulligans, opening curve, and matchup context.");
  } else {
    lines.push(`${grounded.matrix.fasterDeck} has the clearest fast-start plan.`);
  }
  if (isContestedWinner(grounded.matrix.interactionDeck)) {
    lines.push("Interaction is close enough that no deck has a clean construction edge.");
  } else {
    lines.push(`${grounded.matrix.interactionDeck} has the strongest interaction read.`);
  }
  return lines;
}

function deterministicScenarioLines(grounded: { matrix: { fasterDeck: string; lateGameDeck: string } }): string[] {
  return [
    isContestedWinner(grounded.matrix.fasterDeck)
      ? "For fast games, pick the list whose opening plan you pilot most confidently."
      : `${grounded.matrix.fasterDeck} is best when you need quicker pressure.`,
    isContestedWinner(grounded.matrix.lateGameDeck)
      ? "For grindier games, use matchup context instead of forcing a construction winner."
      : `${grounded.matrix.lateGameDeck} is best when you expect longer games.`,
  ];
}

function groundedDeckIntelligenceLine(deck: CompareDeckGrounding): string {
  const i = deck.intelligence;
  return [
    `${deck.label}${deck.commander ? ` (${deck.commander})` : ""}`,
    `intent=${i.intent}${i.secondaryIntent ? `/${i.secondaryIntent}` : ""}`,
    `power=${i.powerBand} ${i.powerScore}`,
    `tempo=${i.tempoScore}`,
    `consistency=${i.consistencyScore}`,
    `interaction=${i.interactionScore}`,
    `resilience=${i.resilienceScore}`,
    `closing=${i.closingScore}`,
    `mana=${i.manaQualityScore}`,
    `synergy=${i.synergyScore}`,
    i.commanderSynergyScore != null ? `commander_synergy=${i.commanderSynergyScore}` : "",
    i.estimatedPriceUsd != null ? `price=$${Math.round(i.estimatedPriceUsd)} ${i.priceTier}` : `price=${i.priceTier}`,
    i.keyCards.length ? `key_cards=${i.keyCards.slice(0, 5).join(", ")}` : "",
    i.engineCards.length ? `engines=${i.engineCards.slice(0, 3).join(", ")}` : "",
    i.payoffCards.length ? `payoffs=${i.payoffCards.slice(0, 3).join(", ")}` : "",
    i.premiumCards.length ? `premium=${i.premiumCards.slice(0, 3).join(", ")}` : "",
    i.weakSignals.length ? `risks=${i.weakSignals.slice(0, 3).join("; ")}` : "",
  ].filter(Boolean).join(" | ");
}

function applyGroundedCompareGuardrails(
  result: MobileDeckCompareSuccess,
  grounded: { decks: CompareDeckGrounding[]; matrix: DeterministicComparisonMatrix } | null,
): MobileDeckCompareSuccess {
  if (!grounded?.decks.length) return result;

  const groundedWinners = [
    grounded.matrix.fasterDeck,
    grounded.matrix.lateGameDeck,
    grounded.matrix.resilientDeck,
    grounded.matrix.explosiveDeck,
  ].map((winner) => normalizeWinnerToGroundedLabel(winner, grounded.decks));

  result.summary.better_for_fast_tables = groundedWinners[0] || CONTESTED;
  result.summary.better_for_slower_pods = groundedWinners[1] || CONTESTED;
  result.summary.more_consistent = groundedWinners[2] || CONTESTED;
  result.summary.highest_ceiling = groundedWinners[3] || CONTESTED;
  result.summary.one_line_verdict = replaceDeckSlots(result.summary.one_line_verdict || grounded.matrix.verdict, grounded.decks);

  const defaultLabels = ["Fast games", "Grindier games", "More consistent", "Highest ceiling"];
  result.ui.verdict_cards = defaultLabels.map((label, index) => ({
    label: result.ui.verdict_cards[index]?.label || label,
    winner: groundedWinners[index] || CONTESTED,
  }));

  result.sections.key_differences = (
    result.sections.key_differences.length
      ? result.sections.key_differences
      : grounded.decks.map((deck) => `${deck.label}: ${deck.summary}`)
  ).map((line) => replaceDeckSlots(line, grounded.decks));

  result.sections.strategy = (
    result.sections.strategy.length ? result.sections.strategy : deterministicStrategyLines(grounded)
  ).map((line) => replaceDeckSlots(line, grounded.decks));

  result.sections.strengths_weaknesses = (
    result.sections.strengths_weaknesses.length
      ? result.sections.strengths_weaknesses
      : grounded.decks.map((deck) => `${deck.label} is a ${deck.intelligence.powerBand} ${deck.intelligence.intent} shell with ${deck.intelligence.matchupRead}`)
  ).map((line) => replaceDeckSlots(line, grounded.decks));

  result.sections.recommended_scenarios = (
    result.sections.recommended_scenarios.length
      ? result.sections.recommended_scenarios
      : deterministicScenarioLines(grounded)
  ).map((line) => replaceDeckSlots(line, grounded.decks));

  result.full_analysis.key_differences = replaceDeckSlots(
    result.full_analysis.key_differences || sentenceList(result.sections.key_differences),
    grounded.decks,
  );
  result.full_analysis.strategy = replaceDeckSlots(
    result.full_analysis.strategy || sentenceList(result.sections.strategy),
    grounded.decks,
  );
  result.full_analysis.strengths_and_weaknesses = replaceDeckSlots(
    result.full_analysis.strengths_and_weaknesses || sentenceList(result.sections.strengths_weaknesses),
    grounded.decks,
  );
  result.full_analysis.recommendations = replaceDeckSlots(
    result.full_analysis.recommendations || "Tune lands, ramp, and interaction around the pace you expect to face.",
    grounded.decks,
  );
  result.full_analysis.best_in_different_scenarios = replaceDeckSlots(
    result.full_analysis.best_in_different_scenarios || sentenceList(result.sections.recommended_scenarios),
    grounded.decks,
  );

  result.ui.deck_strengths.deck_a = result.ui.deck_strengths.deck_a.map((line) => replaceDeckSlots(line, grounded.decks));
  result.ui.deck_strengths.deck_b = result.ui.deck_strengths.deck_b.map((line) => replaceDeckSlots(line, grounded.decks));
  if (result.ui.deck_strengths.deck_c) {
    result.ui.deck_strengths.deck_c = result.ui.deck_strengths.deck_c.map((line) => replaceDeckSlots(line, grounded.decks));
  }

  result.ui.scenario_cards = result.ui.scenario_cards.map((card) => ({
    label: replaceDeckSlots(card.label, grounded.decks),
    winner: normalizeWinnerToGroundedLabel(card.winner, grounded.decks),
    reason: replaceDeckSlots(card.reason, grounded.decks),
  }));

  for (const deck of grounded.decks) {
    if (!deck.label) continue;
    const duplicated = new RegExp(`${escapeRegExp(deck.label)}\\s*\\(${escapeRegExp(deck.label)}\\)`, "gi");
    result.full_analysis.key_differences = result.full_analysis.key_differences.replace(duplicated, deck.label);
    result.full_analysis.strategy = result.full_analysis.strategy.replace(duplicated, deck.label);
    result.full_analysis.strengths_and_weaknesses = result.full_analysis.strengths_and_weaknesses.replace(duplicated, deck.label);
    result.full_analysis.recommendations = result.full_analysis.recommendations.replace(duplicated, deck.label);
    result.full_analysis.best_in_different_scenarios = result.full_analysis.best_in_different_scenarios.replace(duplicated, deck.label);
  }

  return result;
}

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
        1,
        {
          identity: 'free',
          verifiedUserId: null,
        }
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
    const isSameListComparison =
      Array.isArray(comp.uniqueToDecks) &&
      comp.uniqueToDecks.length >= 2 &&
      comp.uniqueToDecks.every((entry) => Array.isArray(entry.cards) && entry.cards.length === 0);

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

    const executionContext = buildAiRouteExecutionContext({
      userId: user.id,
      isGuest: false,
      isPro,
      source: usageSource ?? null,
      sourcePage,
      featureKey: FEATURE_KEY,
      rateLimitKey: RATE_LIMIT_KEY,
    });
    // Mobile compare needs to return inside an interactive app loading modal.
    // Do not inherit MODEL_DECK_COMPARE here; that env is used by the heavier web compare route.
    const model =
      process.env.MODEL_DECK_COMPARE_MOBILE ||
      (isPro ? process.env.MODEL_DECK_COMPARE_MOBILE_PRO : process.env.MODEL_DECK_COMPARE_MOBILE_FREE) ||
      DEFAULT_FREE_MODEL;
    const grounded = await buildDeckCompareGrounding(decks.trim(), formatLabel).catch(() => null);
    if (grounded && isSameListComparison) {
      grounded.matrix.fasterDeck = "Same list";
      grounded.matrix.resilientDeck = "Same list";
      grounded.matrix.lateGameDeck = "Same list";
      grounded.matrix.recoveryDeck = "Same list";
      grounded.matrix.explosiveDeck = "Same list";
      grounded.matrix.interactionDeck = "Same list";
      grounded.matrix.verdict =
        "These lists are card-for-card identical, so there is no construction edge; pilot decisions, mulligans, and matchup context matter most.";
    }
    const edgeLine = (winner: string | null | undefined, edge: string, contested: string) =>
      isContestedWinner(winner) ? contested : `${winner} ${edge}`;
    const pairedEdgeLine = (
      firstWinner: string | null | undefined,
      firstEdge: string,
      secondWinner: string | null | undefined,
      secondEdge: string,
      contested: string,
    ) => {
      const parts = [
        isContestedWinner(firstWinner) ? "" : `${firstWinner} ${firstEdge}`,
        isContestedWinner(secondWinner) ? "" : `${secondWinner} ${secondEdge}`,
      ].filter(Boolean);
      return parts.length ? parts.join(", while ") + "." : contested;
    };
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
            grounded
              ? edgeLine(
                  grounded.matrix.fasterDeck,
                  "is the cleaner fast-start list.",
                  "Fast-start pressure is contested from the submitted lists.",
                )
              : "One list is better at fast starts.",
            grounded
              ? edgeLine(
                  grounded.matrix.interactionDeck,
                  "carries the stronger interaction package.",
                  "Interaction is close enough that no deck has a clean deterministic edge.",
                )
              : "Another list is more interactive.",
          ],
          strengths_weaknesses: grounded?.decks.map((deck) => {
            const i = deck.intelligence;
            const risk = i.weakSignals[0] ? ` Main risk: ${i.weakSignals[0]}.` : "";
            return `${deck.label} is a ${i.powerBand} ${i.intent} shell: tempo ${i.tempoScore}, consistency ${i.consistencyScore}, interaction ${i.interactionScore}, closing ${i.closingScore}.${risk}`;
          }) ?? [],
          recommended_scenarios: [
            grounded
              ? edgeLine(
                  grounded.matrix.fasterDeck,
                  "is the pick when you need quicker pressure.",
                  "For quicker games, pick the list whose opening plan you pilot most confidently.",
                )
              : "Pick the faster deck for aggressive tables.",
            grounded
              ? edgeLine(
                  grounded.matrix.lateGameDeck,
                  "is the pick when you expect longer games.",
                  "For longer games, use matchup context instead of forcing a construction winner.",
                )
              : "Pick the slower deck for grindier games.",
          ],
        },
        full_analysis: {
          key_differences: grounded?.decks.map((deck) => groundedDeckIntelligenceLine(deck)).join(" ") || "",
          strategy: grounded?.matrix.verdict || "",
          strengths_and_weaknesses: grounded
            ? pairedEdgeLine(
                grounded.matrix.interactionDeck,
                "is better at interacting",
                grounded.matrix.explosiveDeck,
                "has the more explosive starts",
                "No deck has a clean deterministic edge on interaction or explosiveness from the submitted lists.",
              )
            : "",
          recommendations: "Tune lands, ramp, and interaction around the pace you expect to face.",
          best_in_different_scenarios: grounded
            ? pairedEdgeLine(
                grounded.matrix.fasterDeck,
                "is better for fast games",
                grounded.matrix.lateGameDeck,
                "is better for grindier games",
                "No single deck is clearly better for fast or grindy games; choose based on matchup speed, pilot comfort, and table context.",
              )
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
          grounded?.decks.map((deck) => groundedDeckIntelligenceLine(deck)).join(" || ") || "",
          grounded
            ? `Deterministic reads: fast=${grounded.matrix.fasterDeck}, resilience=${grounded.matrix.resilientDeck}, late=${grounded.matrix.lateGameDeck}, interaction=${grounded.matrix.interactionDeck}. Treat Contested as no clear winner.`
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
          maxTokens: 1200,
          timeoutMs: isPro ? 24000 : 12000,
          buildMessages: () => [
            {
              role: "system",
              content: [
                buildMobileDeckCompareSystemPrompt(formatLabel),
                "Use the deterministic comparison matrix as authoritative grounding. Do not invent card presence or Commander-only assumptions for 60-card formats. If a grounded read is Contested, do not force a deck winner.",
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
                "Return the same JSON shape, but improve clarity and specificity while staying aligned to the grounded reads.",
              ].join("\n"),
            },
          ],
          parse: (text, current) => {
            const parsed = parseJsonObjectFromLlmText(text);
            return parsed ? normalizeMobileDeckCompareResponse(parsed, safeDeckCount, model) : current;
          },
        },
        writer: {
          enabled: isPro,
          passName: "writer",
          maxTokens: 1000,
          timeoutMs: 20000,
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
          enabled: isPro,
          passName: "critic",
          maxTokens: 900,
          timeoutMs: 18000,
          buildMessages: (current) => [
            {
              role: "system",
              content: "Act as a final consistency critic. Only return corrected JSON if the draft drifts from the deterministic reads, forces winners for Contested categories, or repeats itself too much.",
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

      applyGroundedCompareGuardrails(normalized, grounded);

      return NextResponse.json(normalized);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to generate analysis";
      console.error("[mobile/deck/compare-ai] AI error:", e);
      return NextResponse.json(applyGroundedCompareGuardrails(deterministicNormalized, grounded));
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("[mobile/deck/compare-ai] route error:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
