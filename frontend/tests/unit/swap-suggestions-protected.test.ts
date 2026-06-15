import assert from "node:assert/strict";
import {
  buildProtectedSwapFromKeys,
  isProtectedBudgetSwapFrom,
  type ProtectedRoleCard,
} from "@/lib/deck/protected-role-cards";
import { isValidBudgetSwap } from "@/lib/deck/budget-swap-guards";

async function main() {
  const kykarProtected: ProtectedRoleCard[] = [
    { name: "Kykar, Zephyr Awakener", category: "commander", reason: "commander", confidence: "high" },
    { name: "Thassa, Deep-Dwelling", category: "engine", reason: "blink engine", confidence: "high" },
    { name: "Brago, King Eternal", category: "engine", reason: "blink engine", confidence: "high" },
    { name: "Displacer Kitten", category: "engine", reason: "blink engine", confidence: "high" },
  ];
  const keys = buildProtectedSwapFromKeys(kykarProtected);

  assert.equal(isProtectedBudgetSwapFrom("Thassa, Deep-Dwelling", keys), true);
  assert.equal(isProtectedBudgetSwapFrom("Sea of Clouds", keys), false);

  const deckNameKeys = new Set<string>();
  assert.equal(
    isValidBudgetSwap({
      from: "Thassa, Deep-Dwelling",
      to: "Conjurer's Closet",
      priceFrom: 25,
      priceTo: 3,
      budget: 0,
      deckNameKeys,
      format: "Commander",
      allowReplacementAboveBudget: true,
      protectedFromKeys: keys,
    }),
    false,
  );

  assert.equal(
    isValidBudgetSwap({
      from: "Sea of Clouds",
      to: "Hallowed Fountain",
      priceFrom: 25,
      priceTo: 8,
      budget: 0,
      deckNameKeys,
      format: "Commander",
      allowReplacementAboveBudget: true,
      protectedFromKeys: keys,
    }),
    true,
  );

  console.log("swap-suggestions-protected: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
