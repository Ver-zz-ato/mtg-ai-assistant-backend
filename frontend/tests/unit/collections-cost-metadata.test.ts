/**
 * Cost API row metadata + proxy row preservation.
 * Run: npx tsx tests/unit/collections-cost-metadata.test.ts
 */
import assert from "node:assert";
import {
  aggregateDeckQuantitiesByCanonKey,
  resolveDeckLineZone,
  normalizedFormatMetadataLabel,
} from "@/lib/collections/costDeckAggregation";
import { normalizeCostProxyRows } from "@/lib/collections/cost-proxy-rows";

const MODERN_SPLIT = `Mainboard
1 Chatterfang, Squirrel General

Sideboard
2 Negate`;

const agg = aggregateDeckQuantitiesByCanonKey(MODERN_SPLIT, "modern");
assert.ok(agg.size >= 2, "should parse main + side cards");

let chatterKey = "";
let negateKey = "";
for (const k of agg.keys()) {
  if (k.includes("chatterfang")) chatterKey = k;
  if (k.includes("negate")) negateKey = k;
}
assert.ok(chatterKey.length > 0, "Chatterfang present");
assert.ok(negateKey.length > 0, "Negate present");

const ch = agg.get(chatterKey)!;
assert.strictEqual(ch.total, 1);
assert.strictEqual(ch.main, 1);
assert.strictEqual(ch.side, 0);
assert.strictEqual(resolveDeckLineZone(ch), "mainboard");

const ng = agg.get(negateKey)!;
assert.strictEqual(ng.total, 2);
assert.strictEqual(ng.side, 2);
assert.strictEqual(resolveDeckLineZone(ng), "sideboard");

assert.strictEqual(normalizedFormatMetadataLabel("modern"), "Modern");
assert.strictEqual(normalizedFormatMetadataLabel(undefined), undefined);

const normalized = normalizeCostProxyRows([
  {
    card: "Sol Ring",
    need: 1,
    unit: 2,
    subtotal: 2,
    source: "Scryfall",
    kind: "missing_from_collection",
    inDeckQty: 1,
    zone: "mainboard",
    extra_upstream_only: "keep-me",
  },
]);
assert.strictEqual(normalized.length, 1);
assert.strictEqual(normalized[0].card, "Sol Ring");
assert.strictEqual(normalized[0].need, 1);
assert.strictEqual((normalized[0] as { kind?: string }).kind, "missing_from_collection");
assert.strictEqual((normalized[0] as { extra_upstream_only?: string }).extra_upstream_only, "keep-me");

console.log("collections-cost-metadata.test.ts: all assertions passed.");
