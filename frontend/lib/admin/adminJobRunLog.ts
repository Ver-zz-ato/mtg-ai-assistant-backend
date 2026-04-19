/**
 * Persist admin job run summaries to app_config + admin_job_run_log.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminJobAttemptKey,
  adminJobDetailKey,
  adminJobLastSuccessKey,
  type AdminJobDetail,
} from "./adminJobDetail";

export const ADMIN_JOB_RUN_LOG_RETENTION = 12;

export async function markAdminJobAttempt(admin: SupabaseClient, jobId: string): Promise<void> {
  try {
    await admin.from("app_config").upsert(
      { key: adminJobAttemptKey(jobId), value: new Date().toISOString() },
      { onConflict: "key" }
    );
  } catch (e) {
    console.warn(`[admin-job] attempt mark ${jobId}:`, e);
  }
}

function runResultFromDetail(d: AdminJobDetail): string {
  return d.runResult ?? (d.ok ? "success" : "failed");
}

export async function persistAdminJobRun(
  admin: SupabaseClient,
  jobId: string,
  detail: AdminJobDetail,
  options?: { updateLastSuccess?: boolean }
): Promise<void> {
  const updateLastSuccess = options?.updateLastSuccess !== false;

  const json = JSON.stringify({ ...detail, jobId });
  try {
    await admin.from("app_config").upsert(
      { key: adminJobDetailKey(jobId), value: json },
      { onConflict: "key" }
    );
  } catch (e) {
    console.warn(`[admin-job] detail upsert ${jobId}:`, e);
  }

  const lastKey = adminJobLastSuccessKey(jobId);
  if (updateLastSuccess && lastKey && detail.ok && detail.runResult !== "failed") {
    try {
      await admin.from("app_config").upsert(
        { key: lastKey, value: detail.finishedAt },
        { onConflict: "key" }
      );
    } catch (e) {
      console.warn(`[admin-job] last success ${jobId}:`, e);
    }
  }

  const started = detail.attemptStartedAt ? new Date(detail.attemptStartedAt).getTime() : NaN;
  const ended = detail.finishedAt ? new Date(detail.finishedAt).getTime() : NaN;
  const durationMs =
    typeof detail.durationMs === "number"
      ? detail.durationMs
      : Number.isFinite(started) && Number.isFinite(ended)
        ? Math.max(0, Math.round(ended - started))
        : null;

  try {
    const { error: insErr } = await admin.from("admin_job_run_log").insert({
      job_name: jobId,
      started_at: detail.attemptStartedAt ?? detail.finishedAt,
      finished_at: detail.finishedAt,
      duration_ms: durationMs,
      run_result: runResultFromDetail(detail),
      ok: detail.ok,
      compact_summary: detail.compactLine,
      summary_json: detail as unknown as Record<string, unknown>,
    });
    if (insErr) {
      console.warn(`[admin-job] run log insert ${jobId}:`, insErr.message);
      return;
    }

    const { data: rows, error: selErr } = await admin
      .from("admin_job_run_log")
      .select("id")
      .eq("job_name", jobId)
      .order("finished_at", { ascending: false });
    if (selErr || !rows?.length) return;
    if (rows.length <= ADMIN_JOB_RUN_LOG_RETENTION) return;
    const toDelete = rows.slice(ADMIN_JOB_RUN_LOG_RETENTION).map((r) => (r as { id: string }).id);
    if (toDelete.length === 0) return;
    await admin.from("admin_job_run_log").delete().in("id", toDelete);
  } catch (e) {
    console.warn(`[admin-job] run log ${jobId}:`, e);
  }
}
