import assert from "node:assert/strict";
import {
  buildGroundedReason,
  buildTagProfile,
  rerankNamedRowsByProfile,
  scoreCandidateAgainstProfile,
  summarizeTagProfileForPrompt,
} from "@/lib/recommendations/tag-grounding";

async function main() {
  const graveyardProfile = buildTagProfile([
    {
      name: "Stitcher's Supplier",
      theme_tags: ["graveyard", "self_mill"],
      gameplay_tags: ["enabler", "engine"],
      archetype_tags: ["value"],
      commander_tags: ["aristocrats"],
      color_identity: ["B"],
    },
    {
      name: "Victimize",
      theme_tags: ["graveyard", "reanimator"],
      gameplay_tags: ["recursion", "payoff"],
      archetype_tags: ["value"],
      commander_tags: ["aristocrats"],
      color_identity: ["B"],
    },
  ]);

  const recursionCandidate = {
    name: "Living Death",
    theme_tags: ["graveyard", "reanimator"],
    gameplay_tags: ["recursion", "finisher"],
    archetype_tags: ["value"],
    commander_tags: ["aristocrats"],
    popularity_score: 0.8,
  };
  const offThemeRamp = {
    name: "Cultivate",
    theme_tags: ["lands"],
    gameplay_tags: ["ramp", "support"],
    archetype_tags: ["midrange"],
    commander_tags: ["big_mana"],
    popularity_score: 0.9,
  };

  assert.ok(
    scoreCandidateAgainstProfile(recursionCandidate, graveyardProfile, { desiredCategory: "win_condition" }) >
      scoreCandidateAgainstProfile(offThemeRamp, graveyardProfile, { desiredCategory: "win_condition" }),
    "graveyard finisher should outrank generic ramp for finish suggestions",
  );

  const interactionProfile = buildTagProfile([
    {
      name: "Swords to Plowshares",
      theme_tags: [],
      gameplay_tags: ["interaction", "removal_single"],
      archetype_tags: ["control"],
      commander_tags: ["control_commander"],
      color_identity: ["W"],
    },
    {
      name: "Wrath of God",
      theme_tags: [],
      gameplay_tags: ["interaction", "removal_boardwipe"],
      archetype_tags: ["control"],
      commander_tags: ["control_commander"],
      color_identity: ["W"],
    },
  ]);

  const interactionRows = rerankNamedRowsByProfile(
    [
      { name: "Divination", reason: "generic draw" },
      { name: "Farewell", reason: "generic wipe" },
      { name: "Generous Gift", reason: "generic answer" },
    ],
    [
      {
        name: "Divination",
        gameplay_tags: ["card_draw", "draw_burst"],
        archetype_tags: ["value"],
      },
      {
        name: "Farewell",
        gameplay_tags: ["interaction", "removal_boardwipe"],
        archetype_tags: ["control"],
      },
      {
        name: "Generous Gift",
        gameplay_tags: ["interaction", "removal_single"],
        archetype_tags: ["control"],
      },
    ],
    interactionProfile,
    { desiredCategory: "interaction", reasonKey: "reason" },
  );

  assert.deepEqual(
    interactionRows.slice(0, 2).map((row) => row.name),
    ["Farewell", "Generous Gift"],
    "interaction reranking should prioritize real answers before off-role draw",
  );
  assert.match(interactionRows[0].reason, /interaction|removal|package/i);

  const promptSummary = summarizeTagProfileForPrompt(graveyardProfile, "win_condition");
  assert.match(promptSummary, /graveyard|roles:|finishers|close the game/i);

  const fallbackReason = buildGroundedReason(offThemeRamp, graveyardProfile, { desiredCategory: "mana_base" });
  assert.match(fallbackReason, /mana|supports/i);

  console.log("recommendation-grounding-categories: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
