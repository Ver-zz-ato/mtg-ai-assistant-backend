/**
 * Serialized into app_config key `job:meta-signals:detail` (JSON string) after each cron run.
 */

export type MetaSignalsPillMode = "global" | "manatap" | "blended";

/** Highest-level outcome for admin messaging */
export type MetaSignalsRunResult = "success" | "partial" | "fallback" | "failed";

export type MetaSignalsMoverEntry = { name: string; label: string };

export type MetaSignalsSectionEntry = {
  rowCount: number;
  priorCount: number;
  changed: boolean;
  note?: string;
};

export type MetaSignalsJobDetail = {
  ok: boolean;
  finishedAt: string;
  attemptStartedAt?: string;
  /** Derived for admin UI */
  runResult?: MetaSignalsRunResult;
  pillMode: MetaSignalsPillMode;
  snapshotDate: string;
  /** True when any section reused prior meta_signals snapshot because computed output was empty */
  fallbackUsed: boolean;
  /** Sections that took data from the previous meta_signals row */
  priorSnapshotUsedFor?: string[];
  sectionCounts: Record<string, number>;
  /** Per-section diff vs prior snapshot */
  sectionSummaries?: Record<string, MetaSignalsSectionEntry>;
  sources: {
    scryfallCommanders: number;
    scryfallCards: number;
    scryfallBudget: number;
    recentSetCommanders: number;
  };
  /** Short human-readable source line for admin */
  sourcesLine?: string;
  warnings: string[];
  lastError?: string;
  /** True when meta_commander_daily had yesterday rows for momentum */
  yesterdayRanksAvailable: boolean;
  /** Rows upserted into daily history (0 if fetch empty or upsert failed) */
  dailyHistory?: {
    commanderRowsUpserted: number;
    cardRowsUpserted: number;
    snapshotDate: string;
    yesterdayRanksAvailable: boolean;
  };
  /** Trending-commanders name diff vs prior run */
  trendingDiff?: {
    additions: string[];
    removals: string[];
    movers: MetaSignalsMoverEntry[];
  };
  /** One-line + multi-line for alerts */
  humanLine?: string;
  humanDetail?: string;
  /** Wall-clock duration of the run */
  durationMs?: number;
  /** Sections where output differed from prior meta_signals snapshot */
  changedSectionsCount?: number;
  /** Successful meta_signals upsert operations this run */
  metaSignalsUpserts?: number;
  /** Discover “new-set-breakouts” — date eligibility + pool sizes (admin QA) */
  newSetBreakoutsDebug?: {
    eligibilityDays: number;
    cutoffIso: string;
    rawCandidates: number;
    distinctSetCodes: number;
    finalRows: number;
  };
};

export function parseMetaSignalsJobDetail(raw: string | null | undefined): MetaSignalsJobDetail | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as MetaSignalsJobDetail;
  } catch {
    return null;
  }
}
