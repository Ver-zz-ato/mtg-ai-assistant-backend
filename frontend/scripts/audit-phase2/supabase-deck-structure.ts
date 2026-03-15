#!/usr/bin/env tsx
/**
 * Phase 2 audit: Deck structural dataset from deck_context_summary.
 * Samples up to 100 decks and aggregates land_count, curve_histogram, ramp/removal/draw, archetype_tags.
 *
 * Usage: npx tsx scripts/audit-phase2/supabase-deck-structure.ts
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

const SAMPLE_SIZE = 100;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) {
    console.error("Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: rows, error } = await supabase
    .from("deck_context_summary")
    .select("deck_id, deck_hash, summary_json, created_at")
    .order("created_at", { ascending: false })
    .limit(SAMPLE_SIZE);

  if (error) {
    console.error("deck_context_summary query failed:", error.message);
    process.exit(1);
  }

  const samples = rows || [];
  const landCounts: number[] = [];
  const rampCounts: number[] = [];
  const removalCounts: number[] = [];
  const drawCounts: number[] = [];
  const curveBuckets: number[][] = [];
  const archetypeTagList: string[] = [];

  for (const r of samples) {
    const j = (r as { summary_json?: Record<string, unknown> }).summary_json;
    if (!j || typeof j !== "object") continue;
    if (typeof j.land_count === "number") landCounts.push(j.land_count);
    if (typeof j.ramp === "number") rampCounts.push(j.ramp);
    if (typeof j.removal === "number") removalCounts.push(j.removal);
    if (typeof j.draw === "number") drawCounts.push(j.draw);
    if (Array.isArray(j.curve_histogram)) curveBuckets.push(j.curve_histogram as number[]);
    if (Array.isArray(j.archetype_tags)) archetypeTagList.push(...(j.archetype_tags as string[]));
  }

  const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
  const avg = (a: number[]) => (a.length ? sum(a) / a.length : 0);
  const min = (a: number[]) => (a.length ? Math.min(...a) : null);
  const max = (a: number[]) => (a.length ? Math.max(...a) : null);

  const curveByBucket: number[][] = curveBuckets.length
    ? (() => {
        const len = Math.max(...curveBuckets.map((b) => b.length));
        const out: number[][] = [];
        for (let i = 0; i < len; i++) {
          const vals = curveBuckets.map((b) => (b[i] ?? 0)).filter((v) => typeof v === "number");
          out.push(vals);
        }
        return out;
      })()
    : [];

  const curveAgg =
    curveByBucket.length > 0
      ? curveByBucket.map((vals, i) => ({
          bucket_index: i,
          avg: avg(vals),
          min: min(vals),
          max: max(vals),
          sample_count: vals.length,
        }))
      : [];

  const archetypeCounts: Record<string, number> = {};
  for (const t of archetypeTagList) {
    const tag = String(t).trim();
    if (tag) archetypeCounts[tag] = (archetypeCounts[tag] || 0) + 1;
  }
  const topArchetypeTags = Object.entries(archetypeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([tag, count]) => ({ tag, count }));

  const out = {
    meta: {
      ran_at: new Date().toISOString(),
      sample_size: samples.length,
      tables_queried: ["deck_context_summary"],
    },
    land_count: { avg: avg(landCounts), min: min(landCounts), max: max(landCounts), n: landCounts.length },
    ramp_count: { avg: avg(rampCounts), min: min(rampCounts), max: max(rampCounts), n: rampCounts.length },
    removal_count: { avg: avg(removalCounts), min: min(removalCounts), max: max(removalCounts), n: removalCounts.length },
    draw_count: { avg: avg(drawCounts), min: min(drawCounts), max: max(drawCounts), n: drawCounts.length },
    curve_histogram_aggregate: curveAgg,
    archetype_tags_top: topArchetypeTags,
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
