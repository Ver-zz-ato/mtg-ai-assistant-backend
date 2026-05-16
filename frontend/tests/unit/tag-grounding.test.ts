import assert from "node:assert/strict";
import {
  buildGroundedReason,
  buildTagProfile,
  filterSwapSuggestionsByTagSimilarity,
  rerankNamedRowsByProfile,
  scoreCandidateAgainstProfile,
} from "@/lib/recommendations/tag-grounding";

async function main() {
  const deckProfile = buildTagProfile([
    {
      name: "Token Maker",
      theme_tags: ["tokens", "treasure"],
      gameplay_tags: ["ramp", "payoff"],
      archetype_tags: ["aggro"],
      commander_tags: ["go_wide"],
      color_identity: ["R", "W"],
    },
    {
      name: "Swarm Anthem",
      theme_tags: ["tokens"],
      gameplay_tags: ["payoff", "finisher"],
      archetype_tags: ["aggro"],
      commander_tags: ["go_wide"],
      color_identity: ["R", "W"],
    },
  ]);

  assert.equal(deckProfile.topThemeTags[0], "tokens");
  assert.equal(deckProfile.topGameplayTags[0], "payoff");

  const tokenCandidate = {
    name: "Warleader",
    theme_tags: ["tokens"],
    gameplay_tags: ["payoff", "finisher"],
    archetype_tags: ["aggro"],
    commander_tags: ["go_wide"],
    popularity_score: 0.6,
  };
  const offPlanCandidate = {
    name: "Control Mage",
    theme_tags: ["graveyard"],
    gameplay_tags: ["interaction"],
    archetype_tags: ["control"],
    commander_tags: ["control_commander"],
    popularity_score: 0.9,
  };

  assert.ok(
    scoreCandidateAgainstProfile(tokenCandidate, deckProfile, { desiredCategory: "win_condition" }) >
      scoreCandidateAgainstProfile(offPlanCandidate, deckProfile, { desiredCategory: "win_condition" }),
    "token finisher should outrank off-plan control card for token deck",
  );

  const reranked = rerankNamedRowsByProfile(
    [
      { name: "Control Mage", reason: "generic" },
      { name: "Warleader", reason: "generic" },
    ],
    [tokenCandidate, offPlanCandidate],
    deckProfile,
    { desiredCategory: "win_condition", reasonKey: "reason" },
  );
  assert.equal(reranked[0].name, "Warleader");
  assert.match(reranked[0].reason, /closer|theme|plan/i);

  const swapFiltered = filterSwapSuggestionsByTagSimilarity(
    [
      { from: "Token Maker", to: "Warleader", price_delta: -5 },
      { from: "Token Maker", to: "Control Mage", price_delta: -8 },
    ],
    [
      {
        name: "Token Maker",
        theme_tags: ["tokens"],
        gameplay_tags: ["payoff"],
        archetype_tags: ["aggro"],
      },
    ],
    [tokenCandidate, offPlanCandidate],
    deckProfile,
  );
  assert.deepEqual(
    swapFiltered.map((row) => row.to),
    ["Warleader"],
    "swap filter should keep same-role replacements and drop off-plan control pivots",
  );

  const reason = buildGroundedReason(tokenCandidate, deckProfile, { desiredCategory: "win_condition" });
  assert.match(reason, /closer|payoff|plan/i);

  console.log("tag-grounding: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
