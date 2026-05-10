import assert from "node:assert";
import {
  cleanCardName,
  looksLikeCardName,
  sanitizedNameForDeckPersistence,
} from "@/lib/deck/cleanCardName";
import { parseDeckText } from "@/lib/deck/parseDeckText";
import { parseDeckOrCollectionCSV } from "@/lib/csv/parse";

const tmntCard = "Bebop, Skull & Crossbones";

assert.equal(cleanCardName(`1 ${tmntCard}`), tmntCard);
assert.equal(looksLikeCardName(tmntCard), true);
assert.equal(sanitizedNameForDeckPersistence(tmntCard), tmntCard);

assert.deepEqual(parseDeckText(`1 ${tmntCard}`), [{ name: tmntCard, qty: 1 }]);
assert.deepEqual(parseDeckText(`2x ${tmntCard}`), [{ name: tmntCard, qty: 2 }]);
assert.deepEqual(parseDeckOrCollectionCSV(`1 ${tmntCard}`), [{ name: tmntCard, qty: 1 }]);

console.log("deck-card-name-parsing.test.ts passed");
