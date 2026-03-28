/**
 * Trending cards scoring (meta_signals.trending-cards).
 * Run: npx tsx tests/unit/trending-cards-compute.test.ts
 */
import assert from "node:assert";
import {
  computeTrendingCardsList,
  isStapleDenied,
  TRENDING_CARDS_MAX_INCLUSION,
} from "@/lib/meta/trendingCardsCompute";

{
  const out = computeTrendingCardsList({
    recentCounts: { Steady: 10, Climber: 5 },
    prevCounts: { Steady: 10, Climber: 0 },
    globalCounts: { Steady: 10, Climber: 5 },
    recentTotalDecks: 100,
    prevTotalDecks: 100,
    globalTotalDecks: 100,
    landNamesLower: new Set(),
  });
  assert.strictEqual(out[0]?.name, "Climber");
}

{
  const n = Math.floor(TRENDING_CARDS_MAX_INCLUSION * 100) + 1;
  const out = computeTrendingCardsList({
    recentCounts: { "Sol Ring": 10, Niche: 10, Ok: 10 },
    prevCounts: { "Sol Ring": 0, Niche: 0, Ok: 0 },
    globalCounts: { "Sol Ring": 10, Niche: n, Ok: 10 },
    recentTotalDecks: 100,
    prevTotalDecks: 100,
    globalTotalDecks: 100,
    landNamesLower: new Set(),
  });
  assert.deepStrictEqual(
    out.map((r) => r.name),
    ["Ok"]
  );
  assert.strictEqual(isStapleDenied("Sol Ring"), true);
}

{
  const out = computeTrendingCardsList({
    recentCounts: { Low: 4 },
    prevCounts: {},
    globalCounts: { Low: 4 },
    recentTotalDecks: 100,
    prevTotalDecks: 0,
    globalTotalDecks: 100,
    landNamesLower: new Set(),
  });
  assert.deepStrictEqual(out, []);
}

console.log("OK trending-cards-compute");
