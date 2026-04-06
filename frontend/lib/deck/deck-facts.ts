/**
 * Build deck-facts snapshot from tagged cards.
 * Includes archetype/engine/win-pattern candidates with scores and uncertainty flags.
 */

import { isLandForDeck, type TaggedCard } from "./card-role-tags";

export type ArchetypeCandidate = { name: string; score: number };
export type UncertaintyFlag =
  | "partial_enrichment"
  | "low_cache_coverage"
  | "unclear_commander"
  | "ambiguous_archetype"
  | "legality_incomplete"
  | "hybrid_plan_detected";

export type DeckFacts = {
  commander: string | null;
  format: "Commander" | "Modern" | "Pioneer";
  color_identity: string[];
  land_count: number;
  nonland_count: number;
  avg_cmc: number;
  curve_histogram: number[];
  ramp_count: number;
  draw_count: number;
  interaction_count: number;
  interaction_buckets: { stack: number; spot: number; sweepers: number; repeatable: number; gy_hate: number };
  role_counts: Record<string, number>;
  legality_flags: string[];
  off_color_cards: string[];
  banned_cards: string[];
  archetype_candidates: ArchetypeCandidate[];
  engine_candidates: ArchetypeCandidate[];
  win_pattern_candidates: ArchetypeCandidate[];
  curve_profile: "aggro" | "midrange" | "battlecruiser" | "control" | "combo" | "unknown";
  uncertainty_flags: UncertaintyFlag[];
  /** When partial_enrichment is set, number of unresolved cards. */
  partial_enrichment_count?: number;
};

const RAMP_TAGS = new Set(["ramp", "land_ramp", "mana_rock", "mana_dork"]);
const DRAW_TAGS = new Set(["draw", "impulse_draw", "repeatable_draw"]);
const INTERACTION_TAGS = {
  stack: new Set(["counterspell"]),
  spot: new Set(["spot_removal"]),
  sweepers: new Set(["board_wipe"]),
  repeatable: new Set([]),
  gy_hate: new Set(["graveyard_hate", "artifact_hate"]),
};

const ARCHETYPE_SIGNALS: Record<string, Set<string>> = {
  aristocrats: new Set(["sac_outlet", "death_payoff", "token_producer"]),
  tokens: new Set(["token_producer", "token_payoff", "payoff"]),
  graveyard: new Set(["recursion", "graveyard_setup", "death_payoff"]),
  spellslinger: new Set(["draw", "counterspell", "payoff", "engine"]),
  reanimator: new Set(["graveyard_setup", "recursion", "finisher"]),
  ramp_midrange: new Set(["ramp", "land_ramp", "draw", "finisher"]),
  combo: new Set(["combo_piece", "tutor", "engine"]),
};

const ENGINE_SIGNALS: Record<string, Set<string>> = {
  sacrifice: new Set(["sac_outlet", "death_payoff"]),
  tokens: new Set(["token_producer", "token_payoff"]),
  recursion: new Set(["recursion", "graveyard_setup"]),
  blink: new Set(["blink", "etb_enabler"]),
  storm: new Set(["draw", "payoff"]),
};

const WIN_SIGNALS: Record<string, Set<string>> = {
  combat: new Set(["finisher", "token_producer"]),
  drain: new Set(["death_payoff"]),
  combo: new Set(["combo_piece", "finisher"]),
  mill: new Set(["recursion", "graveyard_setup"]),
};

function scoreArchetype(tagSet: Set<string>, signals: Record<string, Set<string>>): ArchetypeCandidate[] {
  return Object.entries(signals).map(([name, sig]) => {
    let overlap = 0;
    for (const t of sig) {
      if (tagSet.has(t)) overlap++;
    }
    const score = overlap / sig.size;
    return { name, score };
  }).filter((c) => c.score > 0).sort((a, b) => b.score - a.score);
}

function inferCurveProfile(avgCmc: number, hist: number[]): DeckFacts["curve_profile"] {
  const low = hist[0] + hist[1];
  const mid = hist[2] + hist[3];
  const high = hist[4];
  const total = low + mid + high;
  if (total === 0) return "unknown";
  if (avgCmc < 2.5 && low / total > 0.5) return "aggro";
  if (avgCmc > 4.2 && high / total > 0.2) return "battlecruiser";
  if (mid / total > 0.4 && avgCmc >= 3) return "midrange";
  return "midrange";
}

export type BuildDeckFactsOptions = {
  format?: "Commander" | "Modern" | "Pioneer";
  commander?: string | null;
  formatLegalities?: Record<string, string>;
};

