import type { SupabaseClient } from "@supabase/supabase-js";
import { adminJobDetailKey } from "@/lib/admin/adminJobDetail";
import { markAdminJobAttempt, persistAdminJobRun } from "@/lib/admin/adminJobRunLog";
import {
  CARD_TAG_RULE_SOURCE,
  CARD_TAG_RULE_VERSION,
  deriveCardTagCacheRow,
  fetchScryfallTagSourceRows,
  retagCardsByNames,
  upsertCardTagCacheRows,
} from "@/lib/recommendations/commander-recommender";

export const CARD_TAG_REFRESH_JOB_ID = "card-tag-refresh";
export const CARD_TAG_BACKFILL_JOB_ID = "card-tag-backfill";
const BATCH_SIZE = 500;

export type CardTagRefreshSummary = {
  ok: boolean;
  scanned: number;
  tagged: number;
  updated: number;
  skipped: number;
  failed: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
};

async function writeJobStatus(
  admin: SupabaseClient,
  jobId: string,
  summary: CardTagRefreshSummary,
  runResult: "success" | "partial" | "failed",
): Promise<void> {
  const detail = {
    jobId,
    ok: summary.ok,
    attemptStartedAt: summary.startedAt,
    finishedAt: summary.finishedAt,
    durationMs: summary.durationMs,
    runResult,
    compactLine: `${summary.updated} updated, ${summary.failed} failed`,
    counts: {
      scanned: summary.scanned,
      tagged: summary.tagged,
      updated: summary.updated,
      skipped: summary.skipped,
      failed: summary.failed,
    },
    labels: {
      tagVersion: String(CARD_TAG_RULE_VERSION),
      source: CARD_TAG_RULE_SOURCE,
    },
  };

  await admin.from("app_config").upsert(
    { key: `job:last:${jobId}`, value: summary.finishedAt },
    { onConflict: "key" },
  );
  await admin.from("app_config").upsert(
    { key: adminJobDetailKey(jobId), value: JSON.stringify(detail) },
    { onConflict: "key" },
  );
  await persistAdminJobRun(admin, jobId, detail);
}

export async function runCardTagRefresh(
  admin: SupabaseClient,
  options?: { names?: string[]; jobId?: string },
): Promise<CardTagRefreshSummary> {
  const jobId = options?.jobId ?? CARD_TAG_REFRESH_JOB_ID;
  const startedAt = new Date().toISOString();
  await markAdminJobAttempt(admin, jobId);

  let scanned = 0;
  let tagged = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  try {
    if (options?.names?.length) {
      const uniqNames = Array.from(new Set(options.names.filter(Boolean)));
      scanned = uniqNames.length;
      tagged = uniqNames.length;
      updated = await retagCardsByNames(admin, uniqNames);
    } else {
      let after: string | null = null;
      while (true) {
        const rows = await fetchScryfallTagSourceRows(admin, { fromNameExclusive: after, limit: BATCH_SIZE });
        if (!rows.length) break;
        scanned += rows.length;
        const derived = rows.map((row) => deriveCardTagCacheRow(row));
        tagged += derived.length;
        updated += await upsertCardTagCacheRows(admin, derived);
        after = rows[rows.length - 1]?.name ?? null;
        if (rows.length < BATCH_SIZE) break;
      }
    }
  } catch (error) {
    failed += 1;
    const finishedAt = new Date().toISOString();
    const summary: CardTagRefreshSummary = {
      ok: false,
      scanned,
      tagged,
      updated,
      skipped,
      failed,
      startedAt,
      finishedAt,
      durationMs: Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()),
    };
    await writeJobStatus(admin, jobId, summary, "failed");
    throw error;
  }

  const finishedAt = new Date().toISOString();
  const summary: CardTagRefreshSummary = {
    ok: failed === 0,
    scanned,
    tagged,
    updated,
    skipped,
    failed,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()),
  };
  await writeJobStatus(admin, jobId, summary, failed > 0 ? "partial" : "success");
  return summary;
}
