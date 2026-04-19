/**
 * Historical rollups from meta_commander_daily / meta_card_daily (admin analytics).
 * Does not affect live Discover — read-only aggregates.
 */

export const ROLLUP_SOURCE = "scryfall";
export const ROLLUP_TW_COMMANDER = "edhrec_popular";
/** Popular-window card rows (matches primary global card list in cron). */
export const ROLLUP_TW_CARD_POPULAR = "edhrec_popular";

export type RawEntityDay = {
  snapshot_date: string;
  name: string;
  name_norm: string;
  rank: number | null;
};

export type LeaderRow = {
  name: string;
  nameNorm: string;
  daysSeen: number;
  avgRank: number;
  latestRank: number | null;
  firstRankInWindow: number | null;
  lastRankInWindow: number | null;
  /** first_rank - last_rank in window (positive = improved toward rank 1) */
  deltaFirstToLatest: number | null;
  /** % of days seen where rank ≤ 24 */
  persistenceTop24Pct: number;
  /** % of days seen where rank ≤ 50 */
  persistenceTop50Pct: number;
  /** Sum over days of max(0, 101 - rank); higher = more dominant */
  dominanceScore: number;
};

export type MoverRow = LeaderRow & {
  /** first_rank - last_rank; positive = improved (toward #1) */
  rankImprovement: number;
};

function toDateKey(d: string): number {
  return new Date(d + "T12:00:00.000Z").getTime();
}

function aggregateEntityDays(
  rows: RawEntityDay[],
  windowStart: string,
  windowEnd: string
): Map<string, { displayName: string; nameNorm: string; byDate: Map<string, number> }> {
  const acc = new Map<string, { displayName: string; nameNorm: string; byDate: Map<string, number> }>();
  const ws = toDateKey(windowStart);
  const we = toDateKey(windowEnd);
  for (const r of rows) {
    if (r.rank == null || r.rank <= 0) continue;
    const t = toDateKey(r.snapshot_date);
    if (t < ws || t > we) continue;
    const k = r.name_norm;
    if (!acc.has(k)) {
      acc.set(k, { displayName: r.name, nameNorm: k, byDate: new Map() });
    }
    const bucket = acc.get(k)!;
    bucket.displayName = r.name;
    bucket.byDate.set(r.snapshot_date, r.rank);
  }
  return acc;
}

function leaderFromBucket(
  displayName: string,
  nameNorm: string,
  byDate: Map<string, number>
): LeaderRow | null {
  if (byDate.size === 0) return null;
  const dates = [...byDate.keys()].sort((a, b) => toDateKey(a) - toDateKey(b));
  const ranks = dates.map((d) => byDate.get(d)!);
  const sum = ranks.reduce((a, b) => a + b, 0);
  const avgRank = sum / ranks.length;
  const firstRankInWindow = ranks[0] ?? null;
  const lastRankInWindow = ranks[ranks.length - 1] ?? null;
  const latestRank = lastRankInWindow;
  let top24 = 0;
  let top50 = 0;
  let dominanceScore = 0;
  for (const rk of ranks) {
    if (rk <= 24) top24++;
    if (rk <= 50) top50++;
    dominanceScore += Math.max(0, 101 - rk);
  }
  const daysSeen = ranks.length;
  const persistenceTop24Pct = (top24 / daysSeen) * 100;
  const persistenceTop50Pct = (top50 / daysSeen) * 100;
  const deltaFirstToLatest =
    firstRankInWindow != null && lastRankInWindow != null
      ? firstRankInWindow - lastRankInWindow
      : null;

  return {
    name: displayName,
    nameNorm,
    daysSeen,
    avgRank: Math.round(avgRank * 100) / 100,
    latestRank,
    firstRankInWindow,
    lastRankInWindow,
    deltaFirstToLatest,
    persistenceTop24Pct: Math.round(persistenceTop24Pct * 10) / 10,
    persistenceTop50Pct: Math.round(persistenceTop50Pct * 10) / 10,
    dominanceScore: Math.round(dominanceScore * 100) / 100,
  };
}

/** Dominant entities: lower avg rank, more days, higher dominance score. */
export function computeLeaderboard(
  rows: RawEntityDay[],
  windowStart: string,
  windowEnd: string,
  limit = 24
): LeaderRow[] {
  const grouped = aggregateEntityDays(rows, windowStart, windowEnd);
  const leaders: LeaderRow[] = [];
  for (const [, v] of grouped) {
    const L = leaderFromBucket(v.displayName, v.nameNorm, v.byDate);
    if (L) leaders.push(L);
  }
  leaders.sort((a, b) => {
    if (a.avgRank !== b.avgRank) return a.avgRank - b.avgRank;
    if (b.daysSeen !== a.daysSeen) return b.daysSeen - a.daysSeen;
    return b.dominanceScore - a.dominanceScore;
  });
  return leaders.slice(0, limit);
}

export function computeMovers(
  rows: RawEntityDay[],
  windowStart: string,
  windowEnd: string,
  topN = 12
): { risers: MoverRow[]; fallers: MoverRow[] } {
  const grouped = aggregateEntityDays(rows, windowStart, windowEnd);
  const movers: MoverRow[] = [];
  for (const [, v] of grouped) {
    const L = leaderFromBucket(v.displayName, v.nameNorm, v.byDate);
    if (!L || L.daysSeen < 2 || L.deltaFirstToLatest == null) continue;
    movers.push({
      ...L,
      rankImprovement: L.deltaFirstToLatest,
    });
  }
  const risers = [...movers]
    .filter((m) => m.rankImprovement > 0)
    .sort((a, b) => b.rankImprovement - a.rankImprovement)
    .slice(0, topN);
  const fallers = [...movers]
    .filter((m) => m.rankImprovement < 0)
    .sort((a, b) => a.rankImprovement - b.rankImprovement)
    .slice(0, topN);
  return { risers, fallers };
}

export function dateRangeUtcDays(endExclusive: Date, days: number): { start: string; end: string } {
  const end = new Date(endExclusive);
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}
