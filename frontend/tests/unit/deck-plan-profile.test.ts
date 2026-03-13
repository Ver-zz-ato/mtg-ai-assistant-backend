/**
 * Unit tests for deck-plan-profile module (ManaTap Intelligence Module B).
 * Tests buildDeckPlanProfile with mono-green ramp/lands deck fixtures.
 */
import { buildDeckPlanProfile } from "../../lib/deck/deck-plan-profile";
import type { DeckFacts } from "../../lib/deck/deck-facts";
import type { SynergyDiagnostics } from "../../lib/deck/synergy-diagnostics";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const mockDeckFactsRamp: DeckFacts = {
  commander: "Azusa, Lost but Seeking",
  format: "Commander",
  color_identity: ["G"],
  land_count: 38,
  nonland_count: 61,
  avg_cmc: 3.2,
  curve_histogram: [8, 12, 18, 14, 9],
  ramp_count: 14,
  draw_count: 8,
  interaction_count: 6,
  interaction_buckets: { stack: 1, spot: 3, sweepers: 2, repeatable: 0, gy_hate: 0 },
  role_counts: {
    ramp: 6,
    land_ramp: 8,
    mana_dork: 2,
    draw: 6,
    spot_removal: 4,
    board_wipe: 2,
    finisher: 5,
    payoff: 4,
  },
  legality_flags: [],
  off_color_cards: [],
  banned_cards: [],
  archetype_candidates: [{ name: "ramp_midrange", score: 0.65 }, { name: "tokens", score: 0.55 }],
  engine_candidates: [{ name: "recursion", score: 0.3 }],
  win_pattern_candidates: [
    { name: "combat", score: 0.7 },
    { name: "engine", score: 0.5 },
  ],
  curve_profile: "midrange",
  uncertainty_flags: [],
};

const mockSynergyDiagnostics: SynergyDiagnostics = {
  top_synergy_clusters: [
    ["Cultivate", "Kodama's Reach", "Rampant Growth", "Farseek"],
    ["Beast Whisperer", "Guardian Project", "Soul of the Harvest"],
  ],
  primary_engine_cards: ["Cultivate", "Kodama's Reach", "Beast Whisperer"],
  primary_payoff_cards: ["Avenger of Zendikar", "Craterhoof Behemoth", "Titanic Ultimatum"],
  core_cards: ["Cultivate", "Kodama's Reach", "Avenger of Zendikar", "Craterhoof Behemoth"],
  support_cards: ["Rampant Growth", "Farseek", "Beast Whisperer", "Guardian Project"],
  peripheral_cards: ["Sol Ring", "Swiftfoot Boots", "Commander's Sphere"],
  low_synergy_candidates: [],
  off_plan_candidates: [],
  inefficient_slot_candidates: [],
  missing_support: [],
  tension_flags: [],
};

async function main() {
  // Build profile without options (no ramp_cards etc.)
  const profileNoOpts = buildDeckPlanProfile(mockDeckFactsRamp, mockSynergyDiagnostics);

  assert(profileNoOpts.primaryPlan.name === "ramp_midrange", "primary plan ramp_midrange");
  assert(profileNoOpts.primaryPlan.confidence > 0.5, "primary confidence");
  assert(profileNoOpts.secondaryPlan != null && profileNoOpts.secondaryPlan.name === "tokens", "secondary plan when scores close");

  const setupCluster = profileNoOpts.roleClusters.find((c) => c.role === "setup");
  assert(setupCluster != null, "has setup cluster");
  assert(profileNoOpts.roleClusters.some((c) => c.role === "enablers"), "has enablers");
  assert(profileNoOpts.roleClusters.some((c) => c.role === "payoffs"), "has payoffs");

  assert(profileNoOpts.synergyChains.length >= 1, "has synergy chains");
  assert(
    profileNoOpts.synergyChains[0].description.length > 0 && profileNoOpts.synergyChains[0].cards.length >= 1,
    "synergy chain has description and cards"
  );

  assert(profileNoOpts.winRoutes.length >= 1, "has win routes");
  const combatRoute = profileNoOpts.winRoutes.find((r) => r.type === "combat");
  assert(combatRoute != null, "combat win route");

  assert(profileNoOpts.overallConfidence >= 0 && profileNoOpts.overallConfidence <= 1, "overall confidence in range");

  // Build profile with options (ramp_cards etc.) for richer role clusters
  const profileWithOpts = buildDeckPlanProfile(mockDeckFactsRamp, mockSynergyDiagnostics, {
    rampCards: ["Cultivate", "Kodama's Reach", "Rampant Growth", "Farseek", "Sol Ring"],
    drawCards: ["Beast Whisperer", "Guardian Project", "Soul of the Harvest"],
    removalCards: ["Beast Within", "Nature's Claim", "Krosan Grip"],
  });

  const setupWithOpts = profileWithOpts.roleClusters.find((c) => c.role === "setup");
  assert(setupWithOpts != null && setupWithOpts.cardNames.length >= 4, "setup cluster has ramp cards from options");

  const cardFlowWithOpts = profileWithOpts.roleClusters.find((c) => c.role === "card_flow");
  assert(cardFlowWithOpts != null && cardFlowWithOpts.cardNames.length >= 1, "card_flow has draw cards");

  const interactionWithOpts = profileWithOpts.roleClusters.find((c) => c.role === "interaction");
  assert(interactionWithOpts != null && interactionWithOpts.cardNames.length >= 1, "interaction has removal cards");

  // Missing role: high curve, low ramp -> should trigger
  const lowRampFacts: DeckFacts = {
    ...mockDeckFactsRamp,
    ramp_count: 3,
    avg_cmc: 4.2,
    format: "Commander",
  };
  const profileLowRamp = buildDeckPlanProfile(lowRampFacts, mockSynergyDiagnostics);
  const missingRamp = profileLowRamp.missingRoles.find((m) => m.role === "ramp");
  assert(missingRamp != null, "missing ramp role when high curve + low ramp");

  // Tension: add tension flag from synergy diagnostics
  const tensionDiag: SynergyDiagnostics = {
    ...mockSynergyDiagnostics,
    tension_flags: ["High curve with limited ramp"],
    missing_support: ["Aristocrats payoffs present but few sac outlets"],
  };
  const profileTension = buildDeckPlanProfile(mockDeckFactsRamp, tensionDiag);
  assert(profileTension.tensionSignals.length >= 1, "tension signals from diagnostics");
  assert(profileTension.tensionSignals.some((t) => t.description.includes("ramp") || t.description.includes("curve")), "tension describes ramp/curve");

  console.log("OK deck-plan-profile tests");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
