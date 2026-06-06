import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DEFAULT_FALLBACK_MODEL, DEFAULT_FREE_MODEL } from "@/lib/ai/default-models";
import {
  buildAiRouteExecutionContext,
  buildCompactGroundingPacket,
  runStructuredAiFlow,
} from "@/lib/ai/structured-pipeline";
import { parseJsonObjectFromLlmText } from "@/lib/mobile/deck-compare-mobile-response";
import {
  buildDeckCompareGrounding,
  type CompareDeckGrounding,
} from "@/lib/mobile/deck-compare-grounding";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleSupabase } from "@/lib/server/serviceRoleSupabase";
import {
  deckFormatStringToAnalyzeFormat,
  getFormatRules,
  normalizeDeckFormat,
} from "@/lib/deck/formatRules";
import {
  mainDeckTextCardCount,
  rowsToDeckTextForAnalysis,
} from "@/lib/deck/formatCompliance";

export const runtime = "nodejs";
export const maxDuration = 120;

const ROUTE_PATH = "/api/mobile/deck/compare-v2";
const FEATURE_KEY = "deck_compare_v2";
const MAX_DECKS = 6;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const deckInputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("saved"),
    deckId: z.string().regex(UUID_RE),
  }),
  z.object({
    type: z.literal("pasted"),
    title: z.string().trim().min(1).max(120).optional(),
    deckText: z.string().trim().min(20).max(40000),
    format: z.string().trim().min(1).max(40),
    commander: z.string().trim().max(120).optional().nullable(),
  }),
]);

const comparisonDeckSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("saved"),
    deckId: z.string().regex(UUID_RE),
  }),
  z.object({
    type: z.literal("public"),
    deckId: z.string().regex(UUID_RE),
  }),
  z.object({
    type: z.literal("pasted"),
    title: z.string().trim().min(1).max(120).optional(),
    deckText: z.string().trim().min(20).max(40000),
    format: z.string().trim().min(1).max(40),
    commander: z.string().trim().max(120).optional().nullable(),
  }),
]);

const requestSchema = z.object({
  ownDeck: deckInputSchema.optional(),
  decks: z.array(comparisonDeckSchema).min(2).max(MAX_DECKS).optional(),
  comparisonDecks: z.array(comparisonDeckSchema).max(MAX_DECKS - 1).optional(),
  publicDeckIds: z.array(z.string().regex(UUID_RE)).max(MAX_DECKS - 1).optional(),
  sourcePage: z.string().trim().max(80).optional(),
  source_page: z.string().trim().max(80).optional(),
  usageSource: z.string().trim().max(80).optional(),
  usage_source: z.string().trim().max(80).optional(),
});

type DeckCardRow = { name: string; qty: number; zone?: string | null };

type CompareV2InputDeck = {
  id: string;
  source: "own_saved" | "own_pasted" | "public_scan";
  title: string;
  commander: string | null;
  format: string;
  canonicalFormat: string;
  cardCount: number;
  deckText: string;
};

type CompareV2AiMatchup = {
  summary: {
    better_for_fast_tables: string;
    better_for_slower_pods: string;
    more_consistent: string;
    highest_ceiling: string;
    one_line_verdict: string;
  };
  sections: {
    key_differences: string[];
    strategy: string[];
    strengths_weaknesses: string[];
    recommended_scenarios: string[];
  };
  full_analysis: {
    key_differences: string;
    strategy: string;
    strengths_and_weaknesses: string;
    recommendations: string;
    best_in_different_scenarios: string;
  };
  ui: {
    verdict_cards: Array<{ label: string; winnerDeckId: string | null; winner: string }>;
    deck_strengths: Record<string, string[]>;
    scenario_cards: Array<{ label: string; winnerDeckId: string | null; winner: string; reason: string }>;
    rating_reasons?: Array<{
      deckId: string;
      summary: string;
      drivers: string[];
      confidence: "low" | "medium" | "high";
    }>;
    game_pattern?: {
      early: { favoredDeckId: string | null; winner: string; reason: string };
      mid: { favoredDeckId: string | null; winner: string; reason: string };
      late: { favoredDeckId: string | null; winner: string; reason: string };
    };
    key_swing_cards?: Array<{ deckId: string; cards: string[]; why: string }>;
    upset_paths?: Array<{ deckId: string; targetDeckId: string | null; path: string; keyCards: string[] }>;
    confidence_label?: "close" | "favored" | "dominant";
  };
};

type CompareV2DeckCard = {
  id: string;
  source: CompareV2InputDeck["source"];
  title: string;
  commander: string | null;
  format: string;
  cardCount: number;
  estimatedValueUsd: number | null;
  topExpensiveCards: Array<{ name: string; estimatedPriceUsd: number }>;
  power: {
    deterministicScore: number;
    aiAdjustedScore: number;
    level: number;
    band: CompareDeckGrounding["intelligence"]["powerBand"];
  };
  stats: {
    tempo: number;
    consistency: number;
    interaction: number;
    resilience: number;
    closing: number;
    mana: number;
    synergy: number;
  };
  strengths: string[];
  weaknesses: string[];
  summary: string;
  tableRole: string;
  whyItWins: string;
  watchOutFor: string[];
  swingCards: string[];
  absolutePowerLevel: number;
  podRank: number | null;
  podRelativePower: "top" | "upper" | "middle" | "lower" | "bottom";
};

type CompareV2Success = {
  ok: true;
  format: string;
  decks: CompareV2DeckCard[];
  overview: {
    strongestDeckId: string | null;
    weakestDeckId: string | null;
    fastestDeckId: string | null;
    bestLongGameDeckId: string | null;
    verdict: string;
    bullets: string[];
    winnerReason: string;
    podBalance: "balanced" | "slightly_mismatched" | "mismatched";
    podBalanceNote: string;
    pairwiseMatchups: Array<{
      deckAId: string;
      deckBId: string;
      favoredDeckId: string | null;
      confidence: number;
      note: string;
    }>;
  };
  meta: {
    version: 1;
    model: string;
    usedAi: boolean;
    generated_at: string;
  };
  aiMatchup: CompareV2AiMatchup;
};

function titleCaseFormat(format: string | null | undefined): string {
  const n = normalizeDeckFormat(format || "");
  return n ? getFormatRules(n).analyzeAs : deckFormatStringToAnalyzeFormat(format);
}

function minCardsForFormat(format: string): number {
  return normalizeDeckFormat(format) === "commander" ? 50 : 30;
}

function maxPastedCardsForFormat(format: string): number | null {
  return normalizeDeckFormat(format) === "commander" ? null : 75;
}

function totalRows(rows: DeckCardRow[]): number {
  return rows.reduce((sum, row) => {
    const zone = String(row.zone || "mainboard").toLowerCase();
    if (zone === "sideboard" || zone === "maybeboard") return sum;
    return sum + Math.max(1, Math.floor(Number(row.qty) || 1));
  }, 0);
}

