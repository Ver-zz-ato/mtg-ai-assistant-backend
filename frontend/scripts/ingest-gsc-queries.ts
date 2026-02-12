#!/usr/bin/env tsx
/**
 * Ingest GSC query export CSV into seo_queries.
 *
 * Usage:
 *   npx tsx scripts/ingest-gsc-queries.ts path/to/gsc-export.csv
 *   npx tsx scripts/ingest-gsc-queries.ts path/to/gsc-export.csv --direct
 *
 * With --direct: uses Supabase directly (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
 * Without: POSTs to /api/admin/seo-queries/ingest (requires admin auth cookie in browser).
 *
 * GSC CSV columns (typical): Query, Clicks, Impressions, CTR, Position
 * Case-insensitive. Handles quoted values.
 */

import * as fs from "fs";
import * as path from "path";

function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (inQuotes) {
      cur += c;
    } else if (c === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

function findColumnIndex(header: string[], names: string[]): number {
  const lower = header.map((h) => h.toLowerCase().trim());
  for (const name of names) {
    const idx = lower.indexOf(name.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--direct");
  const useDirect = process.argv.includes("--direct");
  const csvPath = args[0];
  const baseUrl = args[1] || "http://localhost:3000";

  if (!csvPath) {
    console.error("Usage: npx tsx scripts/ingest-gsc-queries.ts <path-to-gsc-export.csv> [baseUrl] [--direct]");
    process.exit(1);
  }

  const absPath = path.isAbsolute(csvPath) ? csvPath : path.join(process.cwd(), csvPath);
  if (!fs.existsSync(absPath)) {
    console.error("File not found:", absPath);
    process.exit(1);
  }

  const content = fs.readFileSync(absPath, "utf-8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length < 2) {
    console.error("CSV must have header + at least one data row");
    process.exit(1);
  }

  const header = parseCSVLine(lines[0]);
  const queryIdx = findColumnIndex(header, ["query", "top queries", "search query"]);
  const clicksIdx = findColumnIndex(header, ["clicks", "click"]);
  const impressionsIdx = findColumnIndex(header, ["impressions", "impression"]);
  const ctrIdx = findColumnIndex(header, ["ctr"]);
  const positionIdx = findColumnIndex(header, ["position", "avg. position", "average position"]);

  if (queryIdx < 0) {
    console.error("Could not find Query column. Header:", header.join(", "));
    process.exit(1);
  }

  const rows: Array<{ query: string; clicks: number; impressions: number; ctr?: number; position?: number }> = [];

  for (let i = 1; i < lines.length; i++) {
    const parsed = parseCSVLine(lines[i]);
    const query = (parsed[queryIdx] ?? "").replace(/^"|"$/g, "").trim();
    if (!query) continue;

    const clicks = clicksIdx >= 0 ? parseInt(String(parsed[clicksIdx] ?? 0), 10) || 0 : 0;
    const impressions = impressionsIdx >= 0 ? parseInt(String(parsed[impressionsIdx] ?? 0), 10) || 0 : 0;
    const ctrStr = ctrIdx >= 0 ? String(parsed[ctrIdx] ?? "").replace("%", "") : "";
    const ctr = ctrStr ? parseFloat(ctrStr) : undefined;
    const posStr = positionIdx >= 0 ? String(parsed[positionIdx] ?? "") : "";
    const position = posStr ? parseFloat(posStr) : undefined;

    rows.push({ query, clicks, impressions, ...(ctr != null && !isNaN(ctr) && { ctr }), ...(position != null && !isNaN(position) && { position }) });
  }

  console.log(`Parsed ${rows.length} rows from ${lines.length - 1} data lines`);

  if (rows.length === 0) {
    console.log("No rows to ingest.");
    process.exit(0);
  }

  const payload = rows.map((r) => ({
    query: r.query,
    clicks: r.clicks,
    impressions: r.impressions,
    ...(r.ctr != null && { ctr: r.ctr }),
    ...(r.position != null && { position: r.position }),
  }));

  if (useDirect) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
    if (!url || !key) {
      console.error("--direct requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
      process.exit(1);
    }
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const toUpsert = payload.map((r) => ({
      query: r.query,
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr ?? null,
      position: r.position ?? null,
      source: "gsc",
      updated_at: new Date().toISOString(),
    }));
    const { data: upserted, error } = await supabase
      .from("seo_queries")
      .upsert(toUpsert, { onConflict: "source,query" })
      .select("id");
    if (error) {
      console.error("Direct ingest failed:", error.message);
      process.exit(1);
    }
    console.log(`Done. inserted/updated: ${Array.isArray(upserted) ? upserted.length : 0}`);
    return;
  }

  const ingestUrl = `${baseUrl.replace(/\/$/, "")}/api/admin/seo-queries/ingest`;
  console.log("POST", ingestUrl, "(requires admin auth cookie)");

  const res = await fetch(ingestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows: payload }),
    credentials: "include",
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error("Ingest failed:", res.status, data);
    process.exit(1);
  }

  console.log("Result:", data);
  console.log(`Done. inserted/updated: ${(data as { inserted?: number }).inserted ?? 0}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
