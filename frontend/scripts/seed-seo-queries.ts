#!/usr/bin/env tsx
/**
 * Seed seo_queries with sample data for testing the publish flow.
 * Use when you don't have a GSC export yet.
 *
 * Usage: npx tsx scripts/seed-seo-queries.ts
 */

import * as fs from "fs";
import * as path from "path";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

loadEnvLocal();

// Sample queries: commander_cost is never skipped (no canonical page).
// Others (mulligan, budget, best cards, archetype, card) may be skipped if canonical exists.
const SAMPLE_QUERIES = [
  { query: "Atraxa deck cost", clicks: 52, impressions: 1100 },
  { query: "Edgar Markov how much", clicks: 48, impressions: 950 },
  { query: "Krenko cost to build", clicks: 44, impressions: 880 },
  { query: "Kaalia commander cost", clicks: 40, impressions: 750 },
  { query: "Yuriko deck cost", clicks: 55, impressions: 1200 },
  { query: "Meren of Clan Nel Toth cost", clicks: 38, impressions: 680 },
  { query: "Teysa Karlov how much", clicks: 35, impressions: 620 },
  { query: "Muldrotha deck cost", clicks: 42, impressions: 800 },
  { query: "Wilhelt commander cost", clicks: 36, impressions: 640 },
  { query: "Korvold deck cost", clicks: 50, impressions: 980 },
  { query: "Gishath cost to build", clicks: 33, impressions: 580 },
  { query: "Lathril deck cost", clicks: 45, impressions: 860 },
  { query: "Kenrith commander cost", clicks: 48, impressions: 920 },
  { query: "Miirym cost to build", clicks: 41, impressions: 780 },
  { query: "Chulane deck cost", clicks: 39, impressions: 710 },
  { query: "Nekusar cost", clicks: 34, impressions: 600 },
  { query: "Omnath Locus of Creation cost", clicks: 58, impressions: 1300 },
  { query: "Xenagos deck cost", clicks: 37, impressions: 660 },
  { query: "Derevi commander cost", clicks: 32, impressions: 550 },
  { query: "Maelstrom Wanderer cost", clicks: 36, impressions: 640 },
  { query: "Prossh deck cost", clicks: 35, impressions: 610 },
  { query: "Breya cost to build", clicks: 44, impressions: 820 },
  { query: "Rhys the Redeemed cost", clicks: 30, impressions: 520 },
  { query: "Sliver Overlord deck cost", clicks: 47, impressions: 900 },
  { query: "Teferi Temporal Archmage cost", clicks: 43, impressions: 800 },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) {
    console.error("Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const rows = SAMPLE_QUERIES.map((r) => ({
    query: r.query,
    clicks: r.clicks,
    impressions: r.impressions,
    source: "gsc",
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await admin.from("seo_queries").upsert(rows, { onConflict: "source,query" }).select("id");

  if (error) {
    console.error("Seed failed:", error.message);
    process.exit(1);
  }

  console.log(`Seeded ${Array.isArray(data) ? data.length : 0} queries into seo_queries.`);
  console.log("Run: npx tsx scripts/publish-seo-pages.ts 25");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