function formatDeckBlock(deck: CompareV2InputDeck, index: number): string {
  const slot = `Deck ${String.fromCharCode(65 + index)}`;
  return `${slot} - ${deck.title} (${deck.commander || "No commander"}):\n${deck.deckText}`;
}

function clampPowerScore(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(10, Math.round(n)));
}

function deterministicStrengths(deck: CompareDeckGrounding): string[] {
  const i = deck.intelligence;
  return [
    i.tempoScore >= 65 ? `Fast pressure: tempo ${i.tempoScore}.` : "",
    i.consistencyScore >= 65 ? `Reliable setup: consistency ${i.consistencyScore}.` : "",
    i.interactionScore >= 65 ? `Good answers: interaction ${i.interactionScore}.` : "",
    i.synergyScore >= 65 ? `Clear synergy package: synergy ${i.synergyScore}.` : "",
    i.closingScore >= 65 ? `Strong finishers: closing ${i.closingScore}.` : "",
  ].filter(Boolean).slice(0, 3);
}

function deterministicWeaknesses(deck: CompareDeckGrounding): string[] {
  const i = deck.intelligence;
  return [
    ...i.weakSignals,
    i.interactionScore < 45 ? "Interaction may be too light." : "",
    i.consistencyScore < 45 ? "Consistency tools may be thin." : "",
    i.manaQualityScore < 45 ? "Mana quality looks shaky." : "",
  ].filter(Boolean).slice(0, 3);
}

function deterministicTableRole(deck: CompareDeckGrounding): string {
  const i = deck.intelligence;
  const best = [
    ["Tempo threat", i.tempoScore],
    ["Control seat", i.interactionScore],
    ["Value grinder", i.resilienceScore + i.consistencyScore],
    ["Closer", i.closingScore],
    ["Synergy engine", i.synergyScore],
  ].sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0];
  return String(best || "Midrange deck");
}

function deterministicWatchOutFor(deck: CompareDeckGrounding): string[] {
  const i = deck.intelligence;
  return [
    i.tempoScore >= 65 ? "Do not let its early pressure go unanswered." : "",
    i.interactionScore >= 65 ? "Expect it to stop key setup turns." : "",
    i.closingScore >= 65 ? "Hold answers for the finishing turn." : "",
    i.resilienceScore >= 65 ? "One board wipe may not be enough." : "",
    i.synergyScore >= 65 ? "Break up the engine pieces before they compound." : "",
  ].filter(Boolean).slice(0, 3);
}

function deckCardFromGrounding(
  inputDeck: CompareV2InputDeck,
  grounded: CompareDeckGrounding,
  aiPowerByTitle: Map<string, number>,
): CompareV2DeckCard {
  const deterministicLevel = clampPowerScore(grounded.intelligence.powerScore / 10, 5);
  const aiAdjustedScore = aiPowerByTitle.get(inputDeck.title.toLowerCase()) ?? deterministicLevel;
  return {
    id: inputDeck.id,
    source: inputDeck.source,
    title: inputDeck.title,
    commander: inputDeck.commander,
    format: inputDeck.format,
    cardCount: inputDeck.cardCount,
    estimatedValueUsd: grounded.intelligence.estimatedPriceUsd,
    topExpensiveCards: grounded.intelligence.premiumCardDetails,
    power: {
      deterministicScore: deterministicLevel,
      aiAdjustedScore,
      level: aiAdjustedScore,
      band: grounded.intelligence.powerBand,
    },
    stats: {
      tempo: grounded.intelligence.tempoScore,
      consistency: grounded.intelligence.consistencyScore,
      interaction: grounded.intelligence.interactionScore,
      resilience: grounded.intelligence.resilienceScore,
      closing: grounded.intelligence.closingScore,
      mana: grounded.intelligence.manaQualityScore,
      synergy: grounded.intelligence.synergyScore,
    },
    strengths: deterministicStrengths(grounded),
    weaknesses: deterministicWeaknesses(grounded),
    summary: grounded.summary,
    tableRole: deterministicTableRole(grounded),
    whyItWins: grounded.intelligence.matchupRead,
    watchOutFor: deterministicWatchOutFor(grounded),
    swingCards: grounded.intelligence.keyCards.slice(0, 5),
    absolutePowerLevel: deterministicLevel,
    podRank: null,
    podRelativePower: "middle",
  };
}

function pickDeckId(decks: CompareV2DeckCard[], score: (deck: CompareV2DeckCard) => number, direction: "max" | "min"): string | null {
  const sorted = [...decks].sort((a, b) => {
    const diff = direction === "max" ? score(b) - score(a) : score(a) - score(b);
    return diff || a.title.localeCompare(b.title);
  });
  return sorted[0]?.id ?? null;
}

function medianNumber(values: number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.floor(sorted.length / 2)];
}

function clampStatScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function relativeMetricScore(value: number, median: number | null): number {
  if (median == null) return clampStatScore(value);
  const nudge = Math.max(-5, Math.min(5, (value - median) * 0.15));
  return clampStatScore(value + nudge);
}

function podBalanceFor(cards: CompareV2DeckCard[]): CompareV2Success["overview"]["podBalance"] {
  const levels = cards.map((deck) => deck.power.level).filter((n) => Number.isFinite(n));
  if (levels.length < 2) return "balanced";
  const spread = Math.max(...levels) - Math.min(...levels);
  if (spread >= 4) return "mismatched";
  if (spread >= 2) return "slightly_mismatched";
  return "balanced";
}

function withPodRanks(cards: CompareV2DeckCard[]): CompareV2DeckCard[] {
  const sorted = [...cards].sort((a, b) => b.power.level - a.power.level || b.stats.synergy - a.stats.synergy || a.title.localeCompare(b.title));
  const rankById = new Map(sorted.map((deck, index) => [deck.id, index + 1]));
  return cards.map((deck) => {
    const rank = rankById.get(deck.id) ?? null;
    const relative =
      rank === 1 ? "top" :
      rank === cards.length ? "bottom" :
      rank != null && rank <= Math.ceil(cards.length / 3) ? "upper" :
      rank != null && rank > Math.floor(cards.length * 2 / 3) ? "lower" :
      "middle";
    return { ...deck, podRank: rank, podRelativePower: relative };
  });
}

function buildPairwiseMatchups(cards: CompareV2DeckCard[]): CompareV2Success["overview"]["pairwiseMatchups"] {
  const out: CompareV2Success["overview"]["pairwiseMatchups"] = [];
  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      const a = cards[i];
      const b = cards[j];
      const scoreA = a.power.level * 12 + a.stats.interaction * 0.18 + a.stats.consistency * 0.14 + a.stats.closing * 0.12;
      const scoreB = b.power.level * 12 + b.stats.interaction * 0.18 + b.stats.consistency * 0.14 + b.stats.closing * 0.12;
      const diff = Math.abs(scoreA - scoreB);
      const favored = diff < 4 ? null : scoreA > scoreB ? a : b;
      const confidence = Math.max(50, Math.min(75, Math.round(50 + diff)));
      out.push({
        deckAId: a.id,
        deckBId: b.id,
        favoredDeckId: favored?.id ?? null,
        confidence,
        note: favored
          ? `${favored.title} is favored by power, interaction, and consistency profile.`
          : `${a.title} and ${b.title} look close on paper.`,
      });
    }
  }
  return out.slice(0, 15);
}

