/**
 * Route-adjacent tests: same filter helpers used by deck/recommendations APIs (no HTTP).
 * Covers swap-suggestions, health-suggestions, generate-from-collection/transform, recommendations/cards & deck/[id].
 */
import assert from "node:assert/strict";
import {
  filterSuggestedCardNamesForFormat,
  filterRecommendationRowsByName,
  filterDecklistQtyRowsForFormat,
} from "@/lib/deck/recommendation-legality";
import {
  mockDetailsMap,
  ROW_SOL_RING_LEGAL_CMD,
  ROW_BLACK_LOTUS_BANNED,
  ROW_COUNTERSTANDARD_LEGAL,
  ROW_DEMONTUTOR_NOT_STANDARD,
} from "../fixtures/recommendation-legality-mocks";

const emptyBannedMaps = {
  Commander: {} as Record<string, true>,
  Modern: {} as Record<string, true>,
  Pioneer: {} as Record<string, true>,
  Standard: {} as Record<string, true>,
  Pauper: {} as Record<string, true>,
  Brawl: {} as Record<string, true>,
};

async function main() {
  const cmdMap = mockDetailsMap({
    "Sol Ring": ROW_SOL_RING_LEGAL_CMD,
    "Black Lotus": ROW_BLACK_LOTUS_BANNED,
  });

  // swap-suggestions: filterSuggestedCardNamesForFormat
  const swap = await filterSuggestedCardNamesForFormat(
    ["Sol Ring", "Black Lotus", "Unknown Card"],
    "Commander",
    { bannedMaps: emptyBannedMaps, getDetailsForNamesCachedOverride: async () => cmdMap, logPrefix: "swap" }
  );
  assert.deepEqual(swap.allowed, ["Sol Ring"]);
  assert.ok(swap.removed.length >= 2);

  // health-suggestions + recommendations/cards: filterRecommendationRowsByName on structured rows
  const stapleRows = [
    { name: "Sol Ring", reason: "mana" },
    { name: "Black Lotus", reason: "bad" },
  ];
  const health = await filterRecommendationRowsByName(stapleRows, "Commander", {
    bannedMaps: emptyBannedMaps,
    getDetailsForNamesCachedOverride: async () => cmdMap,
    logPrefix: "health",
  });
  assert.equal(health.allowed.length, 1);
  assert.equal(health.allowed[0].name, "Sol Ring");

  // recommendations/deck/[id]: formatLabel "Pioneer" must use pioneer legality column (regression)
  const pioneerMap = mockDetailsMap({
    "Soul-Scar Mage": { legalities: { pioneer: "legal", standard: "not_legal" } },
    "Black Lotus": ROW_BLACK_LOTUS_BANNED,
  });
  const pioneerRows = [
    { name: "Soul-Scar Mage", reason: "aggro" },
    { name: "Black Lotus", reason: "oops" },
  ];
  const deckRec = await filterRecommendationRowsByName(pioneerRows, "Pioneer", {
    bannedMaps: emptyBannedMaps,
    getDetailsForNamesCachedOverride: async () => pioneerMap,
    logPrefix: "rec/deck",
  });
  assert.deepEqual(
    deckRec.allowed.map((r) => r.name),
    ["Soul-Scar Mage"],
    "Pioneer format must not fall back to commander legality for staples"
  );

  // generate-from-collection / transform: filterDecklistQtyRowsForFormat — partial drop keeps valid JSON-shaped lines
  const qtyLines = [
    { name: "Sol Ring", qty: 1 },
    { name: "Black Lotus", qty: 1 },
  ];
  const gen = await filterDecklistQtyRowsForFormat(qtyLines, "Commander", {
    bannedMaps: emptyBannedMaps,
    getDetailsForNamesCachedOverride: async () => cmdMap,
    logPrefix: "generate",
  });
  assert.deepEqual(gen.lines, [{ name: "Sol Ring", qty: 1 }]);

  // Standard staples from hardcoded lists: illegal in Standard removed, response still non-empty
  const stdMap = mockDetailsMap({
    Counterspell: ROW_COUNTERSTANDARD_LEGAL,
    "Demonic Tutor": ROW_DEMONTUTOR_NOT_STANDARD,
  });
  const stdRows = [
    { name: "Counterspell", reason: "interaction" },
    { name: "Demonic Tutor", reason: "tutor" },
  ];
  const cardsApi = await filterRecommendationRowsByName(stdRows, "Standard", {
    bannedMaps: emptyBannedMaps,
    getDetailsForNamesCachedOverride: async () => stdMap,
    logPrefix: "rec/cards",
  });
  assert.deepEqual(cardsApi.allowed.map((r) => r.name), ["Counterspell"]);

  console.log("recommendation-api-legality: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
