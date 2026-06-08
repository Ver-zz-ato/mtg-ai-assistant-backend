import assert from "node:assert/strict";
import {
  applySelectedAiWorkshopBudgetSwapsToDeckText,
  applySelectedAiWorkshopDiffToDeckText,
  buildAiWorkshopBudgetSwapKey,
  buildAiWorkshopDiffKey,
  countAiWorkshopDeckCards,
  diffAiWorkshopDecklists,
} from "@/lib/deck/ai-workshop-deck-text";

const MODERN_BASE = [
  "4 Lightning Bolt",
  "4 Counterspell",
  "4 Dragon's Rage Channeler",
  "4 Ragavan, Nimble Pilferer",
  "4 Murktide Regent",
  "4 Mishra's Bauble",
  "4 Unholy Heat",
  "4 Consider",
  "4 Preordain",
  "4 Expressive Iteration",
  "4 Scalding Tarn",
  "4 Spirebluff Canal",
  "4 Steam Vents",
  "7 Island",
  "1 Mountain",
  "Sideboard",
  "3 Blood Moon",
  "2 Engineered Explosives",
  "2 Flusterstorm",
  "2 Dress Down",
  "2 Unlicensed Hearse",
  "2 Brotherhood's End",
  "2 Chalice of the Void",
].join("\n");

async function main() {
  assert.equal(countAiWorkshopDeckCards(MODERN_BASE, "Modern"), 60);

  const updated = MODERN_BASE.replace("4 Counterspell", "2 Counterspell\n2 Spell Pierce");
  const diff = diffAiWorkshopDecklists(MODERN_BASE, updated, "Modern");
  const applied = applySelectedAiWorkshopDiffToDeckText({
    baseDeckText: MODERN_BASE,
    format: "Modern",
    adds: diff.adds,
    cuts: diff.cuts,
    selectedAddKeys: new Set(diff.adds.map(buildAiWorkshopDiffKey)),
    selectedCutKeys: new Set(diff.cuts.map(buildAiWorkshopDiffKey)),
  });

  assert.equal(countAiWorkshopDeckCards(applied, "Modern"), 60);
  assert.ok(applied.includes("Sideboard"));
  assert.ok(applied.includes("3 Blood Moon"));
  assert.ok(applied.includes("2 Spell Pierce"));

  const before = ["2 Duress", "58 Swamp", "Sideboard", "2 Duress", "13 Island"].join("\n");
  const after = ["3 Duress", "57 Swamp", "Sideboard", "1 Duress", "14 Island"].join("\n");
  const pioneerDiff = diffAiWorkshopDecklists(before, after, "Pioneer");

  assert.deepEqual(pioneerDiff.adds, [
    { name: "Duress", qty: 1, zone: "mainboard" },
    { name: "Island", qty: 1, zone: "sideboard" },
  ]);
  assert.deepEqual(pioneerDiff.cuts, [
    { name: "Swamp", qty: 1, zone: "mainboard" },
    { name: "Duress", qty: 1, zone: "sideboard" },
  ]);

  const commanderDeck = ["Commander: Korvold, Fae-Cursed King", "99 Forest"].join("\n");
  assert.equal(countAiWorkshopDeckCards(commanderDeck, "Commander"), 100);

  const swap = { from: "Ragavan, Nimble Pilferer", to: "Monastery Swiftspear" };
  const budgetApplied = applySelectedAiWorkshopBudgetSwapsToDeckText({
    baseDeckText: MODERN_BASE,
    format: "Modern",
    swaps: [swap],
    selectedKeys: new Set([buildAiWorkshopBudgetSwapKey(swap)]),
  });

  assert.equal(countAiWorkshopDeckCards(budgetApplied, "Modern"), 60);
  assert.ok(budgetApplied.includes("4 Dragon's Rage Channeler"));
  assert.ok(budgetApplied.includes("3 Ragavan, Nimble Pilferer"));
  assert.ok(budgetApplied.includes("1 Monastery Swiftspear"));

  const selectedSwap = { from: "Blood Moon", to: "Damping Sphere" };
  const ignoredSwap = { from: "Ragavan, Nimble Pilferer", to: "Monastery Swiftspear" };
  const partialBudget = applySelectedAiWorkshopBudgetSwapsToDeckText({
    baseDeckText: MODERN_BASE,
    format: "Modern",
    swaps: [selectedSwap, ignoredSwap],
    selectedKeys: new Set([buildAiWorkshopBudgetSwapKey(selectedSwap)]),
  });

  assert.equal(countAiWorkshopDeckCards(partialBudget, "Modern"), 60);
  assert.ok(partialBudget.includes("Sideboard"));
  assert.ok(partialBudget.includes("2 Blood Moon"));
  assert.ok(partialBudget.includes("1 Damping Sphere"));
  assert.ok(partialBudget.includes("4 Ragavan, Nimble Pilferer"));
  assert.ok(!partialBudget.includes("Monastery Swiftspear"));

  console.log("ai-workshop-deck-text tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
