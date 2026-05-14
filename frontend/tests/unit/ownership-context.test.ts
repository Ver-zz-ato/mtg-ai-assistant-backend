import assert from "node:assert/strict";
import {
  annotateOwnership,
  appendOwnershipToReason,
  type OwnershipContext,
} from "../../lib/collections/ownership-context";

const context: OwnershipContext = {
  hasCollection: true,
  ownedCount: 2,
  ownedDeckQty: 1,
  deckQty: 2,
  missingQty: 1,
  ownedPct: 50,
  ownedNotInDeckSample: ["Arcane Signet"],
  missingDeckSample: ["Sol Ring"],
  ownedByKey: {
    "sol ring": { name: "Sol Ring", qty: 1 },
    "arcane signet": { name: "Arcane Signet", qty: 2 },
  },
};

console.log("[ownership-context] annotate owned/missing/unknown");

assert.deepEqual(annotateOwnership(context, "Sol Ring"), {
  ownership: "owned",
  ownedQty: 1,
  ownershipLabel: "Owned",
});

assert.deepEqual(annotateOwnership(context, "Lightning Greaves"), {
  ownership: "missing",
  ownedQty: 0,
  ownershipLabel: "Missing",
});

assert.deepEqual(annotateOwnership(null, "Sol Ring"), {
  ownership: "unknown",
  ownershipLabel: "Unknown",
});

assert.equal(
  appendOwnershipToReason("Great ramp for this deck.", annotateOwnership(context, "Arcane Signet")),
  "Owned x2. Great ramp for this deck.",
);

assert.equal(
  appendOwnershipToReason("Missing from collection. Buy this for the deck.", annotateOwnership(context, "Lightning Greaves")),
  "Missing from collection. Buy this for the deck.",
);

console.log("[ownership-context] OK");
