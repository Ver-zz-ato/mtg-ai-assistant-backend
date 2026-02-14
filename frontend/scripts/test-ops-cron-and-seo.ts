#!/usr/bin/env tsx
/**
 * Sanity checks: cron auth + seo_queries schema.
 *
 * Usage:
 *   npx tsx scripts/test-ops-cron-and-seo.ts [baseUrl]
 *
 * Env (from .env.local): CRON_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import * as path from "path";
import * as fs from "fs";
import { config } from "dotenv";

for (const p of [path.join(process.cwd(), ".env.local"), ".env.local"]) {
  if (fs.existsSync(p)) {
    config({ path: p });
    break;
  }
}

const BASE = process.argv[2] || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET || process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || "";

async function testCronAuth() {
  console.log("\n--- Cron auth ---");
  console.log("Base URL:", BASE);

  // 1. Without secret → expect 401
  const noSecret = await fetch(`${BASE}/api/cron/ops-report/weekly`, { method: "GET" });
  const noSecretOk = noSecret.status === 401;
  console.log(noSecretOk ? "✓" : "✗", "No secret →", noSecret.status, noSecretOk ? "(expected 401)" : "");

  // 2. With secret → expect 200
  if (!CRON_SECRET) {
    console.log("⊘ CRON_SECRET not set — skipping auth-with-secret test");
  } else {
    const withSecret = await fetch(`${BASE}/api/cron/ops-report/weekly`, {
      method: "GET",
      headers: { "x-cron-key": CRON_SECRET },
    });
    const body = await withSecret.json().catch(() => ({}));
    const withSecretOk = withSecret.status === 200 && body?.ok !== false;
    console.log(withSecretOk ? "✓" : "✗", "With secret →", withSecret.status, withSecretOk ? "(expected 200)" : "", body?.report_id ? `report_id=${body.report_id}` : "");
  }
}

async function checkSeoQueries() {
  console.log("\n--- seo_queries ---");

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("⊘ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping seo_queries check");
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, key);

  const { data: rows, error } = await admin
    .from("seo_queries")
    .select("query, impressions, date_start, date_end, created_at")
    .limit(5);

  if (error) {
    console.log("✗ Error:", error.message);
    return;
  }

  const { count } = await admin.from("seo_queries").select("id", { count: "exact", head: true });
  console.log("Total rows:", count ?? "?");
  console.log("Sample (first 5):");
  for (const r of rows || []) {
    console.log("  ", r.query?.slice(0, 40), "| impressions:", r.impressions, "| date_end:", r.date_end ?? "null");
  }

  const withDateEnd = await admin.from("seo_queries").select("id").not("date_end", "is", null).limit(1);
  const hasDateEnd = (withDateEnd.data?.length ?? 0) > 0;
  console.log(hasDateEnd ? "✓" : "⊘", "date_end populated:", hasDateEnd ? "yes" : "no (legacy or empty)");
}

async function main() {
  console.log("Ops cron + seo_queries sanity checks");
  await testCronAuth();
  await checkSeoQueries();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
