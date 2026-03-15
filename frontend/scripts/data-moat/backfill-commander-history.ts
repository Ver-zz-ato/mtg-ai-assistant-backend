#!/usr/bin/env tsx
/**
 * One-off: copy current commander_aggregates into commander_aggregates_history for today.
 * Usage: npx tsx scripts/data-moat/backfill-commander-history.ts
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import * as fs from "fs";
import * as path from "path";

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

async function main() {
  const { getAdmin } = await import("@/app/api/_lib/supa");
  const admin = getAdmin();
  if (!admin) {
    console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const { snapshotCommanderAggregates } = await import("@/lib/data-moat/snapshot-commander-aggregates");
  const ok = await snapshotCommanderAggregates();
  console.log(ok ? "OK: commander_aggregates_history backfilled for today." : "Failed.");
  process.exit(ok ? 0 : 1);
}

main();
