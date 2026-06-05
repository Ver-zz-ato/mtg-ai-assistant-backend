import { NextResponse } from "next/server";
import { z } from "zod";
import { DEFAULT_ADMIN_DEEP_MODEL, DEFAULT_FALLBACK_MODEL } from "@/lib/ai/default-models";
import { buildAiRouteExecutionContext, runStructuredAiFlow } from "@/lib/ai/structured-pipeline";
import { parseJsonObjectFromLlmText } from "@/lib/mobile/deck-compare-mobile-response";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 180;

const ROUTE_PATH = "/api/mobile/deck/compare-v2/ai";
const FEATURE_KEY = "deck_compare_v2_deep_ai";
const MAX_DECKS = 6;

const deckSchema = z.object({
  id: z.string().trim().min(1).max(140),
  title: z.string().trim().min(1).max(140),
  commander: z.string().trim().max(140).nullable().optional(),
  format: z.string().trim().min(1).max(40),
  cardCount: z.number().int().min(1).max(250),
  estimatedValueUsd: z.number().min(0).max(1000000).nullable().optional(),
  topExpensiveCards: z.array(z.object({
    name: z.string().trim().min(1).max(160),
    estimatedPriceUsd: z.number().min(0).max(1000000),
  })).max(12).optional(),
  power: z.object({
    deterministicScore: z.number().min(1).max(10).optional(),
    aiAdjustedScore: z.number().min(1).max(10).optional(),
    level: z.number().min(1).max(10),
    band: z.string().trim().max(40).optional(),
  }),
  stats: z.object({
    tempo: z.number().min(0).max(100),
    consistency: z.number().min(0).max(100),
    interaction: z.number().min(0).max(100),
    resilience: z.number().min(0).max(100),
    closing: z.number().min(0).max(100),
    mana: z.number().min(0).max(100),
    synergy: z.number().min(0).max(100),
  }),
  strengths: z.array(z.string().trim().max(220)).max(8).optional(),
  weaknesses: z.array(z.string().trim().max(220)).max(8).optional(),
  summary: z.string().trim().max(420).optional(),
  tableRole: z.string().trim().max(100).optional(),
  whyItWins: z.string().trim().max(420).optional(),
  watchOutFor: z.array(z.string().trim().max(220)).max(6).optional(),
  swingCards: z.array(z.string().trim().max(160)).max(10).optional(),
  absolutePowerLevel: z.number().min(1).max(10).optional(),
  podRank: z.number().int().min(1).max(MAX_DECKS).nullable().optional(),
  podRelativePower: z.string().trim().max(40).optional(),
}).passthrough();

const comparisonSchema = z.object({
  ok: z.literal(true),
  format: z.string().trim().min(1).max(40),
  decks: z.array(deckSchema).min(2).max(MAX_DECKS),
  overview: z.object({
    strongestDeckId: z.string().trim().max(140).nullable().optional(),
    weakestDeckId: z.string().trim().max(140).nullable().optional(),
    fastestDeckId: z.string().trim().max(140).nullable().optional(),
    bestLongGameDeckId: z.string().trim().max(140).nullable().optional(),
    verdict: z.string().trim().max(800).optional(),
    winnerReason: z.string().trim().max(800).optional(),
    podBalance: z.string().trim().max(60).optional(),
    podBalanceNote: z.string().trim().max(800).optional(),
    bullets: z.array(z.string().trim().max(260)).max(8).optional(),
    pairwiseMatchups: z.array(z.object({
      deckAId: z.string().trim().max(140),
      deckBId: z.string().trim().max(140),
      favoredDeckId: z.string().trim().max(140).nullable().optional(),
      confidence: z.number().min(0).max(100),
      note: z.string().trim().max(420),
    })).max(15).optional(),
  }).passthrough(),
  aiMatchup: z.unknown().optional(),
  meta: z.object({
    version: z.number().optional(),
    model: z.string().optional(),
    usedAi: z.boolean().optional(),
    generated_at: z.string().optional(),
  }).passthrough().optional(),
}).passthrough();

const requestSchema = z.object({
  comparison: comparisonSchema,
  sourcePage: z.string().trim().max(80).optional(),
  source_page: z.string().trim().max(80).optional(),
});

type CompareV2DeepResult = z.infer<typeof comparisonSchema>;

async function getRequestUser(req: Request) {
  let supabase = await createClient();
  let { data } = await supabase.auth.getUser();
  let user = data?.user ?? null;
  if (!user) {
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (bearerToken) {
      const { createClientWithBearerToken } = await import("@/lib/server-supabase");
      const bearerSupabase = createClientWithBearerToken(bearerToken);
      const { data: bearerData } = await bearerSupabase.auth.getUser();
      if (bearerData?.user) {
        user = bearerData.user;
        supabase = bearerSupabase;
      }
    }
  }
  return { supabase, user };
}

