/**
 * Shared operational detail for admin cron / bulk jobs (app_config + admin_job_run_log).
 */

export type AdminJobHealth = "healthy" | "stale" | "degraded" | "failed" | "partial";

export type AdminJobRunResult = "success" | "partial" | "failed" | "delegated";

/** Canonical ids used in APIs and app_config keys */
export const ADMIN_JOB_IDS = [
  "deck-costs",
  "commander-aggregates",
  "top-cards",
  "bulk_scryfall",
  "bulk_price_import",
  "price_snapshot_bulk",
  "budget-swaps-update",
  "daily_ops_report",
  "weekly_ops_report",
  "card-tag-refresh",
  "card-tag-backfill",
] as const;

export type AdminJobId = (typeof ADMIN_JOB_IDS)[number];

export interface AdminJobDetail {
  jobId: string;
  attemptStartedAt?: string;
  finishedAt: string;
  ok: boolean;
  runResult?: AdminJobRunResult;
  /** One-line for cards / log rows */
  compactLine: string;
  destination?: string;
  source?: string;
  durationMs?: number;
  counts?: Record<string, number | undefined>;
  labels?: Record<string, string | undefined>;
  warnings?: string[];
  lastError?: string;
  notes?: string;
  extra?: Record<string, unknown>;
}

export type AdminJobRunLogRow = {
  id: string;
  job_name: string;
  started_at: string;
  finished_at: string;
  duration_ms: number | null;
  ok: boolean;
  run_result: string | null;
  compact_summary: string;
  summary_json: AdminJobDetail;
};

/** app_config key for JSON detail */
export function adminJobDetailKey(jobId: string): string {
  return `job:${jobId}:detail`;
}

/** app_config key for last attempt timestamp (any outcome) */
export function adminJobAttemptKey(jobId: string): string {
  return `job:${jobId}:attempt`;
}

/** Maps canonical job id → existing job:last:* key */
export function adminJobLastSuccessKey(jobId: string): string | null {
  const m: Record<string, string> = {
    "deck-costs": "job:last:deck-costs",
    "commander-aggregates": "job:last:commander-aggregates",
    "top-cards": "job:last:top-cards",
    bulk_scryfall: "job:last:bulk_scryfall",
    bulk_price_import: "job:last:bulk_price_import",
    price_snapshot_bulk: "job:last:price_snapshot_bulk",
    "budget-swaps-update": "job:last:budget-swaps-update",
    "card-tag-refresh": "job:last:card-tag-refresh",
    "card-tag-backfill": "job:last:card-tag-backfill",
  };
  return m[jobId] ?? null;
}

/** Expected stale window (hours) for healthy / stale heuristic */
export function adminJobStaleHours(jobId: string): number {
  const m: Record<string, number> = {
    "deck-costs": 36,
    "commander-aggregates": 36,
    "top-cards": 36,
    "meta-signals": 36,
    bulk_scryfall: 24 * 7,
    bulk_price_import: 36,
    price_snapshot_bulk: 36,
    "budget-swaps-update": 24 * 7,
    "card-tag-refresh": 36,
    "card-tag-backfill": 24 * 7,
    daily_ops_report: 36,
    weekly_ops_report: 24 * 7,
  };
  return m[jobId] ?? 48;
}

export function parseAdminJobDetail(raw: string | null | undefined): AdminJobDetail | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const j = JSON.parse(raw) as AdminJobDetail;
    if (!j || typeof j !== "object" || typeof j.finishedAt !== "string") return null;
    if (typeof j.compactLine !== "string") j.compactLine = j.finishedAt;
    return j;
  } catch {
    return null;
  }
}

export function computeAdminJobHealth(
  jobId: string,
  detail: AdminJobDetail | null,
  lastSuccessIso: string | null
): AdminJobHealth {
  if (detail && !detail.ok) return "failed";
  if (detail?.runResult === "partial") return "partial";
  if (detail?.runResult === "failed") return "failed";
  const warnN = detail?.warnings?.length ?? 0;
  if (warnN > 5) return "degraded";

  const success = lastSuccessIso || (detail?.ok ? detail.finishedAt : null);
  if (!success) return "degraded";

  const ageH = (Date.now() - new Date(success).getTime()) / 3600000;
  if (ageH > adminJobStaleHours(jobId)) return "stale";

  if (warnN > 0) return "degraded";
  return "healthy";
}
