/**
 * Blending helpers for Discover meta (external + internal).
 */
import assert from "node:assert";
import {
  blendMostPlayedCommanders,
  blendTrendingCardsWithGlobal,
  TRENDING_CARDS_MIN_DISPLAY_ROWS,
} from "../../lib/meta/discoverBlend";
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

  const cardGlobal: NormalizedGlobalMetaRow[] = [
    {
      entityType: "card",
      name: "Blasphemous Act",
      nameNorm: "blasphemous act",
      rank: 1,
      score: 0.9,
      trendScore: 0,
      source: "scryfall",
      timeWindow: "edhrec_popular",
    },
    {
      entityType: "card",
      name: "Rhystic Study",
      nameNorm: "rhystic study",
      rank: 2,
      score: 0.85,
      trendScore: 0,
      source: "scryfall",
      timeWindow: "edhrec_popular",
    },
    {
      entityType: "card",
      name: "Cyclonic Rift",
      nameNorm: "cyclonic rift",
      rank: 3,
      score: 0.8,
      trendScore: 0,
      source: "scryfall",
      timeWindow: "edhrec_popular",
    },
    {
      entityType: "card",
      name: "Smothering Tithe",
      nameNorm: "smothering tithe",
      rank: 4,
      score: 0.75,
      trendScore: 0,
      source: "scryfall",
      timeWindow: "edhrec_popular",
    },
    {
      entityType: "card",
      name: "Demonic Tutor",
      nameNorm: "demonic tutor",
      rank: 5,
      score: 0.7,
      trendScore: 0,
      source: "scryfall",
      timeWindow: "edhrec_popular",
    },
    {
      entityType: "card",
      name: "Arcane Signet",
      nameNorm: "arcane signet",
      rank: 6,
      score: 0.65,
      trendScore: 0,
      source: "scryfall",
      timeWindow: "edhrec_popular",
    },
    {
      entityType: "card",
      name: "Heroic Intervention",
      nameNorm: "heroic intervention",
      rank: 7,
      score: 0.6,
      trendScore: 0,
      source: "scryfall",
      timeWindow: "edhrec_popular",
    },
  ];
  const trending = blendTrendingCardsWithGlobal(
    [{ name: "Blasphemous Act", count: 5 }],
    cardGlobal,
    { minRows: TRENDING_CARDS_MIN_DISPLAY_ROWS }
  );
  assert.strictEqual(trending.length, TRENDING_CARDS_MIN_DISPLAY_ROWS);
  assert.strictEqual(trending[0]?.name, "Blasphemous Act");
  assert.ok(trending.some((row) => row.name === "Rhystic Study"));
  assert.ok(!trending.some((row) => row.name === "Arcane Signet"));
  assert.ok(trending.some((row) => row.dataScope === "global"));

  const seeded = blendTrendingCardsWithGlobal([], cardGlobal, {
    minRows: TRENDING_CARDS_MIN_DISPLAY_ROWS,
  });
  assert.strictEqual(seeded.length, TRENDING_CARDS_MIN_DISPLAY_ROWS);
  assert.strictEqual(seeded[0]?.name, "Blasphemous Act");
  assert.ok(seeded.every((row) => row.dataScope === "global"));
  assert.ok(!seeded.some((row) => row.name === "Arcane Signet"));
  console.log("discover-blend ok");
})();