function deckLabel(deck: CompareV2DeckCard | null | undefined): string {
  return deck?.title || "Contested";
}

function matchupWinnerCard(label: string, deck: CompareV2DeckCard | null | undefined): { label: string; winnerDeckId: string | null; winner: string } {
  return { label, winnerDeckId: deck?.id ?? null, winner: deckLabel(deck) };
}

function confidenceLabelFor(cards: CompareV2DeckCard[], overview: CompareV2Success["overview"]): "close" | "favored" | "dominant" {
  const levels = cards.map((deck) => deck.power.level).filter((level) => Number.isFinite(level));
  const spread = levels.length ? Math.max(...levels) - Math.min(...levels) : 0;
  const topTwo = [...cards].sort((a, b) => b.power.level - a.power.level).slice(0, 2);
  const topGap = topTwo.length === 2 ? Math.abs(topTwo[0].power.level - topTwo[1].power.level) : 0;
  const lowestPairConfidence = Math.min(...(overview.pairwiseMatchups.map((row) => row.confidence).filter(Number.isFinite)), 100);
  if (topGap <= 1 || lowestPairConfidence < 58 || overview.podBalance === "balanced") return "close";
  if (spread >= 4 || overview.podBalance === "mismatched") return "dominant";
  return "favored";
}

function ratingConfidence(deck: CompareV2DeckCard): "low" | "medium" | "high" {
  const topStats = [
    deck.stats.tempo,
    deck.stats.interaction,
    deck.stats.consistency,
    deck.stats.closing,
    deck.stats.synergy,
  ].filter((score) => score >= 65).length;
  if (topStats >= 3 || deck.podRelativePower === "top" || deck.podRelativePower === "bottom") return "high";
  if (topStats >= 1 || deck.power.level >= 6) return "medium";
  return "low";
}

function ratingDrivers(deck: CompareV2DeckCard): string[] {
  const valueDriver = deck.estimatedValueUsd && deck.estimatedValueUsd > 0
    ? `Value signal: about $${Math.round(deck.estimatedValueUsd)} in priced cards`
    : "Value signal: price data is incomplete";
  return [
    valueDriver,
    `Speed: tempo ${deck.stats.tempo}/100`,
    `Interaction: ${deck.stats.interaction}/100`,
    `Consistency: ${deck.stats.consistency}/100`,
    `Win lines: ${deck.stats.closing}/100 closing, ${deck.stats.synergy}/100 synergy`,
  ];
}

function buildRatingReasons(cards: CompareV2DeckCard[]): NonNullable<CompareV2AiMatchup["ui"]["rating_reasons"]> {
  return cards.map((deck) => ({
    deckId: deck.id,
    summary: `${deck.title} lands at ${deck.power.level}/10 because it profiles as a ${deck.tableRole.toLowerCase()} with ${deck.podRelativePower} pod pressure.`,
    drivers: ratingDrivers(deck),
    confidence: ratingConfidence(deck),
  }));
}

function patternRow(deck: CompareV2DeckCard | null | undefined, reason: string): { favoredDeckId: string | null; winner: string; reason: string } {
  return {
    favoredDeckId: deck?.id ?? null,
    winner: deckLabel(deck),
    reason,
  };
}

function buildGamePattern(cards: CompareV2DeckCard[], overview: CompareV2Success["overview"]): NonNullable<CompareV2AiMatchup["ui"]["game_pattern"]> {
  const fastest = overview.fastestDeckId ? cards.find((deck) => deck.id === overview.fastestDeckId) : null;
  const midgame = [...cards].sort((a, b) => (b.stats.interaction + b.stats.consistency + b.stats.synergy) - (a.stats.interaction + a.stats.consistency + a.stats.synergy) || a.title.localeCompare(b.title))[0] ?? null;
  const late = overview.bestLongGameDeckId ? cards.find((deck) => deck.id === overview.bestLongGameDeckId) : null;
  return {
    early: patternRow(fastest, fastest ? `${fastest.title} has the best early pressure and setup speed.` : "Early pressure is contested."),
    mid: patternRow(midgame, midgame ? `${midgame.title} should navigate turns 4-6 best through interaction, consistency, and engine density.` : "Midgame positioning is close."),
    late: patternRow(late, late ? `${late.title} has the strongest long-game blend of resilience, consistency, and closing power.` : "Late-game advantage is contested."),
  };
}

function buildKeySwingCards(cards: CompareV2DeckCard[]): NonNullable<CompareV2AiMatchup["ui"]["key_swing_cards"]> {
  return cards
    .map((deck) => ({
      deckId: deck.id,
      cards: (deck.swingCards?.length ? deck.swingCards : deck.topExpensiveCards.map((card) => card.name)).slice(0, 5),
      why: `${deck.title}'s swing cards matter because they support its ${deck.tableRole.toLowerCase()} plan and can change the pod's threat order.`,
    }))
    .filter((row) => row.cards.length > 0);
}

function buildUpsetPaths(cards: CompareV2DeckCard[], overview: CompareV2Success["overview"]): NonNullable<CompareV2AiMatchup["ui"]["upset_paths"]> {
  const target = overview.strongestDeckId ? cards.find((deck) => deck.id === overview.strongestDeckId) : null;
  if (!target) return [];
  return cards
    .filter((deck) => deck.id !== target.id)
    .map((deck) => ({
      deckId: deck.id,
      targetDeckId: target.id,
      path:
        deck.stats.tempo >= target.stats.tempo
          ? `${deck.title} can upset ${target.title} by forcing early pressure before ${target.title}'s stronger plan stabilizes.`
          : deck.stats.interaction >= target.stats.interaction
            ? `${deck.title} can upset ${target.title} by saving interaction for the first real engine or closing attempt.`
            : `${deck.title} needs the table to slow ${target.title} down, then convert its best swing cards into a narrow win window.`,
      keyCards: (deck.swingCards?.length ? deck.swingCards : deck.topExpensiveCards.map((card) => card.name)).slice(0, 4),
    }));
}

function stringList(value: unknown, max: number): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim()).slice(0, max)
    : [];
}

function normalizeDeckId(raw: unknown, cards: CompareV2DeckCard[]): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const value = raw.trim();
  if (cards.some((deck) => deck.id === value)) return value;
  const byTitle = cards.find((deck) => deck.title.toLowerCase() === value.toLowerCase());
  return byTitle?.id ?? null;
}