function deckTitleById(result: CompareV2DeepResult, id: string | null | undefined): string {
  return result.decks.find((deck) => deck.id === id)?.title ?? "Contested";
}

function normalizeDeckId(raw: unknown, result: CompareV2DeepResult): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const value = raw.trim();
  if (result.decks.some((deck) => deck.id === value)) return value;
  return result.decks.find((deck) => deck.title.toLowerCase() === value.toLowerCase())?.id ?? null;
}

function stringList(raw: unknown, max: number): string[] {
  return Array.isArray(raw)
    ? raw.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim()).slice(0, max)
    : [];
}

function fallbackUi(result: CompareV2DeepResult) {
  const strongestDeckId = result.overview.strongestDeckId ?? result.decks.slice().sort((a, b) => b.power.level - a.power.level)[0]?.id ?? null;
  const fastestDeckId = result.overview.fastestDeckId ?? result.decks.slice().sort((a, b) => b.stats.tempo - a.stats.tempo)[0]?.id ?? null;
  const longGameDeckId = result.overview.bestLongGameDeckId ?? result.decks.slice().sort((a, b) =>
    (b.stats.resilience + b.stats.consistency + b.stats.closing) - (a.stats.resilience + a.stats.consistency + a.stats.closing)
  )[0]?.id ?? null;
  return {
    confidence_label: result.overview.podBalance === "mismatched" ? "dominant" : result.overview.podBalance === "balanced" ? "close" : "favored",
    rating_reasons: result.decks.map((deck) => ({
      deckId: deck.id,
      summary: `${deck.title} rates ${deck.power.level}/10 because its ${deck.tableRole ?? "game plan"} profile combines tempo ${deck.stats.tempo}, interaction ${deck.stats.interaction}, and closing ${deck.stats.closing}.`,
      drivers: [
        deck.estimatedValueUsd ? `Value signal: about $${Math.round(deck.estimatedValueUsd)}` : "Value signal: incomplete pricing",
        `Speed: tempo ${deck.stats.tempo}/100`,
        `Interaction: ${deck.stats.interaction}/100`,
        `Consistency: ${deck.stats.consistency}/100`,
        `Win lines: closing ${deck.stats.closing}/100`,
      ],
      confidence: deck.power.level >= 8 || deck.power.level <= 4 ? "high" : "medium",
    })),
    game_pattern: {
      early: {
        favoredDeckId: fastestDeckId,
        winner: deckTitleById(result, fastestDeckId),
        reason: `${deckTitleById(result, fastestDeckId)} has the clearest early tempo pressure.`,
      },
      mid: {
        favoredDeckId: strongestDeckId,
        winner: deckTitleById(result, strongestDeckId),
        reason: `${deckTitleById(result, strongestDeckId)} has the best combined power and interaction profile once engines start mattering.`,
      },
      late: {
        favoredDeckId: longGameDeckId,
        winner: deckTitleById(result, longGameDeckId),
        reason: `${deckTitleById(result, longGameDeckId)} scales best into longer games on resilience, consistency, and closing power.`,
      },
    },
    key_swing_cards: result.decks.map((deck) => ({
      deckId: deck.id,
      cards: (deck.swingCards?.length ? deck.swingCards : deck.topExpensiveCards?.map((card) => card.name) ?? []).slice(0, 5),
      why: `${deck.title}'s swing cards are the pieces most likely to change threat priority or convert its plan into a win.`,
    })).filter((row) => row.cards.length > 0),
    upset_paths: result.decks.filter((deck) => deck.id !== strongestDeckId).map((deck) => ({
      deckId: deck.id,
      targetDeckId: strongestDeckId,
      path: `${deck.title} can upset ${deckTitleById(result, strongestDeckId)} by forcing the table to respect ${deckTitleById(result, strongestDeckId)} first, then using its own swing cards during the recovery window.`,
      keyCards: (deck.swingCards ?? []).slice(0, 4),
    })),
  };
}

