#!/usr/bin/env tsx
/**
 * Run daily ops report for the last 24h (same as cron) and print Discord preview.
 *
 * Usage: npx tsx scripts/run-daily-ops-test.ts
 */
import * as fs from "fs";
import * as path from "path";
import { config } from "dotenv";

for (const p of [path.join(process.cwd(), ".env.local"), ".env.local"]) {
  if (fs.existsSync(p)) {
    config({ path: p });
    break;
  }
}

import { runOpsReport } from "@/lib/ops/run-ops-report";
import { buildCompactDailyOpsLines } from "@/lib/ops/discord";

async function main() {
  console.log("Running daily_ops for last 24h...\n");
  const result = await runOpsReport("daily_ops");
  const digest = (result.details as Record<string, unknown> | undefined)?.daily_digest as
    | Record<string, unknown>
    | undefined;

  console.log("Status:", result.status);
  console.log("Summary:", result.summary);
  console.log("Report ID:", result.report_id ?? "(none)");
  console.log("Duration ms:", result.duration_ms);

  if (digest) {
    const website = digest.website as Record<string, unknown> | undefined;
    const analytics = website?.analytics as Record<string, unknown> | undefined;
    if (analytics) {
      console.log("\nWebsite traffic (fixed pageview query):");
      console.log("  first_visits:", analytics.first_visits_24h);
      console.log("  pageviews (total):", analytics.pageviews_24h);
      console.log("  pageviews_server:", analytics.pageviews_server_24h);
      console.log("  pageviews_client:", analytics.pageviews_client_24h);
    }

    console.log("\n--- Discord message ---\n");
    console.log(
      buildCompactDailyOpsLines(digest, result.status, {
        staleJobs: ((result.details as Record<string, unknown>)?.job_health as { stale_jobs?: string[] } | undefined)
          ?.stale_jobs,
      }).join("\n"),
    );
    console.log("\n(Posted to Discord if webhook env is set.)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
