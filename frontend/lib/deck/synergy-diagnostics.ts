/**
 * Heuristic synergy diagnostics: centrality scoring, core/support/peripheral buckets,
 * low-synergy candidates, tension flags.
 */

import type { TaggedCard } from "./card-role-tags";
import type { DeckFacts } from "./deck-facts";

export type SynergyDiagnostics = {
  top_synergy_clusters: string[][];
  primary_engine_cards: string[];
  primary_payoff_cards: string[];
  core_cards: string[];
  support_cards: string[];
  peripheral_cards: string[];
  low_synergy_candidates: string[];
  off_plan_candidates: string[];
  inefficient_slot_candidates: string[];
  missing_support: string[];
  tension_flags: string[];
};

function norm(s: string): string {
  return s.toLowerCase().trim();
}

function centralityScore(
  card: TaggedCard,
  allCards: TaggedCard[],
  commander: string | null,
  deckFacts: DeckFacts
): number {
  let score = 0;
  const cardTags = new Set(card.tags.map((t) => t.tag));

  for (const other of allCards) {
    if (other.name === card.name) continue;
    const otherTags = new Set(other.tags.map((t) => t.tag));
    const overlap = [...cardTags].filter((t) => otherTags.has(t)).length;
    score += overlap * 0.15;
  }

  if (commander && norm(card.name) === norm(commander)) {
    score += 1.5;
  }

  const engineTags = new Set(["engine", "sac_outlet", "recursion", "token_producer", "blink"]);
  const payoffTags = new Set(["death_payoff", "token_payoff", "finisher", "payoff"]);
  const isEngine = [...cardTags].some((t) => engineTags.has(t));
  const isPayoff = [...cardTags].some((t) => payoffTags.has(t));
  const hasEnginePayoffLink = allCards.some((c) => {
    if (c.name === card.name) return false;
    const ct = new Set(c.tags.map((t) => t.tag));
    return (isEngine && [...ct].some((t) => payoffTags.has(t))) || (isPayoff && [...ct].some((t) => engineTags.has(t)));
  });
  if (hasEnginePayoffLink) score += 0.5;

  const tagFreq: Record<string, number> = {};
  for (const c of allCards) {
    for (const { tag } of c.tags) {
      tagFreq[tag] = (tagFreq[tag] || 0) + 1;
    }
  }
  const sharedBonus = [...cardTags].reduce((sum, t) => sum + Math.min(tagFreq[t] || 0, 5) * 0.05, 0);
  score += sharedBonus;

  return score;
}

