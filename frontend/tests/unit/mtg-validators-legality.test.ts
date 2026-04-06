/**
 * Unit tests: format mapping + Scryfall status rules + isLegalForFormat (recommendation legality SSOT).
 */
import assert from "node:assert/strict";
import {
  userFormatToScryfallLegalityKey,
  userFormatToBannedDataKey,
  scryfallStatusAllowsInFormat,
  isLegalForFormat,
  userFormatToRecommendationAddCutSyntax,
  userFormatUsesCommanderColorIdentity,
  type BannedDataFormatKey,
} from "@/lib/deck/mtgValidators";
import type { SfCard } from "@/lib/deck/inference";

function card(legalities: Record<string, string>): SfCard {
  return { legalities } as SfCard;
}

async function main() {
  // --- userFormatToScryfallLegalityKey ---
  assert.equal(userFormatToScryfallLegalityKey("commander"), "commander");
  assert.equal(userFormatToScryfallLegalityKey("EDH"), "commander");
  assert.equal(userFormatToScryfallLegalityKey("cEDH"), "commander");
  assert.equal(userFormatToScryfallLegalityKey("Standard"), "standard");
  assert.equal(userFormatToScryfallLegalityKey("std"), "standard");
  assert.equal(userFormatToScryfallLegalityKey("Pioneer"), "pioneer");
  assert.equal(userFormatToScryfallLegalityKey("Modern"), "modern");
  assert.equal(userFormatToScryfallLegalityKey("pauper"), "pauper");
  assert.equal(userFormatToScryfallLegalityKey("Legacy"), "legacy");
  assert.equal(userFormatToScryfallLegalityKey("Vintage"), "vintage");
  assert.equal(userFormatToScryfallLegalityKey("Brawl"), "brawl");
  assert.equal(userFormatToScryfallLegalityKey("Historic"), "historic");
  assert.equal(userFormatToScryfallLegalityKey("Explorer"), "explorer");
  assert.equal(userFormatToScryfallLegalityKey("Alchemy"), "alchemy");
  assert.equal(userFormatToScryfallLegalityKey("  pioneer "), "pioneer");
  assert.equal(userFormatToScryfallLegalityKey("timeless"), null, "timeless not mapped until added to helper");
  assert.equal(userFormatToScryfallLegalityKey(""), null);
  assert.equal(userFormatToScryfallLegalityKey("   "), null);

  // Regression: deck format "Pioneer" must map to Scryfall `pioneer`, not commander fallback.
  assert.equal(userFormatToScryfallLegalityKey("Pioneer"), "pioneer");

  // --- userFormatToBannedDataKey (curated JSON buckets only) ---
  const bannedKeys: Array<{ in: string; out: BannedDataFormatKey | null }> = [
    { in: "Commander", out: "Commander" },
    { in: "standard", out: "Standard" },
    { in: "Pauper", out: "Pauper" },
    { in: "brawl", out: "Brawl" },
    { in: "Modern", out: "Modern" },
    { in: "Pioneer", out: "Pioneer" },
    { in: "Legacy", out: null },
    { in: "Vintage", out: null },
  ];
  for (const row of bannedKeys) {
    assert.equal(userFormatToBannedDataKey(row.in), row.out, `banned key for ${row.in}`);
  }

  // --- scryfallStatusAllowsInFormat ---
  assert.equal(scryfallStatusAllowsInFormat("legal", "commander"), true);
  assert.equal(scryfallStatusAllowsInFormat("banned", "commander"), false);
  assert.equal(scryfallStatusAllowsInFormat("not_legal", "commander"), false);
  assert.equal(scryfallStatusAllowsInFormat("restricted", "commander"), false, "no restricted in Commander");
  assert.equal(scryfallStatusAllowsInFormat(undefined, "commander"), false);
  assert.equal(scryfallStatusAllowsInFormat("", "modern"), false);

  assert.equal(scryfallStatusAllowsInFormat("legal", "vintage"), true);
  assert.equal(scryfallStatusAllowsInFormat("restricted", "vintage"), true);
  assert.equal(scryfallStatusAllowsInFormat("banned", "vintage"), false);

  assert.equal(scryfallStatusAllowsInFormat("restricted", "modern"), false, "restricted only for Vintage");

  // --- isLegalForFormat (mapped formats require legal per scryfallStatusAllowsInFormat) ---
  assert.equal(isLegalForFormat(card({ commander: "legal" }), "Commander"), true);
  assert.equal(isLegalForFormat(card({ commander: "banned" }), "Commander"), false);
  assert.equal(isLegalForFormat(card({ commander: "not_legal" }), "Commander"), false);
  assert.equal(isLegalForFormat(card({ commander: "restricted" }), "Commander"), false);

  // Regression: old bug treated anything except `banned` as OK in Commander — not_legal must fail.
  assert.equal(isLegalForFormat(card({ commander: "not_legal" }), "commander"), false);

  assert.equal(isLegalForFormat(card({ standard: "legal" }), "Standard"), true);
  assert.equal(isLegalForFormat(card({ standard: "not_legal" }), "Standard"), false);

  assert.equal(isLegalForFormat(card({ pauper: "legal" }), "pauper"), true);
  assert.equal(isLegalForFormat(card({ brawl: "legal" }), "Brawl"), true);
  assert.equal(isLegalForFormat(card({ legacy: "legal" }), "legacy"), true);
  assert.equal(isLegalForFormat(card({ vintage: "restricted" }), "Vintage"), true);
  assert.equal(isLegalForFormat(card({ vintage: "legal" }), "Vintage"), true);
  assert.equal(isLegalForFormat(card({}), "Commander"), false, "missing commander legality");
  assert.equal(isLegalForFormat(card({ modern: "legal" }), "Commander"), false, "wrong format key in object");

  assert.equal(isLegalForFormat(card({ commander: "legal" }), "UnknownFmt"), false);

  assert.equal(userFormatToRecommendationAddCutSyntax("Commander"), "commander");
  assert.equal(userFormatToRecommendationAddCutSyntax("brawl"), "sixty");
  assert.equal(userFormatToRecommendationAddCutSyntax("Standard"), "sixty");
  assert.equal(userFormatToRecommendationAddCutSyntax("pauper"), "sixty");

  assert.equal(userFormatUsesCommanderColorIdentity("commander"), true);
  assert.equal(userFormatUsesCommanderColorIdentity("Brawl"), true);
  assert.equal(userFormatUsesCommanderColorIdentity("standard"), false);

  console.log("mtg-validators-legality: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
