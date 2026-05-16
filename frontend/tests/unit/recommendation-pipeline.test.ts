import assert from "node:assert/strict";
import { buildRecommendationIntent, rankGroundedCandidates, scoreRecommendationCandidate } from "@/lib/recommendations/recommendation-pipeline";
import { buildTagProfile } from "@/lib/recommendations/tag-grounding";

async function main() {
  const profile = buildTagProfile([
    {
      name: "Token Engine",
      theme_tags: ["tokens", "treasure"],
      gameplay_tags: ["payoff", "ramp"],
      archetype_tags: ["aggro"],
      commander_tags: ["go_wide"],
      color_identity: ["R", "W"],
    },
    {
      name: "Swarm Payoff",
      theme_tags: ["tokens"],
      gameplay_tags: ["finisher", "payoff"],
      archetype_tags: ["aggro"],
      commander_tags: ["go_wide"],
      color_identity: ["R", "W"],
    },
  ]);

  const intent = buildRecommendationIntent({
    routeKind: "commander",
    routeLabel: "commander_test",
    formatLabel: "Commander",
    profile,
    selectionCount: 6,
    isGuest: false,
    isPro: true,
    userId: "u1",
  });

  const tokenCommander = {
    name: "Xyris, the Writhing Storm",
    printed_name: "Xyris, the Writhing Storm",
    type_line: "Legendary Creature — Snake Leviathan",
    oracle_text: "Whenever an opponent draws a card except the first one they draw in each of their draw steps, create a 1/1 green Snake creature token.",
    color_identity: ["G", "U", "R"],
    colors: ["G", "U", "R"],
    legalities: { commander: "legal" },
    theme_tags: ["tokens"],
    gameplay_tags: ["payoff", "engine"],
    archetype_tags: ["aggro"],
    commander_tags: ["go_wide"],
    commander_eligible: true,
    commander_power_band: "focused" as const,
    commander_budget_band: "moderate" as const,
    commander_complexity: "medium" as const,
    commander_interaction: "medium" as const,
    popularity_score: 0.8,
    tag_version: 2,
    source: "rules_v2",
    updated_at: new Date().toISOString(),
  };

  const offThemeCommander = {
    ...tokenCommander,
    name: "Baral, Chief of Compliance",
    printed_name: "Baral, Chief of Compliance",
    type_line: "Legendary Creature — Human Wizard",
    oracle_text: "Instant and sorcery spells you cast cost {1} less to cast. Whenever a spell or ability you control counters a spell, you may draw a card.",
    theme_tags: ["spellslinger"],
    gameplay_tags: ["card_draw", "engine"],
    archetype_tags: ["combo", "control"],
    commander_tags: ["spell_combo"],
  };

  const tokenScore = scoreRecommendationCandidate(tokenCommander as any, profile, intent);
  const offThemeScore = scoreRecommendationCandidate(offThemeCommander as any, profile, intent);
  assert.ok(tokenScore.total > offThemeScore.total, "hard theme fit should outrank adjacent off-theme commander");

  const ranked = rankGroundedCandidates([offThemeCommander as any, tokenCommander as any], profile, intent);
  assert.equal(String(ranked[0].printed_name || ranked[0].name), "Xyris, the Writhing Storm");
  assert.ok(!ranked[0].rejectionReasons.includes("weak_theme_evidence"));
  assert.equal(ranked.length, 1, "hard theme gate should filter the off-theme commander out entirely");

  console.log("recommendation-pipeline: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
