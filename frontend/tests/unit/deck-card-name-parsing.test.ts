import assert from "node:assert";
import {
  cleanCardName,
  looksLikeCardName,
  sanitizedNameForDeckPersistence,
} from "@/lib/deck/cleanCardName";
import { parseDeckText } from "@/lib/deck/parseDeckText";
import { parseDeckOrCollectionCSV } from "@/lib/csv/parse";
import { parseCollectionCsvText } from "@/lib/csv/collection";

const tmntCard = "Bebop, Skull & Crossbones";
const michelangeloCard = "Michelangelo, Weirdness to 11";

assert.equal(cleanCardName(`1 ${tmntCard}`), tmntCard);
assert.equal(looksLikeCardName(tmntCard), true);
assert.equal(sanitizedNameForDeckPersistence(tmntCard), tmntCard);
assert.equal(cleanCardName(michelangeloCard), michelangeloCard);
assert.equal(sanitizedNameForDeckPersistence(michelangeloCard), michelangeloCard);

assert.deepEqual(parseDeckText(`1 ${tmntCard}`), [{ name: tmntCard, qty: 1 }]);
assert.deepEqual(parseDeckText(`2x ${tmntCard}`), [{ name: tmntCard, qty: 2 }]);
assert.deepEqual(parseDeckText(`1 ${michelangeloCard}`), [{ name: michelangeloCard, qty: 1 }]);
assert.deepEqual(parseDeckOrCollectionCSV(`1 ${tmntCard}`), [{ name: tmntCard, qty: 1 }]);

const manatapAmpersandExport = [
  "QuantityX&Name&Edition&Foil&Card Type&Color&Mana Value&Price&Scryfall ID",
  "1x&Predation Steward&Phyrexia: All Will Be One&&Creature - Phyrexian Elf Warrior&Green&{1}{G}&GBP0.11&419fab07-0000-0000-0000-000000000000",
  "8x&Plains&Starter Commander&&Basic Land - Plains&Land&&GBP0.14&77777777-0000-0000-0000-000000000000",
  "1x&Bebop, Skull & Crossbones&Turtle Power!&&Legendary Creature&Red&{3}{R}&GBP0.20&88888888-0000-0000-0000-000000000000",
].join("\n");

assert.deepEqual(parseDeckOrCollectionCSV(manatapAmpersandExport), [
  { name: "Predation Steward", qty: 1 },
  { name: "Plains", qty: 8 },
  { name: "Bebop, Skull & Crossbones", qty: 1 },
]);
assert.deepEqual(parseCollectionCsvText(manatapAmpersandExport).rows, [
  { name: "Predation Steward", qty: 1 },
  { name: "Plains", qty: 8 },
  { name: "Bebop, Skull & Crossbones", qty: 1 },
]);
assert.deepEqual(parseDeckText(manatapAmpersandExport), [
  { name: "Predation Steward", qty: 1 },
  { name: "Plains", qty: 8 },
  { name: "Bebop, Skull & Crossbones", qty: 1 },
]);

console.log("deck-card-name-parsing.test.ts passed");
