import assert from "node:assert/strict";
import {
  countMainboardCards,
  detectFormatFromDeckText,
  prepareDeckCheckerRun,
} from "../../lib/deck/deck-checker-prep";

const krenkoSample = `Commander
1 Krenko, Mob Boss

Deck
1 Sol Ring
1 Arcane Signet
30 Mountain`;

assert.ok(countMainboardCards(krenkoSample) >= 32);

const prep = prepareDeckCheckerRun(krenkoSample, "Commander");
assert.equal(prep.detectedFormat, "Commander");
assert.equal(prep.commander, "Krenko, Mob Boss");
assert.ok(prep.cardCount >= 30);

assert.equal(detectFormatFromDeckText("60-card modern list\n1 Lightning Bolt", "Modern"), "Modern");

console.log("deck-checker-prep.test.ts: ok");
