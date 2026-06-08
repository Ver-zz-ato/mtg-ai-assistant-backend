import assert from "node:assert/strict";
import {
  AI_WORKSHOP_MAX_CHANGE_OPTIONS,
  getAiDeckHalfwayMinimumCards,
  getAiWorkshopActionApplyLabel,
  getAiWorkshopSubTargetOptions,
  isAiDeckBelowHalfway,
} from "@/lib/deck/ai-workshop-rules";

async function main() {
  assert.equal(getAiDeckHalfwayMinimumCards("Commander"), 50);
  assert.equal(getAiDeckHalfwayMinimumCards("standard"), 30);
  assert.equal(getAiDeckHalfwayMinimumCards("Modern"), 30);

  assert.equal(isAiDeckBelowHalfway(49, "Commander"), true);
  assert.equal(isAiDeckBelowHalfway(50, "Commander"), false);
  assert.equal(isAiDeckBelowHalfway(29, "Standard"), true);
  assert.equal(isAiDeckBelowHalfway(30, "Pioneer"), false);

  assert.equal(getAiWorkshopActionApplyLabel("general"), "Fix deck");
  assert.equal(getAiWorkshopActionApplyLabel("mana"), "Fix mana base");
  assert.equal(getAiWorkshopActionApplyLabel("curve"), "Fix curve");
  assert.equal(getAiWorkshopActionApplyLabel("interaction"), "Fix interaction");
  assert.equal(getAiWorkshopActionApplyLabel("budget"), "Fix budget");
  assert.equal(getAiWorkshopActionApplyLabel("optimized"), "Fix power");
  assert.equal(getAiWorkshopActionApplyLabel("casual"), "Fix power");
  assert.equal(getAiWorkshopActionApplyLabel("legality"), "Fix legality");
  assert.equal(getAiWorkshopActionApplyLabel("unknown"), "Fix deck");

  assert.deepEqual(getAiWorkshopSubTargetOptions("general"), [
    "Cohesion",
    "Redundancy",
    "Low-impact cuts",
  ]);
  assert.deepEqual(getAiWorkshopSubTargetOptions("mana"), ["Land count", "Fixing", "Ramp mix"]);
  assert.deepEqual(getAiWorkshopSubTargetOptions("curve"), [
    "Early game",
    "Top-end trim",
    "Average CMC",
  ]);
  assert.deepEqual(getAiWorkshopSubTargetOptions("interaction"), [
    "Spot removal",
    "Board wipes",
    "Stack interaction",
  ]);
  assert.deepEqual(getAiWorkshopSubTargetOptions("budget"), [
    "Mana base first",
    "Expensive staples",
    "Whole list",
  ]);
  assert.deepEqual(getAiWorkshopSubTargetOptions("optimized"), [
    "Consistency",
    "Speed",
    "Resilience",
  ]);
  assert.deepEqual(getAiWorkshopSubTargetOptions("casual"), [
    "Softer win lines",
    "More table-friendly",
    "Less oppressive interaction",
  ]);
  assert.deepEqual(getAiWorkshopSubTargetOptions("legality"), [
    "Color identity",
    "Banned cards",
    "Deck structure",
  ]);
  assert.deepEqual(getAiWorkshopSubTargetOptions("unknown"), []);

  assert.deepEqual(AI_WORKSHOP_MAX_CHANGE_OPTIONS, [
    "Up to 10 swaps",
    "Up to 20 swaps",
    "Big rebuild",
  ]);

  console.log("ai-workshop-rules tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
