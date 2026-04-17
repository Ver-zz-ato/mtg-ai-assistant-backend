/**
 * Structured response for POST /api/mobile/deck/compare-ai.
 * Validates / normalizes model JSON so the route always returns a stable shape.
 */

import { z } from "zod";

/** Bump when mobile compare response contract changes (e.g. optional `ui` block). */
export const MOBILE_COMPARE_AI_VERSION = 2;

const MAX_SECTION_ITEMS = 5;
const MAX_VERDICT_LEN = 220;
const MAX_BULLET_LEN = 200;
const MAX_FULL_PARA_LEN = 1200;

const mobileCompareAiRawSchema = z
  .object({
    summary: z.record(z.string(), z.unknown()).optional(),
    sections: z.record(z.string(), z.unknown()).optional(),
    full_analysis: z.record(z.string(), z.unknown()).optional(),
    ui: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type MobileDeckCompareSummary = {
  better_for_fast_tables: string;
  better_for_slower_pods: string;
  more_consistent: string;
  highest_ceiling: string;
  one_line_verdict: string;
};

export type MobileDeckCompareSections = {
  key_differences: string[];
  strategy: string[];
  strengths_weaknesses: string[];
  recommended_scenarios: string[];
};

export type MobileDeckCompareFullAnalysis = {
  key_differences: string;
  strategy: string;
  strengths_and_weaknesses: string;
  recommendations: string;
  best_in_different_scenarios: string;
};

export type MobileDeckCompareMeta = {
  version: number;
  model: string;
  generated_at: string;
};

/** App-native optional block (v2+). Always populated after normalization with model or derived data. */
export type MobileDeckCompareUi = {
  verdict_cards: { label: string; winner: string }[];
  deck_strengths: {
    deck_a: string[];
    deck_b: string[];
    deck_c?: string[];
  };
  scenario_cards: { label: string; winner: string; reason: string }[];
};

export type MobileDeckCompareSuccess = {
  ok: true;
  summary: MobileDeckCompareSummary;
  sections: MobileDeckCompareSections;
  full_analysis: MobileDeckCompareFullAnalysis;
  meta: MobileDeckCompareMeta;
  /** v2+: populated by normalizer (model + fallbacks). Older clients may ignore. */
  ui: MobileDeckCompareUi;
};

function trimStr(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function asStringArray(v: unknown, maxItems: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string") continue;
    const line = trimStr(x, MAX_BULLET_LEN);
    if (line) out.push(line);
    if (out.length >= maxItems) break;
  }
  return out;
}

function pickFirstSentenceFromBullets(bullets: string[]): string {
  const joined = bullets.join(" ").replace(/\s+/g, " ").trim();
  if (!joined) return "";
  const m = joined.match(/^(.{10,220}?[.!?])(\s|$)/);
  if (m?.[1]) return m[1].trim();
  return trimStr(joined, MAX_VERDICT_LEN);
}

function emptyFullAnalysis(): MobileDeckCompareFullAnalysis {
  return {
    key_differences: "",
    strategy: "",
    strengths_and_weaknesses: "",
    recommendations: "",
    best_in_different_scenarios: "",
  };
}

function normalizeFullAnalysisBlock(raw: Record<string, unknown> | undefined): MobileDeckCompareFullAnalysis {
  const base = emptyFullAnalysis();
  if (!raw || typeof raw !== "object") return base;
  return {
    key_differences: trimStr(raw.key_differences ?? raw.keyDifferences, MAX_FULL_PARA_LEN),
    strategy: trimStr(raw.strategy, MAX_FULL_PARA_LEN),
    strengths_and_weaknesses: trimStr(
      raw.strengths_and_weaknesses ?? raw.strengthsWeaknesses ?? raw.strengths_weaknesses,
      MAX_FULL_PARA_LEN
    ),
    recommendations: trimStr(raw.recommendations ?? raw.recommendation, MAX_FULL_PARA_LEN),
    best_in_different_scenarios: trimStr(
      raw.best_in_different_scenarios ?? raw.bestInDifferentScenarios ?? raw.when_each_deck_is_better,
      MAX_FULL_PARA_LEN
    ),
  };
}

function normalizeSectionsBlock(raw: Record<string, unknown> | undefined): MobileDeckCompareSections {
  const empty: MobileDeckCompareSections = {
    key_differences: [],
    strategy: [],
    strengths_weaknesses: [],
    recommended_scenarios: [],
  };
  if (!raw || typeof raw !== "object") return empty;
  return {
    key_differences: asStringArray(raw.key_differences ?? raw.keyDifferences, MAX_SECTION_ITEMS),
    strategy: asStringArray(raw.strategy, MAX_SECTION_ITEMS),
    strengths_weaknesses: asStringArray(
      raw.strengths_weaknesses ?? raw.strengths_and_weaknesses ?? raw.strengthsWeaknesses,
      MAX_SECTION_ITEMS
    ),
    recommended_scenarios: asStringArray(
      raw.recommended_scenarios ?? raw.recommendations_short ?? raw.when_better,
      MAX_SECTION_ITEMS
    ),
  };
}

const MAX_VERDICT_CARDS = 4;
const MAX_STRENGTH_PER_DECK = 3;
const MAX_SCENARIO_CARDS = 3;
const MAX_UI_LABEL_LEN = 40;
const MAX_UI_WINNER_LEN = 80;
const MAX_UI_REASON_LEN = 180;
const MAX_STRENGTH_PHRASE_LEN = 100;

const DEFAULT_VERDICT_LABELS = ["Fast tables", "Slower pods", "More consistent", "Highest ceiling"];

function asStrengthPhrases(v: unknown, maxItems: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string") continue;
    const line = trimStr(x, MAX_STRENGTH_PHRASE_LEN);
    if (line) out.push(line);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeVerdictCards(
  raw: unknown,
  summary: MobileDeckCompareSummary
): MobileDeckCompareUi["verdict_cards"] {
  const parsed: MobileDeckCompareUi["verdict_cards"] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (parsed.length >= MAX_VERDICT_CARDS) break;
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const label = trimStr(o.label ?? o.title, MAX_UI_LABEL_LEN);
      const winner = trimStr(o.winner ?? o.deck ?? o.pick, MAX_UI_WINNER_LEN);
      if (!label || !winner) continue;
      parsed.push({ label, winner });
    }
  }
  if (parsed.length >= MAX_VERDICT_CARDS) return parsed.slice(0, MAX_VERDICT_CARDS);
  const defaults: MobileDeckCompareUi["verdict_cards"] = [
    { label: DEFAULT_VERDICT_LABELS[0], winner: trimStr(summary.better_for_fast_tables, MAX_UI_WINNER_LEN) || "—" },
    { label: DEFAULT_VERDICT_LABELS[1], winner: trimStr(summary.better_for_slower_pods, MAX_UI_WINNER_LEN) || "—" },
    { label: DEFAULT_VERDICT_LABELS[2], winner: trimStr(summary.more_consistent, MAX_UI_WINNER_LEN) || "—" },
    { label: DEFAULT_VERDICT_LABELS[3], winner: trimStr(summary.highest_ceiling, MAX_UI_WINNER_LEN) || "—" },
  ];
  if (parsed.length === 0) return defaults;
  const merged = [...parsed];
  for (let i = merged.length; i < MAX_VERDICT_CARDS; i++) {
    merged.push(defaults[i]);
  }
  return merged.slice(0, MAX_VERDICT_CARDS);
}

function deriveDeckStrengthsFromSections(
  sections: MobileDeckCompareSections,
  deckCount: number
): MobileDeckCompareUi["deck_strengths"] {
  const kd = sections.key_differences;
  const sw = sections.strengths_weaknesses;
  const st = sections.strategy;
  const deck_a = [kd[0], sw[0], st[0]].filter((x): x is string => typeof x === "string" && trimStr(x, 1).length > 0).map((s) => trimStr(s, MAX_STRENGTH_PHRASE_LEN)).slice(0, MAX_STRENGTH_PER_DECK);
  const deck_b = [kd[1], sw[1], st[1]].filter((x): x is string => typeof x === "string" && trimStr(x, 1).length > 0).map((s) => trimStr(s, MAX_STRENGTH_PHRASE_LEN)).slice(0, MAX_STRENGTH_PER_DECK);
  const deck_c =
    deckCount >= 3
      ? [kd[2], sw[2], st[2]].filter((x): x is string => typeof x === "string" && trimStr(x, 1).length > 0).map((s) => trimStr(s, MAX_STRENGTH_PHRASE_LEN)).slice(0, MAX_STRENGTH_PER_DECK)
      : undefined;
  return {
    deck_a,
    deck_b,
    ...(deck_c && deck_c.length ? { deck_c } : {}),
  };
}

function normalizeDeckStrengths(
  raw: unknown,
  sections: MobileDeckCompareSections,
  deckCount: number
): MobileDeckCompareUi["deck_strengths"] {
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const a = asStrengthPhrases(r.deck_a ?? r.deckA, MAX_STRENGTH_PER_DECK);
    const b = asStrengthPhrases(r.deck_b ?? r.deckB, MAX_STRENGTH_PER_DECK);
    const cRaw = deckCount >= 3 ? asStrengthPhrases(r.deck_c ?? r.deckC, MAX_STRENGTH_PER_DECK) : [];
    if (a.length > 0 || b.length > 0 || cRaw.length > 0) {
      return {
        deck_a: a,
        deck_b: b,
        ...(deckCount >= 3 && cRaw.length > 0 ? { deck_c: cRaw } : {}),
      };
    }
  }
  return deriveDeckStrengthsFromSections(sections, deckCount);
}

