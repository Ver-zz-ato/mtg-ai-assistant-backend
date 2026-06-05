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

function deckCardsFor(result: CompareV2DeepResult, deckId: string): string[] {
  const deck = result.decks.find((entry) => entry.id === deckId);
  if (!deck) return [];
  return [
    ...(deck.swingCards ?? []),
    ...(deck.topExpensiveCards?.map((card) => card.name) ?? []),
  ].filter((name, index, all) => name && all.findIndex((entry) => entry.toLowerCase() === name.toLowerCase()) === index);
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
    deep_report: {
      headline: result.overview.verdict ?? `${deckTitleById(result, strongestDeckId)} is the deck to beat, but the table still has interaction windows.`,
      table_plan: result.overview.winnerReason ?? `${deckTitleById(result, strongestDeckId)} should be pressured early while slower decks preserve answers for the first real payoff turn.`,
      highlighted_cards: result.decks.map((deck) => ({
        deckId: deck.id,
        cards: deckCardsFor(result, deck.id).slice(0, 5),
        why: `${deck.title}'s highlighted cards are the visible pieces most likely to force blocks, removal, or a table-wide response.`,
      })).filter((row) => row.cards.length > 0),
      combos: result.decks.map((deck) => ({
        deckId: deck.id,
        cards: deckCardsFor(result, deck.id).slice(0, 3),
        line: `${deck.title} wants to convert its main engine into a closing turn once the table is low on answers.`,
        vulnerability: deck.stats.interaction < 45 ? "Low interaction means the line is fragile if another deck is faster." : "The line is strongest when protected by interaction.",
      })).filter((row) => row.cards.length > 0),
      synergy: result.decks.map((deck) => ({
        deckId: deck.id,
        engine: deck.tableRole ?? "Main engine",
        cards: deckCardsFor(result, deck.id).slice(0, 4),
        payoff: deck.whyItWins ?? `${deck.title} turns its best cards into pressure through ${deck.stats.synergy}/100 synergy and ${deck.stats.closing}/100 closing power.`,
      })).filter((row) => row.cards.length > 0),
      tactics: result.decks.map((deck) => ({
        deckId: deck.id,
        advice: deck.id === strongestDeckId
          ? "Act like the archenemy: sequence threats so the table cannot answer everything at once."
          : `Do not spend premium interaction too early; point it at ${deckTitleById(result, strongestDeckId)} when it tries to convert advantage into a win.`,
        timing: deck.stats.tempo >= 65 ? "Push early and make slower decks answer you." : "Preserve resources until the midgame pivot.",
        keyCards: deckCardsFor(result, deck.id).slice(0, 3),
      })),
      threat_assessment: result.decks.map((deck) => ({
        deckId: deck.id,
        threat: `${deck.title} is ${deck.podRelativePower ?? `power ${deck.power.level}/10`} with ${deck.stats.closing}/100 closing pressure.`,
        answer: deck.watchOutFor?.[0] ?? (deck.id === strongestDeckId ? "Keep removal or counterplay ready for its first payoff turn." : "Pressure its setup before it can become relevant."),
        priority: deck.id === strongestDeckId || deck.power.level >= 8 ? "high" : deck.power.level >= 6 ? "medium" : "low",
      })),
    },
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

  const deepRaw = obj.deep_report && typeof obj.deep_report === "object" && !Array.isArray(obj.deep_report)
    ? obj.deep_report as Record<string, unknown>
    : {};
  const normalizeDeckRows = <T,>(
    rawRows: unknown,
    max: number,
    mapper: (row: Record<string, unknown>, deckId: string) => T | null,
  ): T[] => {
    if (!Array.isArray(rawRows)) return [];
    return rawRows.map((entry) => {
      const row = entry && typeof entry === "object" && !Array.isArray(entry) ? entry as Record<string, unknown> : {};
      const deckId = normalizeDeckId(row.deckId ?? row.deck_id ?? row.title, result);
      return deckId ? mapper(row, deckId) : null;
    }).filter((entry): entry is T => !!entry).slice(0, max);
  };
  const deep_report = {
    headline: typeof deepRaw.headline === "string" && deepRaw.headline.trim()
      ? deepRaw.headline.trim().slice(0, 420)
      : fallback.deep_report.headline,
    table_plan: typeof deepRaw.table_plan === "string" && deepRaw.table_plan.trim()
      ? deepRaw.table_plan.trim().slice(0, 700)
      : fallback.deep_report.table_plan,
    highlighted_cards: normalizeDeckRows(deepRaw.highlighted_cards, 8, (row, deckId) => ({
      deckId,
      cards: stringList(row.cards, 6).length ? stringList(row.cards, 6) : deckCardsFor(result, deckId).slice(0, 5),
      why: typeof row.why === "string" && row.why.trim() ? row.why.trim().slice(0, 320) : `${deckTitleById(result, deckId)} has cards that can change table threat priority.`,
    })).filter((row) => row.cards.length > 0),
    combos: normalizeDeckRows(deepRaw.combos, 8, (row, deckId) => ({
      deckId,
      cards: stringList(row.cards, 5).length ? stringList(row.cards, 5) : deckCardsFor(result, deckId).slice(0, 3),
      line: typeof row.line === "string" && row.line.trim() ? row.line.trim().slice(0, 360) : `${deckTitleById(result, deckId)} has a conversion line, but it needs sequencing around table interaction.`,
      vulnerability: typeof row.vulnerability === "string" && row.vulnerability.trim() ? row.vulnerability.trim().slice(0, 260) : undefined,
    })).filter((row) => row.cards.length > 0),
    synergy: normalizeDeckRows(deepRaw.synergy, 8, (row, deckId) => ({
      deckId,
      engine: typeof row.engine === "string" && row.engine.trim() ? row.engine.trim().slice(0, 160) : result.decks.find((deck) => deck.id === deckId)?.tableRole ?? "Main engine",
      cards: stringList(row.cards, 5).length ? stringList(row.cards, 5) : deckCardsFor(result, deckId).slice(0, 4),
      payoff: typeof row.payoff === "string" && row.payoff.trim() ? row.payoff.trim().slice(0, 340) : `${deckTitleById(result, deckId)} converts synergy into pressure if its engine sticks.`,
    })).filter((row) => row.cards.length > 0),
    tactics: normalizeDeckRows(deepRaw.tactics, 10, (row, deckId) => ({
      deckId,
      advice: typeof row.advice === "string" && row.advice.trim() ? row.advice.trim().slice(0, 360) : fallback.deep_report.tactics.find((item) => item.deckId === deckId)?.advice ?? "",
      timing: typeof row.timing === "string" && row.timing.trim() ? row.timing.trim().slice(0, 220) : undefined,
      keyCards: stringList(row.keyCards ?? row.key_cards, 5).length ? stringList(row.keyCards ?? row.key_cards, 5) : deckCardsFor(result, deckId).slice(0, 3),
    })).filter((row) => !!row.advice),
    threat_assessment: normalizeDeckRows(deepRaw.threat_assessment, 10, (row, deckId) => ({
      deckId,
      threat: typeof row.threat === "string" && row.threat.trim() ? row.threat.trim().slice(0, 320) : `${deckTitleById(result, deckId)} is a relevant table threat.`,
      answer: typeof row.answer === "string" && row.answer.trim() ? row.answer.trim().slice(0, 260) : undefined,
      priority: row.priority === "low" || row.priority === "medium" || row.priority === "high" ? row.priority : undefined,
    })).filter((row) => !!row.threat),
  };

  return {
    ...fallback,
    rating_reasons: rating_reasons.length ? rating_reasons : fallback.rating_reasons,
    game_pattern: { early: normalizePattern("early"), mid: normalizePattern("mid"), late: normalizePattern("late") },
    key_swing_cards: key_swing_cards.length ? key_swing_cards : fallback.key_swing_cards,
    upset_paths: upset_paths.length ? upset_paths : fallback.upset_paths,
    confidence_label: obj.confidence_label === "close" || obj.confidence_label === "favored" || obj.confidence_label === "dominant"
      ? obj.confidence_label
      : fallback.confidence_label,
    deep_report: {
      ...fallback.deep_report,
      ...deep_report,
      highlighted_cards: deep_report.highlighted_cards.length ? deep_report.highlighted_cards : fallback.deep_report.highlighted_cards,
      combos: deep_report.combos.length ? deep_report.combos : fallback.deep_report.combos,
      synergy: deep_report.synergy.length ? deep_report.synergy : fallback.deep_report.synergy,
      tactics: deep_report.tactics.length ? deep_report.tactics : fallback.deep_report.tactics,
      threat_assessment: deep_report.threat_assessment.length ? deep_report.threat_assessment : fallback.deep_report.threat_assessment,
    },
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
              "The deep_report is the premium output. It must include named card highlights, combo or conversion lines, synergy engines, tactical advice, and threat priorities.",
              "If you cannot prove a true combo from card names, call it a conversion line and explain the cards' tactical relationship instead of pretending it is infinite.",
              "The user paid for Pro; make this feel like coaching before sitting down at the table.",
            ].join(" "),
          },
          {
            role: "user",
            content: [
              "Create a deeper Deck Compare V2 AI analysis from this comparison result.",
              "Return JSON only with this shape:",
              '{"confidence_label":"close|favored|dominant","rating_reasons":[{"deckId":"exact id","summary":"specific 1 sentence","drivers":["4-6 specific compact reasons covering value, speed, interaction, consistency, win lines"],"confidence":"low|medium|high"}],"game_pattern":{"early":{"favoredDeckId":"id or null","winner":"title or Contested","reason":"specific 1 sentence"},"mid":{"favoredDeckId":"id or null","winner":"title or Contested","reason":"specific 1 sentence"},"late":{"favoredDeckId":"id or null","winner":"title or Contested","reason":"specific 1 sentence"}},"key_swing_cards":[{"deckId":"exact id","cards":["real card names from this comparison only"],"why":"specific matchup reason"}],"upset_paths":[{"deckId":"non-favorite id","targetDeckId":"favorite id","path":"specific 1-2 sentence path","keyCards":["real card names from this deck only"]}],"deep_report":{"headline":"sharp overall conclusion","table_plan":"how this pod likely plays and what the table should respect","highlighted_cards":[{"deckId":"exact id","cards":["real card names"],"why":"why these cards matter in this pod"}],"combos":[{"deckId":"exact id","cards":["real card names"],"line":"combo/conversion line and what it achieves","vulnerability":"how opponents break it"}],"synergy":[{"deckId":"exact id","engine":"named engine or plan","cards":["real card names"],"payoff":"how these pieces reinforce each other"}],"tactics":[{"deckId":"exact id","advice":"specific pilot advice","timing":"early/mid/late timing cue","keyCards":["real card names"]}],"threat_assessment":[{"deckId":"exact id","threat":"what makes this deck dangerous","answer":"how the table should answer it","priority":"low|medium|high"}]}}',
              "Make deep_report dense but compact: 1 headline, 1 table_plan, then 1-2 useful rows per deck where possible.",
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
