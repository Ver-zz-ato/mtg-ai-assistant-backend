#!/usr/bin/env node
/**
 * Audit ai_usage cost consistency.
 * Recomputes cost from model+tokens using costUSD logic and compares to stored cost_usd.
 * Run: node scripts/audit-ai-usage-cost.mjs [--limit N] [--days D] [--json]
 * With Supabase keys: runs audit. Without: skips with warning (exit 0, CI-friendly).
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

// Parse args
const argv = process.argv.slice(2);
const jsonMode = argv.includes("--json");
let limit = 50;
let days = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--limit" && argv[i + 1]) {
    limit = Math.max(1, parseInt(argv[i + 1], 10) || 50);
    i++;
  } else if (argv[i] === "--days" && argv[i + 1]) {
    days = Math.max(1, Math.min(90, parseInt(argv[i + 1], 10) || 7));
    i++;
  } else if (argv[i].startsWith("--limit=")) {
    limit = Math.max(1, parseInt(argv[i].split("=")[1], 10) || 50);
  } else if (argv[i].startsWith("--days=")) {
    days = Math.max(1, Math.min(90, parseInt(argv[i].split("=")[1], 10) || 7));
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  const msg =
    "Cost audit SKIPPED: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set env vars to run.";
  if (jsonMode) {
    console.log(JSON.stringify({ skipped: true, reason: msg }));
  } else {
    console.warn(msg);
  }
  process.exit(0);
}

/** Replicate costUSD from frontend/lib/ai/pricing.ts (per-1K tokens) */
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

const ABS_THRESHOLD = Number(process.env.COST_AUDIT_ABS_THRESHOLD) || 1e-6;
const REL_THRESHOLD = Number(process.env.COST_AUDIT_REL_THRESHOLD) || 0.01;

async function main() {
  const supabase = createClient(supabaseUrl, supabaseKey);

  let query = supabase
    .from("ai_usage")
    .select(
      "id,created_at,route,model,input_tokens,output_tokens,cost_usd,used_two_stage,planner_model,planner_tokens_in,planner_tokens_out,planner_cost_usd"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (days != null) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte("created_at", cutoff);
  }

  const { data: rows, error } = await query;

  if (error) {
    if (jsonMode) {
      console.log(JSON.stringify({ skipped: true, reason: error.message }));
    } else {
      console.error("Failed to fetch ai_usage:", error.message);
    }
    process.exit(jsonMode ? 0 : 1);
  }

  const mismatches = [];
  const byModel = new Map();
  const byRoute = new Map();

  for (const r of rows || []) {
    const it = Number(r.input_tokens) || 0;
    const ot = Number(r.output_tokens) || 0;
    const stored = Number(r.cost_usd) || 0;
    const expected = costUSD(r.model, it, ot);

    let mismatch = false;
    const absDiff = Math.abs(stored - expected);
    const relDiff = expected > 0 ? absDiff / expected : absDiff;

    if (absDiff > ABS_THRESHOLD && relDiff > REL_THRESHOLD) {
      mismatch = true;
      mismatches.push({
        id: r.id,
        created_at: r.created_at,
        route: r.route,
        model: r.model,
        stored,
        expected,
        absDiff,
        relDiff: (relDiff * 100).toFixed(2) + "%",
      });
      const m = r.model || "unknown";
      byModel.set(m, (byModel.get(m) || 0) + 1);
      const rt = r.route || "unknown";
      byRoute.set(rt, (byRoute.get(rt) || 0) + 1);
    }

    if (r.used_two_stage && r.planner_model && r.planner_cost_usd != null) {
      const pi = Number(r.planner_tokens_in) || 0;
      const po = Number(r.planner_tokens_out) || 0;
      const pStored = Number(r.planner_cost_usd) || 0;
      const pExpected = costUSD(r.planner_model, pi, po);
      const pAbs = Math.abs(pStored - pExpected);
      const pRel = pExpected > 0 ? pAbs / pExpected : pAbs;
      if (pAbs > ABS_THRESHOLD && pRel > REL_THRESHOLD) {
        mismatch = true;
        mismatches.push({
          id: r.id,
          created_at: r.created_at,
          route: r.route,
          model: `planner:${r.planner_model}`,
          stored: pStored,
          expected: pExpected,
          absDiff: pAbs,
          relDiff: (pRel * 100).toFixed(2) + "%",
        });
      }
    }
  }

  const result = {
    skipped: false,
    rowsChecked: rows?.length || 0,
    mismatchCount: mismatches.length,
    byModel: Object.fromEntries(byModel),
    byRoute: Object.fromEntries(byRoute),
    sampleMismatches: mismatches.slice(0, 10),
  };

  if (jsonMode) {
    console.log(JSON.stringify(result));
  } else {
    console.log("=== AI Usage Cost Audit ===\n");
    console.log(`Rows checked: ${rows?.length || 0}`);
    console.log(`Mismatches: ${mismatches.length}`);
    if (mismatches.length > 0) {
      console.log("\nBy model:", result.byModel);
      console.log("By route:", result.byRoute);
      console.log("\nSample mismatches (first 10):");
      mismatches.slice(0, 10).forEach((m) => {
        console.log(
          `  ${m.id} | ${m.route} | ${m.model} | stored=${m.stored} expected=${m.expected} diff=${m.absDiff} (${m.relDiff})`
        );
      });
    } else {
      console.log("All costs consistent with pricing.ts logic.");
    }
  }
}

main().catch((e) => {
  if (jsonMode) {
    console.log(JSON.stringify({ skipped: true, reason: String(e) }));
    process.exit(0);
  }
  console.error(e);
  process.exit(1);
});