function normalizeAiUiOverrides(raw: unknown, base: CompareV2AiMatchup["ui"], cards: CompareV2DeckCard[]): Partial<CompareV2AiMatchup["ui"]> {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const out: Partial<CompareV2AiMatchup["ui"]> = {};
  const ratingReasons = Array.isArray(obj.rating_reasons ?? obj.ratingReasons) ? (obj.rating_reasons ?? obj.ratingReasons) as unknown[] : [];
  if (ratingReasons.length) {
    const rows = ratingReasons.map((entry) => {
      const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      const deckId = normalizeDeckId(row.deckId ?? row.deck_id ?? row.title, cards);
      if (!deckId) return null;
      const fallback = base.rating_reasons?.find((item) => item.deckId === deckId);
      const confidence = row.confidence === "low" || row.confidence === "medium" || row.confidence === "high" ? row.confidence : fallback?.confidence ?? "medium";
      return {
        deckId,
        summary: typeof row.summary === "string" && row.summary.trim() ? row.summary.trim().slice(0, 180) : fallback?.summary ?? "",
        drivers: stringList(row.drivers, 5).length ? stringList(row.drivers, 5) : fallback?.drivers ?? [],
        confidence,
      };
    }).filter((entry): entry is NonNullable<typeof entry> => !!entry);
    if (rows.length) out.rating_reasons = rows;
  }

  const gamePatternRaw = obj.game_pattern ?? obj.gamePattern;
  if (gamePatternRaw && typeof gamePatternRaw === "object" && !Array.isArray(gamePatternRaw) && base.game_pattern) {
    const source = gamePatternRaw as Record<string, unknown>;
    const normalizePattern = (key: "early" | "mid" | "late") => {
      const row = source[key] && typeof source[key] === "object" ? source[key] as Record<string, unknown> : {};
      const favoredDeckId = normalizeDeckId(row.favoredDeckId ?? row.favored_deck_id ?? row.winnerDeckId ?? row.winner, cards) ?? base.game_pattern?.[key].favoredDeckId ?? null;
      const winner = favoredDeckId ? cards.find((deck) => deck.id === favoredDeckId)?.title ?? base.game_pattern![key].winner : base.game_pattern![key].winner;
      return {
        favoredDeckId,
        winner,
        reason: typeof row.reason === "string" && row.reason.trim() ? row.reason.trim().slice(0, 220) : base.game_pattern![key].reason,
      };
    };
    out.game_pattern = {
      early: normalizePattern("early"),
      mid: normalizePattern("mid"),
      late: normalizePattern("late"),
    };
  }

  const swingCards = Array.isArray(obj.key_swing_cards ?? obj.keySwingCards) ? (obj.key_swing_cards ?? obj.keySwingCards) as unknown[] : [];
  if (swingCards.length) {
    const rows = swingCards.map((entry) => {
      const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      const deckId = normalizeDeckId(row.deckId ?? row.deck_id ?? row.title, cards);
      if (!deckId) return null;
      const fallback = base.key_swing_cards?.find((item) => item.deckId === deckId);
      return {
        deckId,
        cards: stringList(row.cards, 5).length ? stringList(row.cards, 5) : fallback?.cards ?? [],
        why: typeof row.why === "string" && row.why.trim() ? row.why.trim().slice(0, 220) : fallback?.why ?? "",
      };
    }).filter((entry): entry is NonNullable<typeof entry> => !!entry && entry.cards.length > 0);
    if (rows.length) out.key_swing_cards = rows;
  }

  const upsetPaths = Array.isArray(obj.upset_paths ?? obj.upsetPaths) ? (obj.upset_paths ?? obj.upsetPaths) as unknown[] : [];
  if (upsetPaths.length) {
    const rows = upsetPaths.map((entry) => {
      const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      const deckId = normalizeDeckId(row.deckId ?? row.deck_id ?? row.title, cards);
      if (!deckId) return null;
      const targetDeckId = normalizeDeckId(row.targetDeckId ?? row.target_deck_id ?? row.target, cards);
      const fallback = base.upset_paths?.find((item) => item.deckId === deckId);
      return {
        deckId,
        targetDeckId: targetDeckId ?? fallback?.targetDeckId ?? null,
        path: typeof row.path === "string" && row.path.trim() ? row.path.trim().slice(0, 240) : fallback?.path ?? "",
        keyCards: stringList(row.keyCards ?? row.key_cards, 4).length ? stringList(row.keyCards ?? row.key_cards, 4) : fallback?.keyCards ?? [],
      };
    }).filter((entry): entry is NonNullable<typeof entry> => !!entry && !!entry.path);
    if (rows.length) out.upset_paths = rows;
  }

  if (obj.confidence_label === "close" || obj.confidence_label === "favored" || obj.confidence_label === "dominant") {
    out.confidence_label = obj.confidence_label;
  } else if (obj.confidenceLabel === "close" || obj.confidenceLabel === "favored" || obj.confidenceLabel === "dominant") {
    out.confidence_label = obj.confidenceLabel;
  }

  return out;
}