export function buildSynergyDiagnostics(
  taggedCards: TaggedCard[],
  commander: string | null,
  deckFacts: DeckFacts
): SynergyDiagnostics {
  const nonlands = taggedCards.filter((c) => !(c.type_line || "").toLowerCase().includes("land"));
  const cardsWithScore = nonlands.map((c) => ({
    card: c,
    score: centralityScore(c, taggedCards, commander, deckFacts),
  }));
  cardsWithScore.sort((a, b) => b.score - a.score);

  const n = cardsWithScore.length;
  const coreThreshold = Math.ceil(n * 0.2);
  const supportThreshold = Math.ceil(n * 0.5);
  const coreCards = cardsWithScore.slice(0, coreThreshold).map((x) => x.card.name);
  const supportCards = cardsWithScore.slice(coreThreshold, supportThreshold).map((x) => x.card.name);
  const peripheralCards = cardsWithScore.slice(supportThreshold).map((x) => x.card.name);

  const primaryEngine = nonlands.filter((c) => c.tags.some((t) => ["engine", "sac_outlet", "recursion", "token_producer", "blink"].includes(t.tag)));
  const primaryPayoff = nonlands.filter((c) => c.tags.some((t) => ["death_payoff", "finisher", "token_payoff", "payoff"].includes(t.tag)));

  const topArchetype = deckFacts.archetype_candidates[0];
  const archetypeSignals: Record<string, string[]> = {
    aristocrats: ["sac_outlet", "death_payoff"],
    tokens: ["token_producer", "token_payoff"],
    graveyard: ["recursion", "graveyard_setup"],
    spellslinger: ["draw", "counterspell", "payoff"],
    reanimator: ["graveyard_setup", "recursion"],
    ramp_midrange: ["ramp", "land_ramp", "draw", "finisher"],
    combo: ["combo_piece", "tutor"],
  };
  const archetypeTagSet = topArchetype ? new Set(archetypeSignals[topArchetype.name] ?? []) : new Set<string>();

  const lowSynergyCandidates = peripheralCards.slice(0, Math.min(10, peripheralCards.length));
  const offPlanCandidates: string[] = [];
  for (const c of nonlands) {
    if (archetypeTagSet.size === 0) continue;
    const cardTags = new Set(c.tags.map((t) => t.tag));
    const overlap = [...archetypeTagSet].filter((t) => cardTags.has(t)).length;
    if (overlap === 0 && c.tags.length <= 2 && !coreCards.includes(c.name)) {
      offPlanCandidates.push(c.name);
    }
  }
  const inefficientSlotCandidates: string[] = [];
  const redundancyByTag: Record<string, string[]> = {};
  for (const c of nonlands) {
    for (const { tag } of c.tags) {
      if (!redundancyByTag[tag]) redundancyByTag[tag] = [];
      redundancyByTag[tag].push(c.name);
    }
  }
  for (const [tag, names] of Object.entries(redundancyByTag)) {
    if (names.length > 5) {
      const sortedByCentrality = names
        .map((n) => cardsWithScore.find((x) => x.card.name === n))
        .filter(Boolean)
        .sort((a, b) => (a!.score ?? 0) - (b!.score ?? 0));
      for (let i = 0; i < Math.min(3, sortedByCentrality.length - 3); i++) {
        const name = sortedByCentrality[i]?.card.name;
        if (name && !inefficientSlotCandidates.includes(name)) inefficientSlotCandidates.push(name);
      }
    }
  }

  const topSynergyClusters: string[][] = [];
  const tagToCards: Record<string, string[]> = {};
  for (const c of nonlands) {
    for (const { tag } of c.tags) {
      if (!tagToCards[tag]) tagToCards[tag] = [];
      tagToCards[tag].push(c.name);
    }
  }
  const clusterTags = Object.entries(tagToCards)
    .filter(([, cards]) => cards.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5);
  for (const [, cards] of clusterTags) {
    topSynergyClusters.push([...new Set(cards)].slice(0, 8));
  }

  const missingSupport: string[] = [];
  if (deckFacts.role_counts["death_payoff"] && (deckFacts.role_counts["sac_outlet"] || 0) < 2) {
    missingSupport.push("Aristocrats payoffs present but few sac outlets");
  }
  if (deckFacts.role_counts["token_producer"] && (deckFacts.role_counts["token_payoff"] || 0) < 2) {
    missingSupport.push("Token producers present but few token payoffs");
  }
  if (deckFacts.role_counts["recursion"] && (deckFacts.role_counts["graveyard_setup"] || 0) < 2) {
    missingSupport.push("Recursion present but limited graveyard setup");
  }

  const tensionFlags: string[] = [];
  if (deckFacts.interaction_buckets.stack >= 5 && deckFacts.curve_profile === "battlecruiser") {
    tensionFlags.push("Control-style interaction with battlecruiser curve");
  }
  if (deckFacts.ramp_count < 6 && deckFacts.avg_cmc > 4 && deckFacts.format === "Commander") {
    tensionFlags.push("High curve with limited ramp");
  }

  return {
    top_synergy_clusters: topSynergyClusters,
    primary_engine_cards: primaryEngine.slice(0, 10).map((c) => c.name),
    primary_payoff_cards: primaryPayoff.slice(0, 10).map((c) => c.name),
    core_cards: coreCards,
    support_cards: supportCards,
    peripheral_cards: peripheralCards,
    low_synergy_candidates: lowSynergyCandidates,
    off_plan_candidates: offPlanCandidates.slice(0, 8),
    inefficient_slot_candidates: inefficientSlotCandidates.slice(0, 8),
    missing_support: missingSupport,
    tension_flags: tensionFlags,
  };
}
