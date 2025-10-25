import { mapToScryfall } from "../../lib/search/nl";
import { strict as assert } from "assert";

test('maps cheap white instant draw', () => {
  const q = mapToScryfall('cheap white instant draw cmc<=2');
  assert.ok(q.includes('c:w'));
  assert.ok(q.includes('type:instant'));
  assert.ok(q.includes('cmc<=2'));
  assert.ok(q.includes('draw'));
});

test('rarity mapping', () => {
  const q = mapToScryfall('mythic dragon');
  assert.ok(q.includes('r:mythic'));
});

test('any: set', () => {
  const q = mapToScryfall('any:treasure clue food');
  assert.ok(/(o:treasure or o:clue or o:food)/.test(q));
});