function buildAiMatchup(cards: CompareV2DeckCard[], overview: CompareV2Success["overview"]): CompareV2AiMatchup {
  const strongest = overview.strongestDeckId ? cards.find((deck) => deck.id === overview.strongestDeckId) : null;
  const fastest = overview.fastestDeckId ? cards.find((deck) => deck.id === overview.fastestDeckId) : null;
  const longGame = overview.bestLongGameDeckId ? cards.find((deck) => deck.id === overview.bestLongGameDeckId) : null;
  const consistent = [...cards].sort((a, b) => b.stats.consistency - a.stats.consistency || a.title.localeCompare(b.title))[0] ?? null;
  const interaction = [...cards].sort((a, b) => b.stats.interaction - a.stats.interaction || a.title.localeCompare(b.title))[0] ?? null;

  const verdictCards = [
    matchupWinnerCard("Fast tables", fastest),
    matchupWinnerCard("Slower pods", longGame),
    matchupWinnerCard("Most consistent", consistent),
    matchupWinnerCard("Highest ceiling", strongest),
    matchupWinnerCard("Interaction fight", interaction),
  ];

  const deckStrengths = Object.fromEntries(
    cards.map((deck) => [
      deck.id,
      [
        `${deck.title} plays as a ${deck.tableRole.toLowerCase()} with power ${deck.power.level}/10 in this pod.`,
        ...deck.strengths.slice(0, 2),
        deck.watchOutFor[0] ? `Watch-out: ${deck.watchOutFor[0]}` : "",
      ].filter(Boolean).slice(0, 4),
    ]),
  );

  const scenarioCards = [
    {
      label: "Fast start",
      winnerDeckId: fastest?.id ?? null,
      winner: deckLabel(fastest),
      reason: fastest ? `${fastest.title} has the strongest tempo read and should pressure slower setup turns.` : "No deck has a clean fast-start edge.",
    },
    {
      label: "Long game",
      winnerDeckId: longGame?.id ?? null,
      winner: deckLabel(longGame),
      reason: longGame ? `${longGame.title} has the best blend of resilience, consistency, and closing score.` : "Long-game strength is close across the pod.",
    },
    {
      label: "Stack/answer fight",
      winnerDeckId: interaction?.id ?? null,
      winner: deckLabel(interaction),
      reason: interaction ? `${interaction.title} has the strongest interaction profile in the group.` : "Interaction is too close to force one winner.",
    },
    {
      label: "Highest ceiling",
      winnerDeckId: strongest?.id ?? null,
      winner: deckLabel(strongest),
      reason: strongest ? `${strongest.title} has the best overall power read once value, stats, and synergy are compared.` : "No single deck clearly separates on ceiling.",
    },
  ];

  return {
    summary: {
      better_for_fast_tables: deckLabel(fastest),
      better_for_slower_pods: deckLabel(longGame),
      more_consistent: deckLabel(consistent),
      highest_ceiling: deckLabel(strongest),
      one_line_verdict: overview.verdict,
    },
    sections: {
      key_differences: cards.map((deck) => `${deck.title}: ${deck.summary}`),
      strategy: [
        fastest ? `${fastest.title} is the cleanest pick when the table is quick.` : "Fast starts are contested.",
        interaction ? `${interaction.title} is best positioned to fight over key turns.` : "Interaction is close across the group.",
        longGame ? `${longGame.title} should scale best into longer games.` : "Long-game scaling is contested.",
      ],
      strengths_weaknesses: cards.map((deck) => {
        const weakness = deck.weaknesses[0] ? ` Main risk: ${deck.weaknesses[0]}` : "";
        return `${deck.title}: ${deck.tableRole}, power ${deck.power.level}/10, tempo ${deck.stats.tempo}, interaction ${deck.stats.interaction}.${weakness}`;
      }),
      recommended_scenarios: scenarioCards.map((card) => `${card.label}: ${card.winner}. ${card.reason}`),
    },
    full_analysis: {
      key_differences: cards.map((deck) => `${deck.title} is a ${deck.tableRole.toLowerCase()} with ${deck.summary}`).join(" "),
      strategy: overview.winnerReason,
      strengths_and_weaknesses: cards.map((deck) => `${deck.title}: strengths ${deck.strengths.join("; ") || "unclear"}; weaknesses ${deck.weaknesses.join("; ") || "unclear"}.`).join(" "),
      recommendations: "Pick the deck whose speed and interaction line up with the table, then mulligan around the matchup role rather than raw power alone.",
      best_in_different_scenarios: scenarioCards.map((card) => `${card.label}: ${card.winner}. ${card.reason}`).join(" "),
    },
    ui: {
      verdict_cards: verdictCards,
      deck_strengths: deckStrengths,
      scenario_cards: scenarioCards,
      rating_reasons: buildRatingReasons(cards),
      game_pattern: buildGamePattern(cards, overview),
      key_swing_cards: buildKeySwingCards(cards),
      upset_paths: buildUpsetPaths(cards, overview),
      confidence_label: confidenceLabelFor(cards, overview),
    },
  };
}

function buildDeterministicResult(inputDecks: CompareV2InputDeck[], grounded: Awaited<ReturnType<typeof buildDeckCompareGrounding>>, model: string): CompareV2Success {
  const emptyAiMap = new Map<string, number>();
  const cards = grounded.decks.map((deck, index) => deckCardFromGrounding(inputDecks[index], deck, emptyAiMap));
  const pricedValues = cards
    .map((deck) => deck.estimatedValueUsd)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const medianValue = pricedValues.length ? pricedValues[Math.floor(pricedValues.length / 2)] : null;
  const adjustedCards = medianValue && medianValue > 0
    ? cards.map((deck) => {
        const value = deck.estimatedValueUsd;
        if (!value || !Number.isFinite(value)) return deck;
        const ratio = value / medianValue;
        const valueAdjustment = ratio >= 2.25 ? 1 : ratio >= 1.55 ? 0.5 : ratio <= 0.45 ? -1 : ratio <= 0.65 ? -0.5 : 0;
        if (valueAdjustment === 0) return deck;
        const nextLevel = clampPowerScore(deck.power.level + valueAdjustment, deck.power.level);
        return {
          ...deck,
          power: {
            ...deck.power,
            deterministicScore: nextLevel,
            aiAdjustedScore: nextLevel,
            level: nextLevel,
          },
        };
      })
    : cards;
  const metricMedians = {
    tempo: medianNumber(adjustedCards.map((deck) => deck.stats.tempo)),
    consistency: medianNumber(adjustedCards.map((deck) => deck.stats.consistency)),
    interaction: medianNumber(adjustedCards.map((deck) => deck.stats.interaction)),
    resilience: medianNumber(adjustedCards.map((deck) => deck.stats.resilience)),
    closing: medianNumber(adjustedCards.map((deck) => deck.stats.closing)),
    mana: medianNumber(adjustedCards.map((deck) => deck.stats.mana)),
    synergy: medianNumber(adjustedCards.map((deck) => deck.stats.synergy)),
  };
  const relativeCardsBase = adjustedCards.map((deck) => ({
    ...deck,
    stats: {
      tempo: relativeMetricScore(deck.stats.tempo, metricMedians.tempo),
      consistency: relativeMetricScore(deck.stats.consistency, metricMedians.consistency),
      interaction: relativeMetricScore(deck.stats.interaction, metricMedians.interaction),
      resilience: relativeMetricScore(deck.stats.resilience, metricMedians.resilience),
      closing: relativeMetricScore(deck.stats.closing, metricMedians.closing),
      mana: relativeMetricScore(deck.stats.mana, metricMedians.mana),
      synergy: relativeMetricScore(deck.stats.synergy, metricMedians.synergy),
    },
  }));
  const relativeCards = withPodRanks(relativeCardsBase);
  const strongestDeckId = pickDeckId(relativeCards, (deck) => deck.power.level, "max");
  const weakestDeckId = pickDeckId(relativeCards, (deck) => deck.power.level, "min");
  const fastestDeckId = pickDeckId(relativeCards, (deck) => deck.stats.tempo, "max");
  const bestLongGameDeckId = pickDeckId(relativeCards, (deck) => deck.stats.resilience + deck.stats.consistency + deck.stats.closing, "max");
  const balance = podBalanceFor(relativeCards);
  const strongest = strongestDeckId ? relativeCards.find((deck) => deck.id === strongestDeckId) : null;

  const overview: CompareV2Success["overview"] = {
    strongestDeckId,
    weakestDeckId,
    fastestDeckId,
    bestLongGameDeckId,
    verdict: grounded.matrix.verdict,
    bullets: [
      strongestDeckId ? `${relativeCards.find((deck) => deck.id === strongestDeckId)?.title ?? "Top deck"} has the best overall power read.` : "",
      fastestDeckId ? `${relativeCards.find((deck) => deck.id === fastestDeckId)?.title ?? "Fastest deck"} has the strongest tempo score.` : "",
      bestLongGameDeckId ? `${relativeCards.find((deck) => deck.id === bestLongGameDeckId)?.title ?? "Long-game deck"} has the best long-game profile.` : "",
    ].filter(Boolean),
    winnerReason: strongest ? `${strongest.title} leads because its power, ${strongest.tableRole.toLowerCase()}, and matchup stats are strongest in this pod.` : "No single deck clearly separates from the pod.",
    podBalance: balance,
    podBalanceNote:
      balance === "balanced" ? "The pod looks close enough for normal games." :
      balance === "slightly_mismatched" ? "There is a noticeable spread, but the table is not wildly uneven." :
      "The pod looks mismatched; one or more decks may overpower the others.",
    pairwiseMatchups: buildPairwiseMatchups(relativeCards),
  };

  return {
    ok: true,
    format: inputDecks[0]?.format ?? "Commander",
    decks: relativeCards,
    overview,
    meta: {
      version: 1,
      model,
      usedAi: false,
      generated_at: new Date().toISOString(),
    },
    aiMatchup: buildAiMatchup(relativeCards, overview),
  };
}

