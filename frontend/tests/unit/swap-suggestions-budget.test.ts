import assert from "node:assert/strict";
import { BUNDLED, mergeBudgetSwaps } from "@/lib/data/get-budget-swaps";
import { isAiWorkshopBudgetSource, isValidBudgetSwap } from "@/lib/deck/budget-swap-guards";

async function main() {
  assert.ok(BUNDLED["mana crypt"]?.includes("Thought Vessel"));
  const merged = mergeBudgetSwaps(
    { "mana crypt": ["Thought Vessel"], "the one ring": ["Scroll Rack"] },
    { "mana crypt": ["Arcane Signet"], "new expensive card": ["Budget Role Player"] },
  );
  assert.deepEqual(merged["mana crypt"], ["Thought Vessel", "Arcane Signet"]);
  assert.deepEqual(merged["the one ring"], ["Scroll Rack"]);
  assert.deepEqual(merged["new expensive card"], ["Budget Role Player"]);

  const deckNameKeys = new Set(["mana-crypt"]);
  assert.equal(isAiWorkshopBudgetSource("app_ai_workshop_budget"), true);
  assert.equal(isAiWorkshopBudgetSource("ai_workshop_budget"), true);
  assert.equal(isAiWorkshopBudgetSource("standalone_budget_swaps"), false);

  assert.equal(
    isValidBudgetSwap({
      from: "Mana Crypt",
      to: "Thought Vessel",
      priceFrom: 180,
      priceTo: 12,
      budget: 0,
      deckNameKeys,
      format: "Commander",
    }),
    true,
  );

  assert.equal(
    isValidBudgetSwap({
      from: "Mana Crypt",
      to: "Thought Vessel",
      priceFrom: 180,
      priceTo: 12,
      budget: 5,
      deckNameKeys,
      format: "Commander",
    }),
    false,
  );

  assert.equal(
    isValidBudgetSwap({
      from: "Mana Crypt",
      to: "Thought Vessel",
      priceFrom: 180,
      priceTo: 12,
      budget: 5,
      deckNameKeys,
      format: "Commander",
      allowReplacementAboveBudget: true,
    }),
    true,
  );

  assert.equal(
    isValidBudgetSwap({
      from: "Mana Crypt",
      to: "Island",
      priceFrom: 180,
      priceTo: 0.1,
      budget: 5,
      deckNameKeys,
      format: "Commander",
      allowReplacementAboveBudget: true,
    }),
    false,
  );

  console.log("swap-suggestions-budget: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
