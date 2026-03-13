/**
 * Test Suite V2 — shared fixtures for deterministic scenario runs.
 * Mirrors integration test fixtures.
 */

import type { RulesFactBundle } from "@/lib/deck/rules-facts";
import type { DeckContextSummary } from "@/lib/deck/deck-context-summary";
import type { DeckFacts } from "@/lib/deck/deck-facts";
import type { SynergyDiagnostics } from "@/lib/deck/synergy-diagnostics";
import { hashDecklist, normalizeDecklistText } from "@/lib/chat/decklist-normalize";

export const MONO_GREEN_DECKLIST = `Commander
1 Multani, Yavimaya's Avatar

Deck
1 Avenger of Zendikar
1 Craterhoof Behemoth
1 Cultivate
1 Kodama's Reach
1 Skyshroud Claim
1 Scapeshift
1 Splendid Reclamation
1 Ulvenwald Hydra
1 Exploration
1 Azusa, Lost but Seeking
1 Rampant Growth
1 Farseek
1 Sol Ring
1 Command Tower
1 Arcane Signet
35 Forest`;

export const MOCK_DECK_FACTS: DeckFacts = {
  commander: "Multani, Yavimaya's Avatar",
  format: "Commander",
  color_identity: ["G"],
  land_count: 38,
  nonland_count: 61,
  avg_cmc: 3.2,
  curve_histogram: [8, 12, 18, 14, 9],
  ramp_count: 14,
  draw_count: 6,
  interaction_count: 4,
  interaction_buckets: { stack: 0, spot: 3, sweepers: 1, repeatable: 0, gy_hate: 0 },
  role_counts: {
    ramp: 6,
    land_ramp: 8,
    mana_dork: 0,
    draw: 4,
    spot_removal: 3,
    board_wipe: 1,
    finisher: 3,
    payoff: 4,
  },
  legality_flags: [],
  off_color_cards: [],
  banned_cards: [],
  archetype_candidates: [
    { name: "ramp_midrange", score: 0.85 },
    { name: "tokens", score: 0.4 },
  ],
  engine_candidates: [{ name: "recursion", score: 0.3 }],
  win_pattern_candidates: [
    { name: "combat", score: 0.7 },
    { name: "engine", score: 0.5 },
  ],
  curve_profile: "midrange",
  uncertainty_flags: [],
};

export const MOCK_SYNERGY_DIAGNOSTICS: SynergyDiagnostics = {
  top_synergy_clusters: [
    ["Cultivate", "Kodama's Reach", "Rampant Growth", "Farseek"],
    ["Avenger of Zendikar", "Craterhoof Behemoth", "Ulvenwald Hydra"],
  ],
  primary_engine_cards: ["Cultivate", "Kodama's Reach", "Azusa, Lost but Seeking"],
  primary_payoff_cards: ["Avenger of Zendikar", "Craterhoof Behemoth", "Ulvenwald Hydra"],
  core_cards: ["Cultivate", "Kodama's Reach", "Avenger of Zendikar", "Craterhoof Behemoth"],
  support_cards: ["Rampant Growth", "Farseek", "Azusa, Lost but Seeking", "Exploration"],
  peripheral_cards: ["Sol Ring", "Command Tower", "Arcane Signet"],
  low_synergy_candidates: [],
  off_plan_candidates: [],
  inefficient_slot_candidates: [],
  missing_support: [],
  tension_flags: [],
};

export function buildFixtureV2Summary(decklistText: string): DeckContextSummary {
  const deck_hash = hashDecklist(normalizeDecklistText(decklistText));
  return {
    deck_hash,
    format: "Commander",
    commander: "Multani, Yavimaya's Avatar",
    colors: ["G"],
    land_count: 38,
    curve_histogram: [8, 12, 18, 14, 9],
    ramp: 14,
    removal: 4,
    draw: 6,
    board_wipes: 1,
    wincons: 3,
    archetype_tags: ["ramp_midrange"],
    warning_flags: [],
    card_names: [
      "Multani, Yavimaya's Avatar",
      "Avenger of Zendikar",
      "Craterhoof Behemoth",
      "Cultivate",
      "Kodama's Reach",
      "Skyshroud Claim",
      "Scapeshift",
      "Splendid Reclamation",
      "Ulvenwald Hydra",
      "Exploration",
      "Azusa, Lost but Seeking",
    ],
    ramp_cards: ["Cultivate", "Kodama's Reach", "Rampant Growth", "Farseek", "Skyshroud Claim"],
    draw_cards: [],
    removal_cards: [],
    card_count: 99,
    last_updated: new Date().toISOString(),
    deck_facts: MOCK_DECK_FACTS,
    synergy_diagnostics: MOCK_SYNERGY_DIAGNOSTICS,
  };
}

export const FIXTURE_V2_SUMMARY = buildFixtureV2Summary(MONO_GREEN_DECKLIST);

export const MOCK_RULES_BUNDLE_MULTANI: RulesFactBundle = {
  commander: {
    cardName: "Multani, Yavimaya's Avatar",
    typeLine: "Legendary Creature — Elemental",
    commanderEligible: true,
    commanderEligibleReason: "legendary_creature",
    colorIdentity: ["G"],
    legalInCommander: true,
    oracleSummary: "Legendary Creature — Elemental. Legal commander (Legendary Creature).",
    cacheMiss: false,
  },
  cards: [],
  deckColorIdentity: ["G"],
};

export const MOCK_RULES_BUNDLE_BLACK_LOTUS: RulesFactBundle = {
  commander: null,
  cards: [
    {
      cardName: "Black Lotus",
      typeLine: "Artifact",
      commanderEligible: false,
      commanderEligibleReason: null,
      colorIdentity: [],
      legalInCommander: false,
      oracleSummary: "Artifact. Banned in Commander.",
      cacheMiss: false,
    },
  ],
  deckColorIdentity: [],
};

export const MOCK_RULES_BUNDLE_GRIST: RulesFactBundle = {
  commander: null,
  cards: [
    {
      cardName: "Grist, the Hunger Tide",
      typeLine: "Legendary Creature — Insect",
      commanderEligible: true,
      commanderEligibleReason: "oracle_text",
      colorIdentity: ["B", "G"],
      legalInCommander: true,
      oracleSummary: "Legendary Creature — Insect. Legal commander via oracle text.",
      cacheMiss: false,
    },
  ],
  deckColorIdentity: ["B", "G"],
};

export const MOCK_RULES_BUNDLE_AVENGER: RulesFactBundle = {
  commander: null,
  cards: [
    {
      cardName: "Avenger of Zendikar",
      typeLine: "Creature — Elemental",
      commanderEligible: false,
      commanderEligibleReason: null,
      colorIdentity: ["G"],
      legalInCommander: true,
      oracleSummary: "Creature — Elemental. Not legendary; cannot be commander.",
      cacheMiss: false,
    },
  ],
  deckColorIdentity: ["G"],
};
