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
import { isAppAiUsageRow } from "@/lib/ai/manatap-client-origin";
import { posthogHogql } from "@/lib/server/posthog-hogql";

async function main() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const admin = getAdmin();
  if (!admin) throw new Error("no admin");

  const ai = await admin
    .from("ai_usage")
    .select("source,source_page,route,model")
    .gte("created_at", since)
    .limit(5000);
  const appRows = (ai.data || []).filter((r) => isAppAiUsageRow(r));
  const billable = appRows.filter((r) => r.model && String(r.model).toLowerCase() !== "none");

  console.log("ai_usage rows 24h total:", ai.data?.length || 0);
  console.log("ai_usage app-attributed:", appRows.length);
  console.log("ai_usage app billable:", billable.length);
  if (billable.length) {
    console.log("app routes:", [...new Set(billable.map((r) => r.route))].join(", "));
  }

  const heavy = await posthogHogql(`
    SELECT
      properties.$app_version AS ver,
      properties.$device_type AS device,
      properties.$os AS os,
      count() AS n
    FROM events
    WHERE timestamp >= now() - INTERVAL 24 HOUR
      AND (
        properties.$lib = 'posthog-react-native'
        OR properties.app_surface = 'mobile_app'
      )
    GROUP BY ver, device, os
    ORDER BY n DESC
    LIMIT 8
  `);
  console.log("\nApp events by version/device/os:");
  for (const row of heavy.results) {
    console.log(`  ${row[0] ?? "?"} | ${row[1] ?? "?"} | ${row[2] ?? "?"} | ${row[3]} events`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
