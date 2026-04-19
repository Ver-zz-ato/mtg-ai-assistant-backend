/**
 * Persist meta-signals run summaries to meta_signals_job_run_log (admin history).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetaSignalsJobDetail } from "./metaSignalsJobStatus";

export const META_SIGNALS_RUN_LOG_RETENTION = 15;

export function computeChangedSectionsCount(detail: MetaSignalsJobDetail): number {
  const s = detail.sectionSummaries;
  if (!s) return 0;
  return Object.values(s).filter((x) => x.changed).length;
}

export function buildCompactRunSummaryLine(detail: MetaSignalsJobDetail): string {
  const rr = detail.runResult ?? (detail.ok ? "success" : "failed");
  const pill = detail.pillMode;
  const changed = computeChangedSectionsCount(detail);
  const dh = detail.dailyHistory;
  const daily =
    (dh?.commanderRowsUpserted ?? 0) + (dh?.cardRowsUpserted ?? 0);
  const wc = detail.warnings?.length ?? 0;
  const when = detail.finishedAt
    ? new Date(detail.finishedAt).toISOString().replace("T", " ").slice(0, 19) + " UTC"
    : "—";
  return `${when} · ${rr} · ${pill} · ${changed} sections changed · ${daily} daily rows · ${wc} warnings`;
}

export async function persistMetaSignalsRunLog(
  admin: SupabaseClient,
  detail: MetaSignalsJobDetail
): Promise<void> {
  try {
    const started = detail.attemptStartedAt ? new Date(detail.attemptStartedAt).getTime() : NaN;
    const ended = detail.finishedAt ? new Date(detail.finishedAt).getTime() : NaN;
    const durationMs =
      Number.isFinite(started) && Number.isFinite(ended) ? Math.max(0, Math.round(ended - started)) : 0;

    const rr = detail.runResult ?? (detail.ok ? "success" : "failed");
    const compact = buildCompactRunSummaryLine(detail);

    const { error: insErr } = await admin.from("meta_signals_job_run_log").insert({
      started_at: detail.attemptStartedAt ?? detail.finishedAt,
      finished_at: detail.finishedAt,
      duration_ms: durationMs,
      run_result: rr,
      ok: detail.ok,
      snapshot_date: detail.snapshotDate,
      pill_mode: detail.pillMode,
      summary_json: detail as unknown as Record<string, unknown>,
      compact_summary: compact,
    });
    if (insErr) {
      console.warn("[meta-signals] run log insert:", insErr.message);
      return;
    }

    const { data: rows, error: selErr } = await admin
      .from("meta_signals_job_run_log")
      .select("id")
      .order("finished_at", { ascending: false });
    if (selErr || !rows?.length) return;
    if (rows.length <= META_SIGNALS_RUN_LOG_RETENTION) return;
    const toDelete = rows.slice(META_SIGNALS_RUN_LOG_RETENTION).map((r) => (r as { id: string }).id);
    if (toDelete.length === 0) return;
    await admin.from("meta_signals_job_run_log").delete().in("id", toDelete);
  } catch (e) {
    console.warn("[meta-signals] run log:", e);
  }
}

export type MetaSignalsRunLogRow = {
  id: string;
  started_at: string;
  finished_at: string;
  duration_ms: number | null;
  run_result: string;
  ok: boolean;
  snapshot_date: string | null;
  pill_mode: string | null;
  compact_summary: string;
  summary_json: MetaSignalsJobDetail;
};
