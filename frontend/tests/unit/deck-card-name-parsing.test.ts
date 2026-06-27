import assert from "node:assert";
import {
  cleanCardName,
  looksLikeCardName,
  sanitizedNameForDeckPersistence,
} from "@/lib/deck/cleanCardName";
import { parseDeckText } from "@/lib/deck/parseDeckText";
import { parseDeckTextWithZones } from "@/lib/deck/parseDeckText";
import { parseDeckOrCollectionCSV } from "@/lib/csv/parse";
import { parseCollectionCsvText } from "@/lib/csv/collection";

const tmntCard = "Bebop, Skull & Crossbones";
const michelangeloCard = "Michelangelo, Weirdness to 11";
const quotedCard = "\"Ach! Hans, Run!\"";

assert.equal(cleanCardName(`1 ${tmntCard}`), tmntCard);
assert.equal(looksLikeCardName(tmntCard), true);
assert.equal(sanitizedNameForDeckPersistence(tmntCard), tmntCard);
assert.equal(cleanCardName(michelangeloCard), michelangeloCard);
assert.equal(sanitizedNameForDeckPersistence(michelangeloCard), michelangeloCard);
assert.equal(cleanCardName(quotedCard), quotedCard);
assert.equal(sanitizedNameForDeckPersistence(quotedCard), quotedCard);
assert.equal(looksLikeCardName(quotedCard), true);
assert.equal(cleanCardName("Alela, Cunning Conqueror - THIS IS THE COMMANDER"), "Alela, Cunning Conqueror");
assert.equal(cleanCardName("Alela, Cunning Conqueror (Commander)"), "Alela, Cunning Conqueror");
assert.equal(cleanCardName("Alela, Cunning Conqueror <-- commander"), "Alela, Cunning Conqueror");

assert.deepEqual(parseDeckText(`1 ${tmntCard}`), [{ name: tmntCard, qty: 1 }]);
assert.deepEqual(parseDeckText(`2x ${tmntCard}`), [{ name: tmntCard, qty: 2 }]);
assert.deepEqual(parseDeckText(`1 ${michelangeloCard}`), [{ name: michelangeloCard, qty: 1 }]);
assert.deepEqual(parseDeckText(`1 ${quotedCard}`), [{ name: quotedCard, qty: 1 }]);
assert.deepEqual(parseDeckText("1 Alela, Cunning Conqueror - THIS IS THE COMMANDER"), [
  { name: "Alela, Cunning Conqueror", qty: 1 },
]);
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

const moxfieldCollectionExport = [
  "Tradelist Count,Name,Edition,Collector Number,Tags",
  "2,Sol Ring,Commander Masters,403,Staples",
  "1,\"Fire // Ice\",Modern Horizons 2,999,Split",
].join("\n");

assert.deepEqual(parseDeckOrCollectionCSV(moxfieldCollectionExport), [
  { name: "Sol Ring", qty: 2 },
  { name: "Fire // Ice", qty: 1 },
]);
assert.equal(parseCollectionCsvText(moxfieldCollectionExport).report.detectedFormat, "moxfield");

const finalFantasyStarterKitExport = [
  "Deck,Quantity,Card Name",
  'Cloud,1,"Cloud, Planet\'s Champion"',
  "Cloud,2,Coeurl",
  "Cloud,3,Coeurl",
  "Sephiroth,12,Swamp",
].join("\n");

const finalFantasyParsed = parseCollectionCsvText(finalFantasyStarterKitExport).rows;
assert.deepEqual(finalFantasyParsed, [
  { name: "Cloud, Planet's Champion", qty: 1 },
  { name: "Coeurl", qty: 5 },
  { name: "Swamp", qty: 12 },
]);
assert.equal(finalFantasyParsed.reduce((sum, row) => sum + row.qty, 0), 18);

const archidektQuotedExport = [
  "Qty,Card,Edition,Condition,Language,Foil,Alter,Signed",
  "3,Path to Exile,Double Masters,NM,English,,FALSE,FALSE",
  "1,\"\"\"Ach! Hans, Run!\"\"\",Unfinity,NM,English,,FALSE,FALSE",
].join("\n");

assert.deepEqual(parseDeckOrCollectionCSV(archidektQuotedExport), [
  { name: "Path to Exile", qty: 3 },
  { name: "\"Ach! Hans, Run!\"", qty: 1 },
]);
assert.equal(parseCollectionCsvText(archidektQuotedExport).report.detectedFormat, "archidekt");

assert.deepEqual(
  parseDeckTextWithZones(["Mainboard", "4 Lightning Bolt", "", "Sideboard", "2 Pyroblast"].join("\n"), {
    isCommanderFormat: false,
  }),
  [
    { name: "Lightning Bolt", qty: 4, zone: "mainboard" },
    { name: "Pyroblast", qty: 2, zone: "sideboard" },
  ],
);

console.log("deck-card-name-parsing.test.ts passed");
