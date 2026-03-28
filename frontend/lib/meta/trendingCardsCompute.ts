/**
 * Trending cards: trend delta vs raw popularity, exclude lands/staples/high-inclusion.
 * Used by GET /api/cron/meta-signals (writes meta_signals.trending-cards).
 */

export const TRENDING_CARDS_OUTPUT_LIMIT = 30;
export const TRENDING_CARDS_MIN_RECENT_DECKS = 5;
/** Exclude cards present in more than this share of decks (global sample). */
export const TRENDING_CARDS_MAX_INCLUSION = 0.4;

/** Oracle-name staples to exclude (lowercase). */
export const TRENDING_CARDS_STAPLE_DENYLIST = new Set([
  "sol ring",
  "arcane signet",
  "command tower",
  "swiftfoot boots",
  "lightning greaves",
  "cultivate",
  "kodama's reach",
  "kodama’s reach", // unicode apostrophe
]);

export function normalizeCardKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Exported for cron prefetch of scryfall land flags. */
export function isStapleDenied(name: string): boolean {
  const k = normalizeCardKey(name);
  return TRENDING_CARDS_STAPLE_DENYLIST.has(k);
}

/** Exported for cron: batch-fetch scryfall rows and mark lands. */
export function isLandFromCacheRow(row: {
  is_land?: boolean | null;
  type_line?: string | null;
}): boolean {
  if (row.is_land === true) return true;
  // Do not use .includes("land") — it matches "Island". Use word-boundary Land.
  return /\bLand\b/.test(row.type_line ?? "");
}

/**
 * Build map: card name -> set of deck ids (unique deck incidence).
 */
export function mergeDeckIdsIntoMap(
  rows: { deck_id?: string; name?: string | null }[],
  into: Map<string, Set<string>>
): void {
  for (const row of rows) {
    const deckId = row.deck_id as string | undefined;
    const name = (row.name as string | undefined)?.trim();
    if (!deckId || !name) continue;
    if (!into.has(name)) into.set(name, new Set());
    into.get(name)!.add(deckId);
  }
}

export function mapToDeckCounts(m: Map<string, Set<string>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, set] of m) {
    out[name] = set.size;
  }
  return out;
}

export type TrendingCardRow = { name: string; count: number };

/**
 * trend_score = (recent_count / recent_total) - (prev_count / prev_total)
 * Filters: min recent decks, denylist, max global inclusion, not land.
 */
export function computeTrendingCardsList(params: {
  recentCounts: Record<string, number>;
  prevCounts: Record<string, number>;
  globalCounts: Record<string, number>;
  recentTotalDecks: number;
  prevTotalDecks: number;
  globalTotalDecks: number;
  landNamesLower: Set<string>;
}): TrendingCardRow[] {
  const {
    recentCounts,
    prevCounts,
    globalCounts,
    recentTotalDecks,
    prevTotalDecks,
    globalTotalDecks,
    landNamesLower,
  } = params;

  if (recentTotalDecks <= 0) return [];
  if (globalTotalDecks <= 0) return [];

  const rt = recentTotalDecks;
  const gt = globalTotalDecks;

  type Scored = { name: string; count: number; score: number };
  const scored: Scored[] = [];

  for (const [name, recentCount] of Object.entries(recentCounts)) {
    if (recentCount < TRENDING_CARDS_MIN_RECENT_DECKS) continue;
    if (isStapleDenied(name)) continue;

    const g = globalCounts[name] ?? 0;
    if (g / gt > TRENDING_CARDS_MAX_INCLUSION) continue;

    const key = normalizeCardKey(name);
    if (landNamesLower.has(key)) continue;

    const prevCount = prevCounts[name] ?? 0;
    const recentShare = recentCount / rt;
    const prevShare = prevTotalDecks > 0 ? prevCount / prevTotalDecks : 0;
    const score = recentShare - prevShare;

    scored.push({ name, count: recentCount, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.count - a.count;
  });

  return scored.slice(0, TRENDING_CARDS_OUTPUT_LIMIT).map(({ name, count }) => ({ name, count }));
}
