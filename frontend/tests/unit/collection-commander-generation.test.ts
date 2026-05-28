import assert from "node:assert/strict";
import {
  filterDeckToCollectionOwnership,
  normalizeCommanderDeckQtyForCollection,
  resolveCollectionOwnershipMode,
  resolveDeckShapeBuildMode,
  computeCollectionFitSummary,
  rebalanceMostlyCollectionDeck,
  cardOwnerNormKey,
  MOSTLY_COLLECTION_TARGET_OWNED_PERCENT,
} from "@/lib/deck/collection-commander-generation";

assert.equal(resolveCollectionOwnershipMode({ collectionOwnershipMode: "collection_only" }), "collection_only");
assert.equal(resolveCollectionOwnershipMode({ buildMode: "mostly_collection" }), "mostly_collection");
assert.equal(resolveDeckShapeBuildMode({ buildMode: "full_deck" }), "full_deck");
assert.equal(resolveDeckShapeBuildMode({ buildMode: "collection_only" }), null);

const owner = new Set([cardOwnerNormKey("Sol Ring"), cardOwnerNormKey("Forest")]);
const filtered = filterDeckToCollectionOwnership(
  [
    { name: "Sol Ring", qty: 1 },
    { name: "Rhystic Study", qty: 1 },
    { name: "Forest", qty: 10 },
  ],
  owner,
  "collection_only"
);
assert.deepEqual(
  filtered.cards.map((c) => c.name),
  ["Sol Ring", "Forest"]
);
assert.equal(filtered.removed.length, 1);

const padded = normalizeCommanderDeckQtyForCollection([{ name: "Sol Ring", qty: 1 }], ["R"], {
  ownershipMode: "collection_only",
  ownerNormKeys: new Set([cardOwnerNormKey("Sol Ring"), cardOwnerNormKey("Mountain")]),
});
assert.equal(padded.ok, true);
if (padded.ok) {
  assert.equal(padded.cards.reduce((s, c) => s + c.qty, 0), 100);
}

const needsLands = normalizeCommanderDeckQtyForCollection([{ name: "Sol Ring", qty: 1 }], ["R", "G"], {
  ownershipMode: "collection_only",
  ownerNormKeys: new Set([cardOwnerNormKey("Sol Ring")]),
});
assert.equal(needsLands.ok, false);
if (!needsLands.ok) assert.equal(needsLands.code, "COLLECTION_NEEDS_LANDS");

const fit = computeCollectionFitSummary(
  [
    { name: "Sol Ring", qty: 1 },
    { name: "Forest", qty: 35 },
    { name: "Rhystic Study", qty: 1 },
  ],
  owner,
  { ownershipMode: "mostly_collection", collectionTotalCards: 500, promptSampleSize: 120 }
);
assert.equal(fit.ownedSlots, 36);
assert.equal(fit.missingSlots, 1);
assert.ok(fit.missingCardNames.includes("Rhystic Study"));

const ownerMap = new Map<string, string>();
const qtyMap = new Map<string, number>();
for (const [name, qty] of [
  ["Sol Ring", 1],
  ["Forest", 40],
  ["Swamp", 35],
  ["Cultivate", 1],
  ["Rampant Growth", 1],
  ["Farseek", 1],
  ["Sakura-Tribe Elder", 1],
] as const) {
  const nk = cardOwnerNormKey(name);
  ownerMap.set(nk, name);
  qtyMap.set(nk, qty);
}
const ownerSet = new Set(ownerMap.keys());
const beforeDeck = [
  ...Array.from({ length: 40 }, (_, i) => ({ name: `Off Collection Card ${i}`, qty: 1 })),
  { name: "Forest", qty: 60 },
];
let ownedBefore = 0;
for (const c of beforeDeck) {
  if (ownerSet.has(cardOwnerNormKey(c.name))) ownedBefore += c.qty;
}
const rebalanced = rebalanceMostlyCollectionDeck(beforeDeck, {
  ownerNormKeys: ownerSet,
  ownerNormToDisplay: ownerMap,
  qtyByNormKey: qtyMap,
});
assert.ok(rebalanced.swaps > 0);
let ownedAfter = 0;
let totalAfter = 0;
for (const c of rebalanced.cards) {
  const q = c.qty;
  totalAfter += q;
  if (ownerSet.has(cardOwnerNormKey(c.name))) ownedAfter += q;
}
assert.ok(ownedAfter > ownedBefore);
assert.ok(Math.round((ownedAfter / totalAfter) * 100) >= MOSTLY_COLLECTION_TARGET_OWNED_PERCENT);

console.log("collection-commander-generation.test.ts: ok");
