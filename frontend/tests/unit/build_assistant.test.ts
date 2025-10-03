import assert from 'node:assert';
import { encodeBase64Url, decodeBase64Url } from '@/lib/utils/base64url';
import { computeDiff } from '@/lib/assistant/diff';

(async function(){
  // base64url round-trip
  const obj = { format: 'Commander', colors: ['G','U'], budget: 50, archetype: 'tokens' };
  const enc = encodeBase64Url(JSON.stringify(obj));
  assert.ok(typeof enc === 'string' && enc.length > 0, 'encode outputs string');
  const dec = decodeBase64Url(enc);
  assert.deepStrictEqual(JSON.parse(dec), obj, 'round-trip JSON matches');

  // diff computation
  const before = [ { name: 'Sol Ring', qty: 1 }, { name: 'Arcane Signet', qty: 1 } ];
  const after  = [ { name: 'Sol Ring', qty: 0 }, { name: 'Arcane Signet', qty: 2 }, { name: 'Mind Stone', qty: 1 } ];
  const diff = computeDiff(before, after);
  const by = new Map(diff.map(d=>[d.name.toLowerCase(), d.delta]));
  assert.strictEqual(by.get('sol ring'), -1, 'sol ring -1');
  assert.strictEqual(by.get('arcane signet'), +1, 'arcane +1');
  assert.strictEqual(by.get('mind stone'), +1, 'mind stone +1');

  console.log('build-assistant unit tests passed');
})();
