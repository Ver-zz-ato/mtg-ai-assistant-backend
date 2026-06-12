#!/usr/bin/env tsx
import * as fs from "fs";
import * as path from "path";
import { config } from "dotenv";

for (const p of [path.join(process.cwd(), ".env.local"), ".env.local"]) {
  if (fs.existsSync(p)) {
    config({ path: p });
    break;
  }
}

import { getAdmin } from "@/app/api/_lib/supa";
import {
  adminJobDetailKey,
  adminJobAttemptKey,
  computeAdminJobHealth,
  jobLastSuccessConfigKey,
  parseAdminJobDetail,
  adminJobStaleHours,
} from "@/lib/admin/adminJobDetail";

function ageHours(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.round((ms / 3600000) * 10) / 10;
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toISOString();
}

async function main() {
  const db = getAdmin();
  if (!db) throw new Error("no supabase admin");

  const jobId = "bulk_price_import";
  const keys = [
    jobLastSuccessConfigKey(jobId),
    adminJobDetailKey(jobId),
    adminJobAttemptKey(jobId),
    "job:last:price_snapshot_bulk",
    "job:last:deck-costs",
  ];

  const { data, error } = await db.from("app_config").select("key,value,updated_at").in("key", keys);
  if (error) throw error;

  const map = new Map((data || []).map((r) => [r.key, r]));
  const lastSuccess = String(map.get(jobLastSuccessConfigKey(jobId))?.value || "") || null;
  const attempt = String(map.get(adminJobAttemptKey(jobId))?.value || "") || null;
  const detailRaw = map.get(adminJobDetailKey(jobId))?.value;
  const detail = parseAdminJobDetail(typeof detailRaw === "string" ? detailRaw : null);
  const health = computeAdminJobHealth(jobId, detail, lastSuccess);
  const staleH = adminJobStaleHours(jobId);

  console.log("\n=== bulk_price_import audit ===\n");
  console.log("job:last:bulk_price_import:", fmt(lastSuccess), lastSuccess ? `(${ageHours(lastSuccess)}h ago)` : "");
  console.log("job:bulk_price_import:attempt:", fmt(attempt), attempt ? `(${ageHours(attempt)}h ago)` : "");
  console.log("app_config row updated_at (last success key):", map.get(jobLastSuccessConfigKey(jobId))?.updated_at ?? "—");
  console.log("Stale threshold:", staleH, "hours");
  console.log("Computed health:", health);
  if (detail) {
    console.log("\nDetail JSON:");
    console.log("  finishedAt:", detail.finishedAt, `(${ageHours(detail.finishedAt)}h ago)`);
    console.log("  ok:", detail.ok, "runResult:", detail.runResult ?? "—");
    console.log("  compactLine:", detail.compactLine);
    if (detail.lastError) console.log("  lastError:", detail.lastError);
    if (detail.warnings?.length) console.log("  warnings:", detail.warnings.slice(0, 3));
  } else {
    console.log("\nNo job:bulk_price_import:detail saved.");
  }

  console.log("\n--- Related tier-1 jobs ---");
  for (const k of ["job:last:price_snapshot_bulk", "job:last:deck-costs"]) {
    const v = String(map.get(k)?.value || "") || null;
    console.log(`${k}:`, fmt(v), v ? `(${ageHours(v)}h ago)` : "");
  }

  const { data: logs } = await db
    .from("admin_job_run_log")
    .select("started_at,finished_at,ok,run_result,compact_summary")
    .eq("job_name", jobId)
    .order("finished_at", { ascending: false })
    .limit(5);
  console.log("\n--- Last 5 admin_job_run_log rows ---");
  for (const row of logs || []) {
    console.log(
      `  ${row.finished_at} ok=${row.ok} result=${row.run_result ?? "—"} | ${String(row.compact_summary || "").slice(0, 80)}`,
    );
  }

  const now = new Date();
  console.log("\nServer now (UTC):", now.toISOString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