function normalizeDeepUi(raw: unknown, result: CompareV2DeepResult) {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const fallback = fallbackUi(result);
  const ratingRaw = Array.isArray(obj.rating_reasons) ? obj.rating_reasons : [];
  const rating_reasons = ratingRaw.map((entry) => {
    const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const deckId = normalizeDeckId(row.deckId ?? row.deck_id ?? row.title, result);
    if (!deckId) return null;
    const fb = fallback.rating_reasons.find((item) => item.deckId === deckId);
    return {
      deckId,
      summary: typeof row.summary === "string" && row.summary.trim() ? row.summary.trim().slice(0, 260) : fb?.summary ?? "",
      drivers: stringList(row.drivers, 6).length ? stringList(row.drivers, 6) : fb?.drivers ?? [],
      confidence: row.confidence === "low" || row.confidence === "medium" || row.confidence === "high" ? row.confidence : fb?.confidence ?? "medium",
    };
  }).filter((entry): entry is NonNullable<typeof entry> => !!entry);

  const patternRaw = obj.game_pattern && typeof obj.game_pattern === "object" && !Array.isArray(obj.game_pattern) ? obj.game_pattern as Record<string, unknown> : {};
  const normalizePattern = (key: "early" | "mid" | "late") => {
    const row = patternRaw[key] && typeof patternRaw[key] === "object" ? patternRaw[key] as Record<string, unknown> : {};
    const favoredDeckId = normalizeDeckId(row.favoredDeckId ?? row.favored_deck_id ?? row.winner, result) ?? fallback.game_pattern[key].favoredDeckId;
    return {
      favoredDeckId,
      winner: favoredDeckId ? deckTitleById(result, favoredDeckId) : fallback.game_pattern[key].winner,
      reason: typeof row.reason === "string" && row.reason.trim() ? row.reason.trim().slice(0, 280) : fallback.game_pattern[key].reason,
    };
  };

  const swingRaw = Array.isArray(obj.key_swing_cards) ? obj.key_swing_cards : [];
  const key_swing_cards = swingRaw.map((entry) => {
    const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const deckId = normalizeDeckId(row.deckId ?? row.deck_id ?? row.title, result);
    if (!deckId) return null;
    const fb = fallback.key_swing_cards.find((item) => item.deckId === deckId);
    return {
      deckId,
      cards: stringList(row.cards, 6).length ? stringList(row.cards, 6) : fb?.cards ?? [],
      why: typeof row.why === "string" && row.why.trim() ? row.why.trim().slice(0, 280) : fb?.why ?? "",
    };
  }).filter((entry): entry is NonNullable<typeof entry> => !!entry && entry.cards.length > 0);

  const upsetRaw = Array.isArray(obj.upset_paths) ? obj.upset_paths : [];
  const upset_paths = upsetRaw.map((entry) => {
    const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const deckId = normalizeDeckId(row.deckId ?? row.deck_id ?? row.title, result);
    if (!deckId) return null;
    const targetDeckId = normalizeDeckId(row.targetDeckId ?? row.target_deck_id ?? row.target, result);
    const fb = fallback.upset_paths.find((item) => item.deckId === deckId);
    return {
      deckId,
      targetDeckId: targetDeckId ?? fb?.targetDeckId ?? null,
      path: typeof row.path === "string" && row.path.trim() ? row.path.trim().slice(0, 320) : fb?.path ?? "",
      keyCards: stringList(row.keyCards ?? row.key_cards, 5).length ? stringList(row.keyCards ?? row.key_cards, 5) : fb?.keyCards ?? [],
    };
  }).filter((entry): entry is NonNullable<typeof entry> => !!entry && !!entry.path);

  return {
    ...fallback,
    rating_reasons: rating_reasons.length ? rating_reasons : fallback.rating_reasons,
    game_pattern: { early: normalizePattern("early"), mid: normalizePattern("mid"), late: normalizePattern("late") },
    key_swing_cards: key_swing_cards.length ? key_swing_cards : fallback.key_swing_cards,
    upset_paths: upset_paths.length ? upset_paths : fallback.upset_paths,
    confidence_label: obj.confidence_label === "close" || obj.confidence_label === "favored" || obj.confidence_label === "dominant"
      ? obj.confidence_label
      : fallback.confidence_label,
  };
}

function mergeDeepUi(result: CompareV2DeepResult, raw: unknown): CompareV2DeepResult {
  const ai = result.aiMatchup && typeof result.aiMatchup === "object" && !Array.isArray(result.aiMatchup)
    ? result.aiMatchup as Record<string, any>
    : {};
  const currentUi = ai.ui && typeof ai.ui === "object" && !Array.isArray(ai.ui) ? ai.ui : {};
  const deepUi = normalizeDeepUi(raw, result);
  return {
    ...result,
    aiMatchup: {
      ...ai,
      summary: ai.summary ?? {
        better_for_fast_tables: "Contested",
        better_for_slower_pods: "Contested",
        more_consistent: "Contested",
        highest_ceiling: "Contested",
        one_line_verdict: result.overview.verdict ?? "The comparison is close.",
      },
      sections: ai.sections ?? { key_differences: [], strategy: [], strengths_weaknesses: [], recommended_scenarios: [] },
      full_analysis: ai.full_analysis ?? {
        key_differences: "",
        strategy: "",
        strengths_and_weaknesses: "",
        recommendations: "",
        best_in_different_scenarios: "",
      },
      ui: {
        ...currentUi,
        ...deepUi,
      },
    },
    meta: {
      ...(result.meta ?? {}),
      usedAi: true,
      deepAi: true,
      generated_at: new Date().toISOString(),
    },
  };
}

