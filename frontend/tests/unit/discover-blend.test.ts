/**
 * Blending helpers for Discover meta (external + internal).
 */
import assert from "node:assert";
import { blendMostPlayedCommanders } from "../../lib/meta/discoverBlend";
import type { NormalizedGlobalMetaRow } from "../../lib/meta/scryfallGlobalMeta";

const g: NormalizedGlobalMetaRow[] = [
  {
    entityType: "commander",
    name: "Kenrith, the Returned King",
    nameNorm: "kenrith, the returned king",
    rank: 1,
    score: 0.9,
    trendScore: 0,
    source: "scryfall",
    timeWindow: "edhrec_popular",
  },
];

void (async () => {
  const { rows, externalOk } = blendMostPlayedCommanders({
    internal7d: { "Kenrith, the Returned King": 2, "Other": 1 },
    globalPopular: g,
  });
  assert.strictEqual(externalOk, true);
  assert.ok(rows.length >= 1);
  assert.strictEqual(rows[0].name, "Kenrith, the Returned King");
  console.log("discover-blend ok");
})();
