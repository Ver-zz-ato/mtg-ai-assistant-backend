import assert from "node:assert/strict";
import {
  buildTransformIntentPromptBlock,
  normalizeTransformIntent,
  summarizeTransformIntent,
  TRANSFORM_INTENTS,
} from "@/lib/deck/transform-intent";

async function main() {
  assert.equal(normalizeTransformIntent("general"), "general");
  assert.equal(normalizeTransformIntent("mana base"), "improve_mana_base");
  assert.equal(normalizeTransformIntent("curve"), "tighten_curve");
  assert.equal(normalizeTransformIntent("interaction"), "add_interaction");
  assert.equal(normalizeTransformIntent("budget"), "lower_budget");
  assert.equal(normalizeTransformIntent("casual"), "more_casual");
  assert.equal(normalizeTransformIntent("optimized"), "more_optimized");
  assert.equal(normalizeTransformIntent("legality"), "fix_legality");
  assert.equal(normalizeTransformIntent("template"), "transform_template");
  assert.equal(normalizeTransformIntent("totally-unknown"), "general");

  assert.equal(summarizeTransformIntent("general"), "General refinement");
  assert.equal(summarizeTransformIntent("tighten_curve"), "Curve tightening");
  assert.equal(summarizeTransformIntent("fix_legality"), "Legality / color identity fix");

  for (const intent of TRANSFORM_INTENTS) {
    const block = buildTransformIntentPromptBlock(intent);
    assert.ok(block.includes("INTENT:"), `intent block should identify itself for ${intent}`);
    if (intent !== "fix_legality") {
      assert.ok(block.includes("PRESERVATION"), `intent block should preserve deck identity for ${intent}`);
    }
  }

  const legalityBlock = buildTransformIntentPromptBlock("fix_legality");
  assert.match(legalityBlock, /return it unchanged/i);
  assert.match(legalityBlock, /do not make optimization, mana-base, or preference swaps/i);
  assert.match(legalityBlock, /preserve as much of the original list as legality allows/i);

  const manaBlock = buildTransformIntentPromptBlock("improve_mana_base");
  assert.match(manaBlock, /lands, ramp, and mana fixing/i);

  const curveBlock = buildTransformIntentPromptBlock("tighten_curve");
  assert.match(curveBlock, /smooth the curve/i);

  const interactionBlock = buildTransformIntentPromptBlock("add_interaction");
  assert.match(interactionBlock, /more answers/i);

  console.log("transform-intent: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