export async function POST(req: Request) {
  try {
    const { supabase, user } = await getRequestUser(req);
    if (!user) return NextResponse.json({ ok: false, code: "UNAUTHORIZED", error: "Unauthorized" }, { status: 401 });

    const { checkProStatus } = await import("@/lib/server-pro-check");
    const isPro = await checkProStatus(user.id);
    if (!isPro) {
      return NextResponse.json({ ok: false, code: "PRO_REQUIRED", error: "Deck Compare deep AI is a Pro feature." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, code: "INVALID_INPUT", error: "Invalid AI analysis request." }, { status: 400 });
    }

    const comparison = parsed.data.comparison;
    const model = process.env.MODEL_DECK_COMPARE_V2_DEEP || process.env.MODEL_ADMIN_DEEP || DEFAULT_ADMIN_DEEP_MODEL;
    const { resolveAiUsageSourceForRequest } = await import("@/lib/ai/manatap-client-origin");
    const usageSource = resolveAiUsageSourceForRequest(req, body, null);
    const sourcePage = parsed.data.sourcePage ?? parsed.data.source_page ?? "app_deck_compare_v2_ai";
    const context = {
      ...buildAiRouteExecutionContext({
        userId: user.id,
        isGuest: false,
        isPro,
        source: usageSource ?? null,
        sourcePage,
        featureKey: FEATURE_KEY,
        rateLimitKey: ROUTE_PATH,
      }),
      model,
      fallbackModel: DEFAULT_FALLBACK_MODEL,
      latencyBudgetMs: 170000,
    };

    const flow = await runStructuredAiFlow<CompareV2DeepResult>({
      context,
      routePath: ROUTE_PATH,
      deterministic: mergeDeepUi(comparison, {}),
      judge: {
        enabled: true,
        passName: "deep_judge",
        maxTokens: 2600,
        timeoutMs: 170000,
        buildMessages: () => [
          {
            role: "system",
            content: [
              "You are ManaTap's premium MTG matchup analyst.",
              "Return only JSON. Do not invent cards.",
              "Be concrete and opinionated. Avoid generic statements like 'has good synergy' unless you tie it to stats, value, role, card names, or matchup timing.",
              "Use exact deck titles or deck IDs from the provided comparison.",
              "The user paid for Pro; make this feel like coaching before sitting down at the table.",
            ].join(" "),
          },
          {
            role: "user",
            content: [
              "Create a deeper Deck Compare V2 AI analysis from this comparison result.",
              "Return JSON only with this shape:",
              '{"confidence_label":"close|favored|dominant","rating_reasons":[{"deckId":"exact id","summary":"specific 1 sentence","drivers":["4-6 specific compact reasons covering value, speed, interaction, consistency, win lines"],"confidence":"low|medium|high"}],"game_pattern":{"early":{"favoredDeckId":"id or null","winner":"title or Contested","reason":"specific 1 sentence"},"mid":{"favoredDeckId":"id or null","winner":"title or Contested","reason":"specific 1 sentence"},"late":{"favoredDeckId":"id or null","winner":"title or Contested","reason":"specific 1 sentence"}},"key_swing_cards":[{"deckId":"exact id","cards":["real card names from this comparison only"],"why":"specific matchup reason"}],"upset_paths":[{"deckId":"non-favorite id","targetDeckId":"favorite id","path":"specific 1-2 sentence path","keyCards":["real card names from this deck only"]}]}',
              "",
              `Comparison result:\n${JSON.stringify(comparison)}`,
            ].join("\n"),
          },
        ],
        parse: (text, current) => mergeDeepUi(current, parseJsonObjectFromLlmText(text)),
      },
      writer: { enabled: false, passName: "writer", buildMessages: () => [], parse: (_text, current) => current },
      critic: { enabled: false, passName: "critic", buildMessages: () => [], parse: (_text, current) => current },
    });

    return NextResponse.json({
      ...flow.value,
      meta: {
        ...(flow.value.meta ?? {}),
        model: flow.model,
        usedAi: flow.usedAi,
        deepAi: true,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[mobile/deck/compare-v2/ai] route error:", error);
    return NextResponse.json({ ok: false, code: "SERVER_ERROR", error: "server_error" }, { status: 500 });
  }
}