function normalizeAiAdjustedResult(
  parsed: unknown,
  current: CompareV2Success,
): CompareV2Success {
  const obj = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  const aiDecks = Array.isArray(obj.decks) ? obj.decks : [];
  const byTitle = new Map<string, number>();
  for (const raw of aiDecks) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim().toLowerCase() : "";
    if (!title) continue;
    byTitle.set(title, clampPowerScore(row.powerLevel ?? row.power_level ?? row.power, current.decks.find((deck) => deck.title.toLowerCase() === title)?.power.level ?? 5));
  }
  const decks = current.decks.map((deck) => {
    const aiAdjustedScore = byTitle.get(deck.title.toLowerCase()) ?? deck.power.aiAdjustedScore;
    const strengthsRaw = aiDecks.find((raw) => raw && typeof raw === "object" && String((raw as Record<string, unknown>).title || "").trim().toLowerCase() === deck.title.toLowerCase()) as Record<string, unknown> | undefined;
    const strengths = Array.isArray(strengthsRaw?.strengths)
      ? strengthsRaw!.strengths.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 3)
      : deck.strengths;
    const weaknesses = Array.isArray(strengthsRaw?.weaknesses)
      ? strengthsRaw!.weaknesses.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 3)
      : deck.weaknesses;
    const watchOutFor = Array.isArray(strengthsRaw?.watchOutFor)
      ? strengthsRaw!.watchOutFor.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 3)
      : deck.watchOutFor;
    const swingCards = Array.isArray(strengthsRaw?.swingCards)
      ? strengthsRaw!.swingCards.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 5)
      : deck.swingCards;
    return {
      ...deck,
      power: { ...deck.power, aiAdjustedScore, level: aiAdjustedScore },
      strengths,
      weaknesses,
      tableRole: typeof strengthsRaw?.tableRole === "string" && strengthsRaw.tableRole.trim() ? strengthsRaw.tableRole.trim().slice(0, 80) : deck.tableRole,
      whyItWins: typeof strengthsRaw?.whyItWins === "string" && strengthsRaw.whyItWins.trim() ? strengthsRaw.whyItWins.trim().slice(0, 240) : deck.whyItWins,
      watchOutFor,
      swingCards,
      summary: typeof strengthsRaw?.summary === "string" && strengthsRaw.summary.trim() ? strengthsRaw.summary.trim().slice(0, 220) : deck.summary,
    };
  });
  const strongestDeckId = pickDeckId(decks, (deck) => deck.power.level, "max");
  const weakestDeckId = pickDeckId(decks, (deck) => deck.power.level, "min");
  const overview = {
    ...current.overview,
    strongestDeckId,
    weakestDeckId,
    verdict: typeof obj.verdict === "string" && obj.verdict.trim() ? obj.verdict.trim().slice(0, 420) : current.overview.verdict,
    bullets: Array.isArray(obj.bullets)
      ? obj.bullets.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 4)
      : current.overview.bullets,
    winnerReason: typeof obj.winnerReason === "string" && obj.winnerReason.trim() ? obj.winnerReason.trim().slice(0, 260) : current.overview.winnerReason,
    podBalanceNote: typeof obj.podBalanceNote === "string" && obj.podBalanceNote.trim() ? obj.podBalanceNote.trim().slice(0, 260) : current.overview.podBalanceNote,
  };
  const baseAiMatchup = buildAiMatchup(decks, overview);
  const aiUiOverrides = normalizeAiUiOverrides(obj.aiMatchupUi ?? obj.ai_matchup_ui ?? obj.ui ?? obj, baseAiMatchup.ui, decks);
  return {
    ...current,
    decks,
    overview,
    meta: { ...current.meta, usedAi: true },
    aiMatchup: {
      ...baseAiMatchup,
      ui: {
        ...baseAiMatchup.ui,
        ...aiUiOverrides,
      },
    },
  };
}

async function getRequestUser(req: Request) {
  let supabase = await createClient();
  let { data: ures } = await supabase.auth.getUser();
  let user = ures?.user ?? null;

  if (!user) {
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (bearerToken) {
      const { createClientWithBearerToken } = await import("@/lib/server-supabase");
      const bearerSupabase = createClientWithBearerToken(bearerToken);
      const { data: { user: bearerUser } } = await bearerSupabase.auth.getUser();
      if (bearerUser) {
        user = bearerUser;
        supabase = bearerSupabase;
      }
    }
  }

  return { supabase, user };
}

async function loadSavedDeck(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, deckId: string): Promise<CompareV2InputDeck | { error: string; status: number; code?: string }> {
  const { data: deck, error } = await supabase
    .from("decks")
    .select("id, user_id, title, commander, format, deck_text")
    .eq("id", deckId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !deck) return { error: "Deck not found.", status: 404, code: "OWN_DECK_NOT_FOUND" };

  const { data: rows } = await supabase
    .from("deck_cards")
    .select("name, qty, zone")
    .eq("deck_id", deckId);
  const cardRows = (rows ?? []) as DeckCardRow[];
  const format = titleCaseFormat((deck as { format?: string | null }).format);
  const deckText = rowsToDeckTextForAnalysis(cardRows, format) || String((deck as { deck_text?: string }).deck_text || "");
  const cardCount = totalRows(cardRows) || mainDeckTextCardCount(deckText, format);
  const canonicalFormat = normalizeDeckFormat(format);
  if (!canonicalFormat) return { error: "Unsupported deck format.", status: 400, code: "UNSUPPORTED_FORMAT" };
  if (cardCount < minCardsForFormat(format)) {
    return { error: `This ${format} deck needs at least ${minCardsForFormat(format)} cards before comparison.`, status: 400, code: "DECK_TOO_SMALL" };
  }
  return {
    id: String((deck as { id: string }).id),
    source: "own_saved",
    title: String((deck as { title?: string }).title || "My deck"),
    commander: typeof (deck as { commander?: unknown }).commander === "string" ? (deck as { commander: string }).commander : null,
    format,
    canonicalFormat,
    cardCount,
    deckText,
  };
}

