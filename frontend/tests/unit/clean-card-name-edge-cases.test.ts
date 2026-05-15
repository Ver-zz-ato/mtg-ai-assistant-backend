import assert from "node:assert";
import {
  cleanCardName,
  looksLikeCardName,
  sanitizedNameForDeckPersistence,
} from "@/lib/deck/cleanCardName";
import { parseDeckText } from "@/lib/deck/parseDeckText";

const preservedNames = [
  "Michelangelo, Weirdness to 11",
  "\"Ach! Hans, Run!\"",
  "Bebop, Skull & Crossbones",
  "Black Waltz No. 3",
  "Naturalize 2",
];

for (const name of preservedNames) {
  assert.equal(cleanCardName(name), name, `should preserve real card name: ${name}`);
  assert.equal(sanitizedNameForDeckPersistence(name), name, `should persist real card name: ${name}`);
  assert.equal(looksLikeCardName(name), true, `should accept real card name: ${name}`);
}

const cleanedImportCases: Array<{ raw: string; expected: string }> = [
  { raw: "1 Sol Ring (C21) 263", expected: "Sol Ring" },
  { raw: "1x Sol Ring [C21]", expected: "Sol Ring" },
  { raw: "[[Sol Ring]]", expected: "Sol Ring" },
  { raw: "SB: Sol Ring", expected: "Sol Ring" },
  { raw: "Commander: Atraxa, Praetors' Voice", expected: "Atraxa, Praetors' Voice" },
];

for (const { raw, expected } of cleanedImportCases) {
  assert.equal(cleanCardName(raw), expected, `should clean import noise: ${raw}`);
  assert.equal(
    sanitizedNameForDeckPersistence(raw),
    expected,
    `should persist cleaned import name: ${raw}`,
  );
}

assert.equal(
  sanitizedNameForDeckPersistence("Dowsing Dagger // Lost Vale (PLST) XLN-235"),
  "Dowsing Dagger // Lost Vale",
);
assert.deepEqual(parseDeckText("1 Dowsing Dagger // Lost Vale (PLST) XLN-235"), [
  { name: "Dowsing Dagger // Lost Vale", qty: 1 },
]);
assert.deepEqual(parseDeckText("1 Fire // Ice"), [{ name: "Fire // Ice", qty: 1 }]);

const rejectedInputs = [
  "Deck",
  "Price",
  "Creatures (23)",
  "https://example.com/card",
  "Title, Commander, Decklist",
];

for (const raw of rejectedInputs) {
  assert.equal(looksLikeCardName(raw), false, `should reject non-card input: ${raw}`);
  assert.equal(sanitizedNameForDeckPersistence(raw), "", `should not persist non-card input: ${raw}`);
}

console.log("clean-card-name-edge-cases.test.ts passed");
