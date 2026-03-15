#!/usr/bin/env tsx
/**
 * One-off: copy current meta_signals into meta_signals_history for today.
 * Usage: npx tsx scripts/data-moat/backfill-meta-history.ts
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
  const { snapshotMetaSignals } = await import("@/lib/data-moat/snapshot-meta-signals");
  const ok = await snapshotMetaSignals();
  console.log(ok ? "OK: meta_signals_history backfilled for today." : "Failed.");
  process.exit(ok ? 0 : 1);
}

main();