function loadPastedDeck(input: z.infer<typeof deckInputSchema>): CompareV2InputDeck | { error: string; status: number; code?: string } {
  if (input.type !== "pasted") return { error: "Invalid pasted deck.", status: 400 };
  const format = titleCaseFormat(input.format);
  const canonicalFormat = normalizeDeckFormat(format);
  if (!canonicalFormat) return { error: "Unsupported deck format.", status: 400, code: "UNSUPPORTED_FORMAT" };
  const cardCount = mainDeckTextCardCount(input.deckText, format);
  if (cardCount < minCardsForFormat(format)) {
    return { error: `This ${format} deck needs at least ${minCardsForFormat(format)} cards before comparison.`, status: 400, code: "DECK_TOO_SMALL" };
  }
  const maxCards = maxPastedCardsForFormat(format);
  if (maxCards != null && cardCount > maxCards) {
    return { error: `Pasted ${format} decklists can be ${maxCards} cards max.`, status: 400, code: "DECK_TOO_LARGE" };
  }
  if (canonicalFormat === "commander" && !input.commander?.trim()) {
    return { error: "Pick the commander for this pasted Commander deck before comparison.", status: 400, code: "COMMANDER_REQUIRED" };
  }
  return {
    id: "own-pasted",
    source: "own_pasted",
    title: input.title?.trim() || "Pasted decklist",
    commander: input.commander?.trim() || null,
    format,
    canonicalFormat,
    cardCount,
    deckText: input.deckText,
  };
}

async function loadPublicDecks(deckIds: string[]): Promise<CompareV2InputDeck[] | { error: string; status: number; code?: string; details?: unknown }> {
  if (deckIds.length === 0) return [];
  const admin = getServiceRoleSupabase();
  if (!admin) return { error: "Server deck access is unavailable.", status: 500 };
  const { data: deckRows, error } = await admin
    .from("decks")
    .select("id, title, commander, format, deck_text, is_public")
    .in("id", deckIds)
    .eq("is_public", true);
  if (error) return { error: "Could not load scanned decks.", status: 500, details: error.message };
  if ((deckRows ?? []).length !== deckIds.length) {
    return { error: "One scanned deck is private or no longer available.", status: 404, code: "PUBLIC_DECK_NOT_FOUND" };
  }
  const { data: cardRows } = await admin
    .from("deck_cards")
    .select("deck_id, name, qty, zone")
    .in("deck_id", deckIds);
  const rowsByDeck = new Map<string, DeckCardRow[]>();
  for (const row of cardRows ?? []) {
    const deckId = String((row as { deck_id?: string }).deck_id || "");
    if (!deckId) continue;
    const arr = rowsByDeck.get(deckId) ?? [];
    arr.push(row as DeckCardRow);
    rowsByDeck.set(deckId, arr);
  }
  const decks: CompareV2InputDeck[] = [];
  for (const row of deckRows ?? []) {
    const deck = row as { id: string; title?: string | null; commander?: string | null; format?: string | null; deck_text?: string | null };
    const format = titleCaseFormat(deck.format);
    const canonicalFormat = normalizeDeckFormat(format);
    if (!canonicalFormat) return { error: `${deck.title || "A scanned deck"} uses an unsupported format.`, status: 400, code: "UNSUPPORTED_FORMAT" };
    const rows = rowsByDeck.get(deck.id) ?? [];
    const deckText = rowsToDeckTextForAnalysis(rows, format) || String(deck.deck_text || "");
    const cardCount = totalRows(rows) || mainDeckTextCardCount(deckText, format);
    if (cardCount < minCardsForFormat(format)) {
      return { error: `${deck.title || "A scanned deck"} needs at least ${minCardsForFormat(format)} cards before comparison.`, status: 400, code: "DECK_TOO_SMALL" };
    }
    decks.push({
      id: deck.id,
      source: "public_scan",
      title: deck.title?.trim() || "Scanned public deck",
      commander: deck.commander?.trim() || null,
      format,
      canonicalFormat,
      cardCount,
      deckText,
    });
  }
  const byInputOrder = deckIds.map((id) => decks.find((deck) => deck.id === id)).filter((deck): deck is CompareV2InputDeck => !!deck);
  return byInputOrder;
}

