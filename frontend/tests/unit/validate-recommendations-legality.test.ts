/**
 * Unit tests: validateRecommendations format legality (3b) + no false Commander routing for Standard/Pauper/Brawl.
 */
import assert from "node:assert/strict";
import { validateRecommendations } from "@/lib/chat/validateRecommendations";
import { key } from "../fixtures/recommendation-legality-mocks";

async function main() {
  const emptyBan = new Set<string>();

  // Commander: legal ADD stays (explicit color identity avoids commander fetch)
  const boltKey = key("Lightning Bolt");
  const cmdLegal = await validateRecommendations({
    deckCards: [{ name: "Mountain", count: 1 }],
    formatKey: "commander",
    colorIdentity: ["R"],
    commanderName: "Test Commander",
    rawText: "ADD [[Lightning Bolt]]\nCUT [[Mountain]]",
    formatForLegality: "Commander",
    testCardDetailsMap: new Map([
      [
        boltKey,
        {
          legalities: { commander: "legal" },
          color_identity: ["R"],
        },
      ],
    ]),
    testLegalityBanNormSet: emptyBan,
  });
  assert.match(cmdLegal.repairedText, /Lightning Bolt/i, "legal Commander ADD preserved");
  assert.equal(cmdLegal.issues.some((i) => i.kind === "illegal_format"), false);

  // Commander: banned
  const lotusKey = key("Black Lotus");
  const cmdBanned = await validateRecommendations({
    deckCards: [{ name: "Mountain", count: 1 }],
    formatKey: "commander",
    colorIdentity: ["R"],
    rawText: "ADD [[Black Lotus]]\nCUT [[Mountain]]",
    formatForLegality: "Commander",
    testCardDetailsMap: new Map([
      [lotusKey, { legalities: { commander: "banned" }, color_identity: [] }],
    ]),
    testLegalityBanNormSet: emptyBan,
  });
  assert.equal(cmdBanned.issues.some((i) => i.kind === "illegal_format"), true);
  assert.doesNotMatch(cmdBanned.repairedText, /Black Lotus/i);

  // Standard: uses Standard Scryfall key (formatKey modern for ADD +N syntax), not Commander legality
  const csKey = key("Counterspell");
  const stdOk = await validateRecommendations({
    deckCards: [{ name: "Mountain", count: 4 }],
    rawText: "ADD +1 [[Counterspell]]\nCUT [[Mountain]]",
    formatForLegality: "Standard",
    testCardDetailsMap: new Map([
      [csKey, { legalities: { standard: "legal", commander: "legal" }, color_identity: ["U"] }],
    ]),
    testLegalityBanNormSet: emptyBan,
  });
  assert.equal(stdOk.issues.filter((i) => i.kind === "illegal_format").length, 0);
  assert.match(stdOk.repairedText, /Counterspell/i);

  const dtKey = key("Demonic Tutor");
  const stdBad = await validateRecommendations({
    deckCards: [{ name: "Mountain", count: 4 }],
    rawText: "ADD +1 [[Demonic Tutor]]\nCUT [[Mountain]]",
    formatForLegality: "Standard",
    testCardDetailsMap: new Map([
      [dtKey, { legalities: { standard: "not_legal", commander: "legal" }, color_identity: ["B"] }],
    ]),
    testLegalityBanNormSet: emptyBan,
  });
  assert.equal(stdBad.issues.some((i) => i.kind === "illegal_format"), true);

  // Pauper: not routed through Commander — card legal in Commander but not in Pauper must fail
  const mythicKey = key("Hullbreaker Horror");
  const pauperBad = await validateRecommendations({
    deckCards: [{ name: "Mountain", count: 4 }],
    rawText: "ADD +1 [[Hullbreaker Horror]]\nCUT [[Mountain]]",
    formatForLegality: "Pauper",
    testCardDetailsMap: new Map([
      [
        mythicKey,
        {
          legalities: { pauper: "not_legal", commander: "legal" },
          color_identity: ["U"],
        },
      ],
    ]),
    testLegalityBanNormSet: emptyBan,
  });
  assert.equal(pauperBad.issues.some((i) => i.kind === "illegal_format"), true);

  // Brawl: use brawl legality column
  const brawlKey = key("Rhystic Study");
  const brawlBad = await validateRecommendations({
    deckCards: [{ name: "Mountain", count: 4 }],
    rawText: "ADD +1 [[Rhystic Study]]\nCUT [[Mountain]]",
    formatForLegality: "Brawl",
    testCardDetailsMap: new Map([
      [brawlKey, { legalities: { brawl: "not_legal", commander: "legal" }, color_identity: ["U"] }],
    ]),
    testLegalityBanNormSet: emptyBan,
  });
  assert.equal(brawlBad.issues.some((i) => i.kind === "illegal_format"), true);

  // Ban overlay: Scryfall says Commander legal but normalized ban set still rejects
  const ringKey = key("Sol Ring");
  const overlayBan = new Set<string>([ringKey]);
  const banOverlay = await validateRecommendations({
    deckCards: [{ name: "Mountain", count: 1 }],
    formatKey: "commander",
    colorIdentity: ["R"],
    rawText: "ADD [[Sol Ring]]\nCUT [[Mountain]]",
    formatForLegality: "Commander",
    testCardDetailsMap: new Map([
      [ringKey, { legalities: { commander: "legal" }, color_identity: [] }],
    ]),
    testLegalityBanNormSet: overlayBan,
  });
  assert.equal(banOverlay.issues.some((i) => i.kind === "illegal_format"), true);

  console.log("validate-recommendations-legality: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