function normalizeScenarioCards(
  raw: unknown,
  summary: MobileDeckCompareSummary,
  sections: MobileDeckCompareSections
): MobileDeckCompareUi["scenario_cards"] {
  const out: MobileDeckCompareUi["scenario_cards"] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (out.length >= MAX_SCENARIO_CARDS) break;
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const label = trimStr(o.label ?? o.title, MAX_UI_LABEL_LEN);
      const winner = trimStr(o.winner ?? o.deck ?? o.pick, MAX_UI_WINNER_LEN);
      let reason = trimStr(o.reason ?? o.summary, MAX_UI_REASON_LEN);
      if (!label) continue;
      if (!reason) reason = trimStr(summary.one_line_verdict, MAX_UI_REASON_LEN);
      if (!reason) continue;
      out.push({ label, winner: winner || "—", reason });
    }
  }
  if (out.length > 0) return out.slice(0, MAX_SCENARIO_CARDS);
  for (const line of sections.recommended_scenarios.slice(0, MAX_SCENARIO_CARDS)) {
    const t = trimStr(line, MAX_UI_REASON_LEN);
    if (!t) continue;
    out.push({ label: "Pick when", winner: "—", reason: t });
  }
  if (out.length > 0) return out;
  const one = trimStr(summary.one_line_verdict, MAX_UI_REASON_LEN);
  if (one) return [{ label: "Summary", winner: "—", reason: one }];
  return [];
}

