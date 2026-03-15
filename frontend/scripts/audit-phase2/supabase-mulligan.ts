#!/usr/bin/env tsx
/**
 * Phase 2 audit: Mulligan dataset from mulligan_advice_runs.
 * Computes keep rate, mulligan frequency, and ramp-in-reasons vs keep rate.
 *
 * Usage: npx tsx scripts/audit-phase2/supabase-mulligan.ts
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE)
 */

import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) {
    console.error("Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: rows, error } = await supabase
    .from("mulligan_advice_runs")
    .select("id, created_at, source, input_json, output_json, cached, llm_used")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    console.error("mulligan_advice_runs query failed:", error.message);
    process.exit(1);
  }

  const runs = rows || [];
  let keepCount = 0;
  let mullCount = 0;
  const mulliganCountFreq: Record<number, number> = {};
  const rampMentionKeep: number[] = [];
  const rampMentionMull: number[] = [];

  const RAMP_WORDS = /ramp|signet|sol ring|arcane signet|mana rock|dork|accelerat/i;

  for (const r of runs) {
    const out = (r as { output_json?: { action?: string; reasons?: string[] } }).output_json;
    const inp = (r as { input_json?: { mulliganCount?: number; hand?: string[]; deck?: { cards: { name: string }[] } } }).input_json;
    const action = out?.action?.toUpperCase();
    if (action === "KEEP") keepCount++;
    else if (action === "MULLIGAN") mullCount++;

    const mullCnt = typeof inp?.mulliganCount === "number" ? inp.mulliganCount : 0;
    mulliganCountFreq[mullCnt] = (mulliganCountFreq[mullCnt] || 0) + 1;

    const reasons = Array.isArray(out?.reasons) ? out.reasons.join(" ") : "";
    const reasonsMentionRamp = RAMP_WORDS.test(reasons);
    if (reasonsMentionRamp) {
      if (action === "KEEP") rampMentionKeep.push(1);
      else if (action === "MULLIGAN") rampMentionMull.push(1);
    }
  }

  const total = keepCount + mullCount;
  const keepRate = total > 0 ? keepCount / total : null;
  const mulliganCountDist = Object.entries(mulliganCountFreq)
    .map(([k, v]) => ({ mulligan_count: Number(k), runs: v }))
    .sort((a, b) => a.mulligan_count - b.mulligan_count);

  const rampKeepRate =
    rampMentionKeep.length + rampMentionMull.length > 0
      ? rampMentionKeep.length / (rampMentionKeep.length + rampMentionMull.length)
      : null;

  const out = {
    meta: {
      ran_at: new Date().toISOString(),
      total_runs: runs.length,
      runs_with_action: total,
      tables_queried: ["mulligan_advice_runs"],
    },
    keep_rate: keepRate,
    keep_count: keepCount,
    mull_count: mullCount,
    mulligan_count_distribution: mulliganCountDist,
    ramp_in_reasons: {
      runs_where_reasons_mention_ramp: rampMentionKeep.length + rampMentionMull.length,
      keep_when_ramp_mentioned: rampMentionKeep.length,
      mull_when_ramp_mentioned: rampMentionMull.length,
      keep_rate_when_ramp_mentioned: rampKeepRate,
    },
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