async function loadUnifiedDecks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  inputs: z.infer<typeof comparisonDeckSchema>[],
): Promise<CompareV2InputDeck[] | { error: string; status: number; code?: string }> {
  const savedIds = inputs.filter((deck) => deck.type === "saved").map((deck) => deck.deckId);
  const publicIds = inputs.filter((deck) => deck.type === "public").map((deck) => deck.deckId);
  const savedDecks: CompareV2InputDeck[] = [];
  for (const deckId of savedIds) {
    const loaded = await loadSavedDeck(supabase, userId, deckId);
    if ("error" in loaded) return loaded;
    savedDecks.push(loaded);
  }
  const publicDecks = await loadPublicDecks(publicIds);
  if ("error" in publicDecks) return publicDecks;
  const savedById = new Map(savedDecks.map((deck) => [deck.id, deck]));
  const publicById = new Map(publicDecks.map((deck) => [deck.id, deck]));
  const pastedByIndex = new Map<number, CompareV2InputDeck>();
  inputs.forEach((input, index) => {
    if (input.type !== "pasted") return;
    const loaded = loadPastedDeck(input);
    if (!("error" in loaded)) pastedByIndex.set(index, { ...loaded, id: `pasted-${index + 1}` });
  });
  for (const [index, input] of inputs.entries()) {
    if (input.type !== "pasted") continue;
    if (!pastedByIndex.has(index)) return loadPastedDeck(input) as { error: string; status: number; code?: string };
  }
  return inputs
    .map((input, index) => {
      if (input.type === "saved") return savedById.get(input.deckId);
      if (input.type === "public") return publicById.get(input.deckId);
      return pastedByIndex.get(index);
    })
    .filter((deck): deck is CompareV2InputDeck => !!deck);
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await getRequestUser(req);
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const { checkProStatus } = await import("@/lib/server-pro-check");
    const isPro = await checkProStatus(user.id).catch(() => false);

    const body = await req.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, code: "INVALID_INPUT", error: "Invalid compare request." }, { status: 400 });
    }
    let decks: CompareV2InputDeck[];
    if (parsed.data.decks?.length) {
      const keyed = parsed.data.decks
        .filter((deck) => deck.type !== "pasted")
        .map((deck) => `${deck.type}:${deck.deckId}`);
      if (new Set(keyed).size !== keyed.length) {
        return NextResponse.json({ ok: false, code: "DUPLICATE_DECK", error: "That deck has already been added." }, { status: 400 });
      }
      const loaded = await loadUnifiedDecks(supabase, user.id, parsed.data.decks);
      if ("error" in loaded) return NextResponse.json({ ok: false, code: loaded.code, error: loaded.error }, { status: loaded.status });
      decks = loaded;
    } else {
      if (!parsed.data.ownDeck) {
        return NextResponse.json({ ok: false, code: "INVALID_INPUT", error: "Add between 2 and 6 decks." }, { status: 400 });
      }
      const comparisonDecks = parsed.data.comparisonDecks ?? (parsed.data.publicDeckIds ?? []).map((deckId) => ({ type: "public" as const, deckId }));
      const ownDeck =
        parsed.data.ownDeck.type === "saved"
          ? await loadSavedDeck(supabase, user.id, parsed.data.ownDeck.deckId)
          : loadPastedDeck(parsed.data.ownDeck);
      if ("error" in ownDeck) return NextResponse.json({ ok: false, code: ownDeck.code, error: ownDeck.error }, { status: ownDeck.status });
      const loaded = await loadUnifiedDecks(supabase, user.id, comparisonDecks);
      if ("error" in loaded) return NextResponse.json({ ok: false, code: loaded.code, error: loaded.error }, { status: loaded.status });
      decks = [ownDeck, ...loaded];
    }
    if (decks.length < 2 || decks.length > MAX_DECKS) {
      return NextResponse.json({ ok: false, code: "DECK_COUNT_INVALID", error: "Compare between 2 and 6 decks." }, { status: 400 });
    }
    const anchorDeck = decks[0];
    const format = anchorDeck.canonicalFormat;
    const mismatch = decks.find((deck) => deck.canonicalFormat !== format);
    if (mismatch) {
      return NextResponse.json(
        {
          ok: false,
          code: "FORMAT_MISMATCH",
          error: `${mismatch.title} is ${mismatch.format}. Deck Compare V2 currently needs all decks to use ${anchorDeck.format}.`,
        },
        { status: 400 },
      );
    }

    const decksRaw = decks.map(formatDeckBlock).join("\n\n---\n\n");
    const grounded = await buildDeckCompareGrounding(decksRaw, anchorDeck.format, { maxDecks: MAX_DECKS });
    const model = process.env.MODEL_DECK_COMPARE_V2 || process.env.MODEL_DECK_COMPARE_MOBILE_PRO || DEFAULT_FREE_MODEL;
    const deterministic = buildDeterministicResult(decks, grounded, model);

    const { resolveAiUsageSourceForRequest } = await import("@/lib/ai/manatap-client-origin");
    const usageSource = resolveAiUsageSourceForRequest(req, body, null);
    const sourcePage = parsed.data.sourcePage ?? parsed.data.source_page ?? "app_deck_compare_v2";
    const executionContext = {
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
      latencyBudgetMs: 120000,
    };

    const groundingPacket = buildCompactGroundingPacket({
      title: "GROUND TRUTH",
      format: anchorDeck.format,
      lines: grounded.decks.map((deck) => {
        const i = deck.intelligence;
        return `${deck.label}: title=${deck.label}; power=${i.powerScore}/100; tempo=${i.tempoScore}; consistency=${i.consistencyScore}; interaction=${i.interactionScore}; resilience=${i.resilienceScore}; closing=${i.closingScore}; mana=${i.manaQualityScore}; synergy=${i.synergyScore}; price=${i.estimatedPriceUsd ?? "unknown"}; top_cards=${i.premiumCards.join(", ")}; risks=${i.weakSignals.join("; ")}.`;
      }),
    });

    const flow = await runStructuredAiFlow<CompareV2Success>({
      context: executionContext,
      routePath: ROUTE_PATH,
      deterministic,
      judge: {
        enabled: true,
        passName: "judge",
        maxTokens: 1800,
        timeoutMs: 120000,
        buildMessages: () => [
          {
            role: "system",
            content: [
              "You are an expert Magic: The Gathering deck power evaluator.",
              "Return only JSON. Do not invent cards. Use the ground truth numbers and deck titles.",
              "You may adjust each deck's final powerLevel from 1 to 10 if the deterministic score misses synergy, combo density, premium card impact, or format context.",
              "Evaluate power relative to this exact group of decks. If one deck is much more expensive than the others, treat that as a supporting signal for stronger staples, mana, tutors, or interaction, but do not let price alone decide power.",
              "Also compare tempo, interaction, consistency, resilience, closing, mana, and synergy relative to the other decks in this request when writing strengths and weaknesses.",
              "Make the Pro analysis feel like matchup coaching: explain why ratings changed, game timeline, swing cards, upset paths, and whether the result is close/favored/dominant.",
              "Use exact deck titles. Card names in swing/upset fields must be real names from the provided deck data, not invented cards.",
            ].join(" "),
          },
          {
            role: "user",
            content: [
              groundingPacket,
              "",
              "Return JSON with this shape:",
              '{"decks":[{"title":"exact title","powerLevel":1-10,"tableRole":"short role","whyItWins":"short reason","watchOutFor":["max 3"],"swingCards":["max 5 card names"],"summary":"short","strengths":["max 3"],"weaknesses":["max 3"]}],"verdict":"short overview","winnerReason":"why top deck leads","podBalanceNote":"short balance/fairness note","bullets":["max 4"],"confidence_label":"close|favored|dominant","rating_reasons":[{"title":"exact deck title","summary":"max 1 sentence","drivers":["value","speed","interaction","consistency","win lines"],"confidence":"low|medium|high"}],"game_pattern":{"early":{"winner":"exact title or Contested","reason":"1 sentence"},"mid":{"winner":"exact title or Contested","reason":"1 sentence"},"late":{"winner":"exact title or Contested","reason":"1 sentence"}},"key_swing_cards":[{"title":"exact deck title","cards":["max 5 real card names"],"why":"1 sentence"}],"upset_paths":[{"title":"exact non-top deck title","target":"exact top deck title","path":"1 sentence","keyCards":["max 4 real card names"]}]}',
              "",
              `Current deterministic result:\n${JSON.stringify(deterministic)}`,
            ].join("\n"),
          },
        ],
        parse: (text, current) => normalizeAiAdjustedResult(parseJsonObjectFromLlmText(text), current),
      },
      writer: { enabled: false, passName: "writer", buildMessages: () => [], parse: (_text, current) => current },
      critic: { enabled: false, passName: "critic", buildMessages: () => [], parse: (_text, current) => current },
    });

    return NextResponse.json({
      ...flow.value,
      meta: {
        ...flow.value.meta,
        model: flow.model,
        usedAi: flow.usedAi,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.error("[mobile/deck/compare-v2] route error:", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