export function buildDeckFacts(
  taggedCards: TaggedCard[],
  options: BuildDeckFactsOptions = {}
): DeckFacts {
  const format = options.format ?? "Commander";
  const commander = options.commander ?? null;

  const lands = taggedCards.filter((c) => isLandForDeck(c));
  const nonlands = taggedCards.filter((c) => !isLandForDeck(c));

  const landCount = lands.reduce((s, c) => s + c.qty, 0);
  const nonlandCount = nonlands.reduce((s, c) => s + c.qty, 0);

  let totalCmc = 0;
  let cmcCards = 0;
  const hist = [0, 0, 0, 0, 0];

  for (const c of nonlands) {
    const cmc = c.cmc ?? 0;
    totalCmc += cmc * c.qty;
    cmcCards += c.qty;
    if (cmc <= 1) hist[0] += c.qty;
    else if (cmc <= 2) hist[1] += c.qty;
    else if (cmc <= 3) hist[2] += c.qty;
    else if (cmc <= 4) hist[3] += c.qty;
    else hist[4] += c.qty;
  }
  const avgCmc = cmcCards > 0 ? totalCmc / cmcCards : 0;

  const roleCounts: Record<string, number> = {};
  const allTags = new Set<string>();
  for (const c of taggedCards) {
    for (const { tag } of c.tags) {
      allTags.add(tag);
      roleCounts[tag] = (roleCounts[tag] || 0) + c.qty;
    }
  }

  let rampCount = 0;
  let drawCount = 0;
  let interactionCount = 0;
  const buckets = { stack: 0, spot: 0, sweepers: 0, repeatable: 0, gy_hate: 0 };
  for (const c of taggedCards) {
    const tagNames = new Set(c.tags.map((t) => t.tag));
    if ([...tagNames].some((t) => RAMP_TAGS.has(t))) rampCount += c.qty;
    if ([...tagNames].some((t) => DRAW_TAGS.has(t))) drawCount += c.qty;
    if (tagNames.has("counterspell")) { interactionCount += c.qty; buckets.stack += c.qty; }
    if (tagNames.has("spot_removal")) { interactionCount += c.qty; buckets.spot += c.qty; }
    if (tagNames.has("board_wipe")) { interactionCount += c.qty; buckets.sweepers += c.qty; }
    if (tagNames.has("graveyard_hate") || tagNames.has("artifact_hate")) { buckets.gy_hate += c.qty; }
  }

  const colorIdentity = new Set<string>();
  if (commander) {
    const cmd = taggedCards.find((c) => c.name.toLowerCase() === commander.toLowerCase());
    (cmd?.color_identity || []).forEach((c) => colorIdentity.add(c.toUpperCase()));
  }
  for (const c of nonlands) {
    (c.color_identity || []).forEach((col) => colorIdentity.add(col.toUpperCase()));
  }

  const legalityFlags: string[] = [];
  const offColorCards: string[] = [];
  const bannedCards: string[] = [];
  const formatKey = format.toLowerCase();
  let legalityIncomplete = false;
  for (const c of taggedCards) {
    if (c.cache_miss) continue;
    const leg = c.legalities?.[formatKey];
    if (!leg) legalityIncomplete = true;
    if (leg === "banned" || leg === "not_legal") bannedCards.push(c.name);
    const ci = new Set((c.color_identity || []).map((x) => x.toUpperCase()));
    if (commander && colorIdentity.size > 0 && ci.size > 0) {
      const allowed = [...colorIdentity];
      const hasOff = [...ci].some((col) => col !== "C" && !allowed.includes(col));
      if (hasOff) offColorCards.push(c.name);
    }
  }

  const archetypeCandidates = scoreArchetype(allTags, ARCHETYPE_SIGNALS);
  const engineCandidates = scoreArchetype(allTags, ENGINE_SIGNALS);
  const winPatternCandidates = scoreArchetype(allTags, WIN_SIGNALS);

  const curveProfile = inferCurveProfile(avgCmc, hist);

  const uncertaintyFlags: UncertaintyFlag[] = [];
  const cacheMissCount = taggedCards.filter((c) => c.cache_miss).length;
  if (cacheMissCount > 0) {
    uncertaintyFlags.push("partial_enrichment");
  }
  if (cacheMissCount > taggedCards.length * 0.1) uncertaintyFlags.push("low_cache_coverage");
  if (!commander && format === "Commander") uncertaintyFlags.push("unclear_commander");
  if (archetypeCandidates[0]?.score < 0.6) uncertaintyFlags.push("ambiguous_archetype");
  if (archetypeCandidates.length >= 2 && archetypeCandidates[0]?.score - archetypeCandidates[1]?.score < 0.2) {
    uncertaintyFlags.push("hybrid_plan_detected");
  }
  if (legalityIncomplete) uncertaintyFlags.push("legality_incomplete");

  return {
    commander,
    format,
    color_identity: Array.from(colorIdentity),
    land_count: landCount,
    nonland_count: nonlandCount,
    avg_cmc: avgCmc,
    curve_histogram: hist,
    ramp_count: rampCount,
    draw_count: drawCount,
    interaction_count: interactionCount,
    interaction_buckets: buckets,
    role_counts: roleCounts,
    legality_flags: legalityFlags,
    off_color_cards: offColorCards,
    banned_cards: bannedCards,
    archetype_candidates: archetypeCandidates,
    engine_candidates: engineCandidates,
    win_pattern_candidates: winPatternCandidates,
    curve_profile: curveProfile,
    uncertainty_flags: uncertaintyFlags,
    partial_enrichment_count: cacheMissCount > 0 ? cacheMissCount : undefined,
  };
}