function normalizeUiBlock(
  rawUi: unknown,
  summary: MobileDeckCompareSummary,
  sections: MobileDeckCompareSections,
  deckCount: number
): MobileDeckCompareUi {
  const raw = rawUi && typeof rawUi === "object" ? (rawUi as Record<string, unknown>) : {};
  return {
    verdict_cards: normalizeVerdictCards(raw.verdict_cards, summary),
    deck_strengths: normalizeDeckStrengths(raw.deck_strengths, sections, deckCount),
    scenario_cards: normalizeScenarioCards(raw.scenario_cards, summary, sections),
  };
}

function normalizeSummaryBlock(
  raw: Record<string, unknown> | undefined,
  sections: MobileDeckCompareSections,
  deckCount: number
): MobileDeckCompareSummary {
  const defFast = "Deck B";
  const defSlow = "Deck A";
  const defConsistent = "Deck A";
  const defCeiling = deckCount >= 3 ? "Deck C" : "Deck B";
  const fb = (v: unknown, def: string) => {
    const t = trimStr(v, 80);
    return t || def;
  };
  let oneLine = trimStr(raw?.one_line_verdict ?? raw?.oneLineVerdict ?? raw?.verdict, MAX_VERDICT_LEN);
  if (!oneLine) {
    oneLine = pickFirstSentenceFromBullets([
      ...sections.key_differences.slice(0, 2),
      ...sections.strategy.slice(0, 1),
    ]);
  }
  if (!oneLine) {
    oneLine = "Compare tempo, interaction, and finishers using the section bullets below.";
  }

  return {
    better_for_fast_tables: fb(raw?.better_for_fast_tables ?? raw?.betterForFastTables, defFast),
    better_for_slower_pods: fb(raw?.better_for_slower_pods ?? raw?.betterForSlowerPods, defSlow),
    more_consistent: fb(raw?.more_consistent ?? raw?.moreConsistent, defConsistent),
    highest_ceiling: fb(raw?.highest_ceiling ?? raw?.highestCeiling, defCeiling),
    one_line_verdict: oneLine,
  };
}

/** Strip ```json fences if the model added them despite response_format. */
export function parseJsonObjectFromLlmText(text: string): unknown {
  let s = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```/im.exec(s);
  if (fence?.[1]) s = fence[1].trim();
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * Normalize parsed JSON into the mobile contract. `deckCount` is 2 or 3 (for label fallbacks).
 */
export function normalizeMobileDeckCompareResponse(
  parsed: unknown,
  deckCount: number,
  model: string
): MobileDeckCompareSuccess {
  const parsedObj =
    parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  const raw = mobileCompareAiRawSchema.safeParse(parsedObj);
  const o = raw.success ? raw.data : {};

  const sections = normalizeSectionsBlock(o.sections as Record<string, unknown> | undefined);
  const full = normalizeFullAnalysisBlock(o.full_analysis as Record<string, unknown> | undefined);

  /** Backfill full_analysis paragraphs from section bullets if model omitted prose. */
  if (!full.key_differences && sections.key_differences.length) {
    full.key_differences = sections.key_differences.join(" ");
  }
  if (!full.strategy && sections.strategy.length) {
    full.strategy = sections.strategy.join(" ");
  }
  if (!full.strengths_and_weaknesses && sections.strengths_weaknesses.length) {
    full.strengths_and_weaknesses = sections.strengths_weaknesses.join(" ");
  }
  if (!full.best_in_different_scenarios && sections.recommended_scenarios.length) {
    full.best_in_different_scenarios = sections.recommended_scenarios.join(" ");
  }

  const summary = normalizeSummaryBlock(o.summary as Record<string, unknown> | undefined, sections, deckCount);

  const ui = normalizeUiBlock(o.ui, summary, sections, deckCount);

  return {
    ok: true,
    summary,
    sections,
    full_analysis: full,
    meta: {
      version: MOBILE_COMPARE_AI_VERSION,
      model: trimStr(model, 120) || "unknown",
      generated_at: new Date().toISOString(),
    },
    ui,
  };
}
