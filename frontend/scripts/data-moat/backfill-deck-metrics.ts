#!/usr/bin/env tsx
/**
 * One-off: read deck_context_summary and insert one deck_metrics_snapshot per deck for today.
 * Usage: npx tsx scripts/data-moat/backfill-deck-metrics.ts
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

  const today = new Date().toISOString().slice(0, 10);
  const { data: rows, error: selectErr } = await admin
    .from("deck_context_summary")
    .select("deck_id, deck_hash, summary_json");

  if (selectErr || !rows?.length) {
    console.error(selectErr?.message ?? "No rows from deck_context_summary");
    process.exit(1);
  }

  const { snapshotDeckMetricsForDeck } = await import("@/lib/data-moat/snapshot-deck-metrics");
  let ok = 0;
  for (const r of rows) {
    const summary = (r as { summary_json?: Record<string, unknown> }).summary_json;
    if (summary && r.deck_id) {
          const success = await snapshotDeckMetricsForDeck(r.deck_id, summary as Record<string, unknown>);
          if (success) ok++;
    }
  }
  console.log(`OK: ${ok}/${rows.length} deck_metrics_snapshot rows for ${today}.`);
  process.exit(0);
}

main();
