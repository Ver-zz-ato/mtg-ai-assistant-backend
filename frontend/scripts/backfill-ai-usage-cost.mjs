#!/usr/bin/env node
/**
 * One-time backfill: recompute cost_usd_corrected for legacy ai_usage rows.
 * Rows with pricing_version < 2026-02-14 (or null) get cost recomputed from tokens/model.
 * Original cost_usd is NOT overwritten (kept for audit).
 *
 * Run: node scripts/backfill-ai-usage-cost.mjs [--dry-run] [--limit N] [--days D]
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, "..");
for (const envPath of [
  path.join(projectRoot, ".env.local"),
  path.join(__dirname, "../.env.local"),
  ".env.local",
]) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

const LEGACY_PRICING_CUTOFF = "2026-02-14";

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
let limit = 10000;
let days = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--limit" && argv[i + 1]) {
    limit = Math.max(1, parseInt(argv[i + 1], 10) || 10000);
    i++;
  } else if (argv[i] === "--days" && argv[i + 1]) {
    days = Math.max(1, Math.min(365, parseInt(argv[i + 1], 10) || 90));
    i++;
  } else if (argv[i].startsWith("--limit=")) {
    limit = Math.max(1, parseInt(argv[i].split("=")[1], 10) || 10000);
  } else if (argv[i].startsWith("--days=")) {
    days = Math.max(1, Math.min(365, parseInt(argv[i].split("=")[1], 10) || 90));
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set env vars to run.");
  process.exit(1);
}

/** Replicate costUSD from frontend/lib/ai/pricing.ts */
function costUSD(model, inputTokens, outputTokens) {
  const key = (model || "").toLowerCase();
  let inPerK = 0.005;
  let outPerK = 0.015;
  const table = {
    "gpt-5.2-codex": { inPerK: 0.0025, outPerK: 0.01 },
    "gpt-5": { inPerK: 0.0025, outPerK: 0.01 },
    "gpt-4o-mini": { inPerK: 0.00015, outPerK: 0.0006 },
    "gpt-4o": { inPerK: 0.0025, outPerK: 0.01 },
  };
  for (const k of Object.keys(table)) {
    if (key.includes(k)) {
      inPerK = table[k].inPerK;
      outPerK = table[k].outPerK;
      break;
    }
  }
  const cost =
    (inputTokens / 1000) * inPerK + (outputTokens / 1000) * outPerK;
  return Math.round(cost * 1000000) / 1000000;
}

async function main() {
  const supabase = createClient(supabaseUrl, supabaseKey);

  let query = supabase
    .from("ai_usage")
    .select(
      "id,created_at,model,input_tokens,output_tokens,cost_usd,used_two_stage,planner_model,planner_tokens_in,planner_tokens_out,planner_cost_usd"
    )
    .or(`pricing_version.lt.${LEGACY_PRICING_CUTOFF},pricing_version.is.null`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (days != null) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte("created_at", cutoff);
  }

  const { data: rows, error } = await query;

  if (error) {
    if (error.message?.includes("pricing_version") || error.message?.includes("does not exist")) {
      console.error("Failed to fetch ai_usage:", error.message);
      console.error("Run migration 057 first: adds pricing_version and cost_usd_corrected columns.");
    } else {
      console.error("Failed to fetch ai_usage:", error.message);
    }
    process.exit(1);
  }

  const toUpdate = [];
  for (const r of rows || []) {
    const it = Number(r.input_tokens) || 0;
    const ot = Number(r.output_tokens) || 0;
    let corrected = costUSD(r.model, it, ot);

    if (r.used_two_stage && r.planner_model) {
      const pi = Number(r.planner_tokens_in) || 0;
      const po = Number(r.planner_tokens_out) || 0;
      corrected += costUSD(r.planner_model, pi, po);
      corrected = Math.round(corrected * 1000000) / 1000000;
    }

    toUpdate.push({ id: r.id, cost_usd_corrected: corrected });
  }

  if (dryRun) {
    console.log(`[DRY RUN] Would update ${toUpdate.length} rows.`);
    if (toUpdate.length > 0) {
      console.log("Sample (first 5):");
      toUpdate.slice(0, 5).forEach((u) => console.log(`  id=${u.id} cost_usd_corrected=${u.cost_usd_corrected}`));
    }
    return;
  }

  let updated = 0;
  const batchSize = 100;
  for (let i = 0; i < toUpdate.length; i += batchSize) {
    const batch = toUpdate.slice(i, i + batchSize);
    for (const item of batch) {
      const { error: updateError } = await supabase
        .from("ai_usage")
        .update({ cost_usd_corrected: item.cost_usd_corrected })
        .eq("id", item.id);

      if (updateError) {
        console.error(`Failed to update id=${item.id}:`, updateError.message);
      } else {
        updated++;
      }
    }
    if (i + batchSize < toUpdate.length) {
      process.stdout.write(`\rUpdated ${updated}/${toUpdate.length}...`);
    }
  }

  console.log(`\nDone. Updated ${updated} rows with cost_usd_corrected.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
