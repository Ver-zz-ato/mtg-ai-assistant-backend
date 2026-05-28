import assert from "node:assert/strict";
import {
  filterDeckToCollectionOwnership,
  normalizeCommanderDeckQtyForCollection,
  resolveCollectionOwnershipMode,
  resolveDeckShapeBuildMode,
  computeCollectionFitSummary,
  rebalanceMostlyCollectionDeck,
  rebalanceLandHeavyMostlyCollectionDeck,
  enforceCommanderCollectionManaBase,
  countBasicLandSlots,
  deckUniqueNameJaccardPercent,
  cardOwnerNormKey,
  COMMANDER_MAX_LAND_SLOTS,
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

const paddedQty = new Map<string, number>([
  [cardOwnerNormKey("Sol Ring"), 1],
  [cardOwnerNormKey("Mountain"), 37],
  [cardOwnerNormKey("Cultivate"), 1],
  [cardOwnerNormKey("Rampant Growth"), 1],
]);
const paddedOwners = new Set(paddedQty.keys());
const padded = normalizeCommanderDeckQtyForCollection(
  [
    { name: "Sol Ring", qty: 1 },
    { name: "Cultivate", qty: 1 },
    { name: "Rampant Growth", qty: 1 },
  ],
  ["R", "G"],
  {
    ownershipMode: "mostly_collection",
    ownerNormKeys: paddedOwners,
    qtyByNormKey: paddedQty,
  }
);
assert.equal(padded.ok, true);
if (padded.ok) {
  assert.ok(countBasicLandSlots(padded.cards) <= COMMANDER_MAX_LAND_SLOTS);
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

const ownerMap2 = new Map<string, string>();
const qtyMap2 = new Map<string, number>();
for (const [name, qty] of [
  ["Sol Ring", 1],
  ["Cultivate", 1],
  ["Rampant Growth", 1],
  ["Muldrotha, the Gravetide", 1],
  ["Forest", 24],
  ["Swamp", 16],
  ["Island", 8],
] as const) {
  const nk = cardOwnerNormKey(name);
  ownerMap2.set(nk, name);
  qtyMap2.set(nk, qty);
}
const ownerSet2 = new Set(ownerMap2.keys());

const landStuffed = [
  { name: "Muldrotha, the Gravetide", qty: 1 },
  { name: "Sol Ring", qty: 1 },
  { name: "Forest", qty: 24 },
  { name: "Swamp", qty: 16 },
  { name: "Island", qty: 8 },
  { name: "Cultivate", qty: 1 },
  { name: "Rampant Growth", qty: 1 },
  { name: "Rhystic Study", qty: 1 },
];
assert.equal(countBasicLandSlots(landStuffed), 48);

const enforced = enforceCommanderCollectionManaBase(landStuffed, {
  ownershipMode: "mostly_collection",
  ownerNormKeys: ownerSet2,
  ownerNormToDisplay: ownerMap2,
  qtyByNormKey: qtyMap2,
  colors: ["U", "B", "G"],
  commanderName: "Muldrotha, the Gravetide",
});
assert.ok(enforced.landSlots <= COMMANDER_MAX_LAND_SLOTS, `expected <=${COMMANDER_MAX_LAND_SLOTS} lands, got ${enforced.landSlots}`);
assert.ok(enforced.trimmedBasics > 0);
assert.ok(enforced.landSlots < countBasicLandSlots(landStuffed));

const landHeavyDeck = [
  { name: "Muldrotha, the Gravetide", qty: 1 },
  { name: "Forest", qty: 50 },
  { name: "Sol Ring", qty: 1 },
  { name: "Cultivate", qty: 1 },
  { name: "Rampant Growth", qty: 1 },
  { name: "Rhystic Study", qty: 1 },
];
const landHeavyFix = rebalanceLandHeavyMostlyCollectionDeck(landHeavyDeck, {
  ownerNormKeys: ownerSet2,
  ownerNormToDisplay: ownerMap2,
  qtyByNormKey: qtyMap2,
  commanderName: "Muldrotha, the Gravetide",
});
assert.ok(landHeavyFix.swaps > 0);
assert.ok(countBasicLandSlots(landHeavyFix.cards) < countBasicLandSlots(landHeavyDeck));

/** Opposed playstyle flex lists (synthetic) — bar for meaningful divergence. */
const chaosFlex = [
  { name: "Stromkirk Noble", qty: 1 },
  { name: "Shared Animosity", qty: 1 },
  { name: "Impact Tremors", qty: 1 },
  { name: "Falkenrath Aristocrat", qty: 1 },
  { name: "Voldaren Epicure", qty: 1 },
  { name: "Edgar Markov", qty: 1 },
  { name: "Drana, Liberator of Malakir", qty: 1 },
];
const controlFlex = [
  { name: "Teferi's Protection", qty: 1 },
  { name: "Merciless Eviction", qty: 1 },
  { name: "Vanquish the Horde", qty: 1 },
  { name: "Patriarch's Bidding", qty: 1 },
  { name: "Living Death", qty: 1 },
  { name: "Edgar Markov", qty: 1 },
  { name: "Smothering Tithe", qty: 1 },
];
const jaccardOpposed = deckUniqueNameJaccardPercent(chaosFlex, controlFlex);
assert.ok(jaccardOpposed < 50, `opposed playstyle flex should be <50% overlap, got ${jaccardOpposed}%`);

console.log("collection-commander-generation.test.ts: ok");
