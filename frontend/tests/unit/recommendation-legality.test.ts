/**
 * Unit tests: recommendation-legality helpers (evaluate + async filters + bracket strip).
 */
import assert from "node:assert/strict";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";
import {
  evaluateCardRecommendationLegality,
  filterSuggestedCardNamesForFormat,
  filterRecommendationRowsByName,
  filterDecklistQtyRowsForFormat,
  stripIllegalBracketCardTokensFromText,
} from "@/lib/deck/recommendation-legality";
import {
  mockDetailsMap,
  ROW_SOL_RING_LEGAL_CMD,
  ROW_BLACK_LOTUS_BANNED,
  ROW_STICKERS_NOT_LEGAL,
  ROW_EMPTY_LEGALITIES,
  ROW_COUNTERSTANDARD_LEGAL,
  ROW_DEMONTUTOR_NOT_STANDARD,
  ROW_VINTAGE_RESTRICTED,
  ROW_OVERBAN_TEST,
  key,
} from "../fixtures/recommendation-legality-mocks";

async function main() {
  const kSol = key("Sol Ring");
  const kLotus = key("Black Lotus");

  // Commander: legal passes
  assert.deepEqual(
    evaluateCardRecommendationLegality(ROW_SOL_RING_LEGAL_CMD, kSol, "Commander", null),
    { allowed: true, reason: null }
  );

  // Commander: banned (Scryfall)
  assert.deepEqual(
    evaluateCardRecommendationLegality(ROW_BLACK_LOTUS_BANNED, kLotus, "Commander", null),
    { allowed: false, reason: "banned" }
  );

  // Commander: not_legal
  assert.deepEqual(
    evaluateCardRecommendationLegality(ROW_STICKERS_NOT_LEGAL, key("Some Sticker"), "Commander", null),
    { allowed: false, reason: "not_legal" }
  );

  // Commander: missing / empty legality object
  assert.deepEqual(
    evaluateCardRecommendationLegality(ROW_EMPTY_LEGALITIES, key("X"), "Commander", null),
    { allowed: false, reason: "missing_legality" }
  );
  assert.deepEqual(
    evaluateCardRecommendationLegality(null, key("Missing"), "Commander", null),
    { allowed: false, reason: "cache_miss" }
  );

  // Vintage: restricted allowed
  assert.deepEqual(
    evaluateCardRecommendationLegality(ROW_VINTAGE_RESTRICTED, key("Mox Pearl"), "Vintage", null),
    { allowed: true, reason: null }
  );

  // Other formats: legal only
  assert.deepEqual(
    evaluateCardRecommendationLegality(ROW_COUNTERSTANDARD_LEGAL, key("Counterspell"), "Standard", null),
    { allowed: true, reason: null }
  );
  assert.deepEqual(
    evaluateCardRecommendationLegality(ROW_DEMONTUTOR_NOT_STANDARD, key("Demonic Tutor"), "Standard", null),
    { allowed: false, reason: "not_legal" }
  );

  // Unknown user format
  assert.deepEqual(
    evaluateCardRecommendationLegality(ROW_SOL_RING_LEGAL_CMD, kSol, "TotallyUnknownArenaFormat", null),
    { allowed: false, reason: "unknown_format" }
  );

  // Ban overlay by normalized name beats Scryfall legal
  const banNorm = new Set<string>([normalizeScryfallCacheName("Sol Ring")]);
  assert.deepEqual(
    evaluateCardRecommendationLegality(ROW_OVERBAN_TEST, kSol, "Commander", banNorm),
    { allowed: false, reason: "banned" }
  );

  // Regression: ban map key with odd spacing normalizes to same cache key as oracle name
  const banWeird = new Set<string>([normalizeScryfallCacheName("Tolarian  Academy")]);
  const kAcademy = key("Tolarian Academy");
  assert.deepEqual(
    evaluateCardRecommendationLegality(
      { legalities: { commander: "legal" } },
      kAcademy,
      "Commander",
      banWeird
    ),
    { allowed: false, reason: "banned" }
  );

  const mockCommander = mockDetailsMap({
    "Sol Ring": ROW_SOL_RING_LEGAL_CMD,
    "Black Lotus": ROW_BLACK_LOTUS_BANNED,
    "Empty Card": ROW_EMPTY_LEGALITIES,
  });

  const bannedMaps = {
    Commander: {} as Record<string, true>,
    Modern: {} as Record<string, true>,
    Pioneer: {} as Record<string, true>,
    Standard: {} as Record<string, true>,
    Pauper: {} as Record<string, true>,
    Brawl: {} as Record<string, true>,
  };

  const { allowed: namesOk, removed: namesRm } = await filterSuggestedCardNamesForFormat(
    ["Sol Ring", "Black Lotus", "No Such Card", "Empty Card"],
    "Commander",
    {
      bannedMaps,
      getDetailsForNamesCachedOverride: async () => mockCommander,
    }
  );
  assert.deepEqual(namesOk, ["Sol Ring"]);
  assert.equal(namesRm.find((r) => r.name === "Black Lotus")?.reason, "banned");
  assert.equal(namesRm.find((r) => r.name === "No Such Card")?.reason, "cache_miss");
  assert.equal(namesRm.find((r) => r.name === "Empty Card")?.reason, "missing_legality");

  const rows = [
    { name: "Sol Ring", reason: "r1" },
    { name: "Black Lotus", reason: "r2" },
  ];
  const { allowed: rowsOk } = await filterRecommendationRowsByName(rows, "Commander", {
    bannedMaps,
    getDetailsForNamesCachedOverride: async () => mockCommander,
  });
  assert.equal(rowsOk.length, 1);
  assert.equal(rowsOk[0].name, "Sol Ring");

  const deckLines = [
    { name: "Sol Ring", qty: 1 },
    { name: "Black Lotus", qty: 1 },
  ];
  const { lines: kept } = await filterDecklistQtyRowsForFormat(deckLines, "Commander", {
    bannedMaps,
    getDetailsForNamesCachedOverride: async () => mockCommander,
  });
  assert.equal(kept.length, 1);
  assert.equal(kept[0].name, "Sol Ring");

  const stdMap = mockDetailsMap({
    Counterspell: ROW_COUNTERSTANDARD_LEGAL,
    "Demonic Tutor": ROW_DEMONTUTOR_NOT_STANDARD,
  });
  const bracketOut = await stripIllegalBracketCardTokensFromText(
    "Try [[Counterspell]] or [[Demonic Tutor]] for draw.",
    "Standard",
    { bannedMaps, getDetailsForNamesCachedOverride: async () => stdMap }
  );
  assert.match(bracketOut, /\[\[Counterspell\]\]/);
  assert.match(bracketOut, /Demonic Tutor/);
  assert.doesNotMatch(bracketOut, /\[\[Demonic Tutor\]\]/);

  console.log("recommendation-legality: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
