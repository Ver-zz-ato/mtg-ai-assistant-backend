/**
 * Serialized into app_config key `job:meta-signals:detail` (JSON string) after each cron run.
 */

export type MetaSignalsPillMode = "global" | "manatap" | "blended";

export type MetaSignalsJobDetail = {
  ok: boolean;
  finishedAt: string;
  attemptStartedAt?: string;
  pillMode: MetaSignalsPillMode;
  snapshotDate: string;
  /** True when any meta_signals row was preserved from prior run due to empty new compute */
  fallbackUsed: boolean;
  sectionCounts: Record<string, number>;
  sources: { scryfallCommanders: number; scryfallCards: number; scryfallBudget: number; recentSetCommanders: number };
  warnings: string[];
  lastError?: string;
  /** True when meta_commander_daily had yesterday rows for momentum */
  yesterdayRanksAvailable: boolean;
};

export function parseMetaSignalsJobDetail(raw: string | null | undefined): MetaSignalsJobDetail | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as MetaSignalsJobDetail;
  } catch {
    return null;
  }
}
