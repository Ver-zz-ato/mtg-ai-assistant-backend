import assert from "node:assert";
import {
  describeUnrecognizedCards,
  parseCommanderDecklistForImport,
  sanitizeImportedCardEntries,
} from "@/lib/deck/importHelpers";

const sanitized = sanitizeImportedCardEntries([
  { name: "Michelangelo, Weirdness to 11", qty: 1 },
  { name: "Sol Ring (C21) 263", qty: 2 },
  { name: "Sol Ring", qty: 1 },
  { name: "https://moxfield.com/decks/example", qty: 1 },
  { name: "Creatures (23)", qty: 1 },
]);

assert.deepEqual(sanitized.cards, [
  { name: "Michelangelo, Weirdness to 11", qty: 1 },
  { name: "Sol Ring", qty: 3 },
]);
assert.deepEqual(sanitized.invalid, [
  { originalName: "https://moxfield.com/decks/example", qty: 1, suggestions: [] },
  { originalName: "Creatures (23)", qty: 1, suggestions: [] },
]);

const explicitCommander = parseCommanderDecklistForImport(
  ["1 Sol Ring", "1 Arcane Signet"].join("\n"),
  "Atraxa, Praetors' Voice",
);
assert.equal(explicitCommander.commander, "Atraxa, Praetors' Voice");
assert.deepEqual(explicitCommander.cards, [
  { name: "Sol Ring", qty: 1 },
  { name: "Arcane Signet", qty: 1 },
]);
assert.equal(explicitCommander.totalCards, 3);

const dedupedCommander = parseCommanderDecklistForImport(
  ["Atraxa, Praetors' Voice", "1 Sol Ring", "1 Arcane Signet"].join("\n"),
  "Atraxa, Praetors' Voice",
);
assert.equal(dedupedCommander.commander, "Atraxa, Praetors' Voice");
assert.deepEqual(dedupedCommander.cards, [
  { name: "Sol Ring", qty: 1 },
  { name: "Arcane Signet", qty: 1 },
]);
assert.equal(dedupedCommander.totalCards, 3);

assert.equal(
  describeUnrecognizedCards([
    { originalName: "Card One", qty: 1, suggestions: [] },
    { originalName: "Card Two", qty: 1, suggestions: [] },
    { originalName: "Card Three", qty: 1, suggestions: [] },
    { originalName: "Card Four", qty: 1, suggestions: [] },
  ]),
  "Unrecognized card names: Card One, Card Two, Card Three (+1 more)",
);

console.log("deck-import-route-helpers.test.ts passed");
