#!/usr/bin/env node
/**
 * READ-ONLY audit: compare public.scryfall_cache.name values to canonical names from
 * the latest Scryfall default_cards bulk file. Does not write to Supabase or mutate data.
 *
 * ## How to run (from frontend/)
 *
 *   node scripts/audit-scryfall-cache-names.mjs
 *
 * Or with explicit env (PowerShell):
 *
 *   $env:SUPABASE_URL="https://xxx.supabase.co"; $env:SUPABASE_SERVICE_ROLE_KEY="..."; node scripts/audit-scryfall-cache-names.mjs
 *
 * Optional:
 *   --out-json=path     Override JSON report path (default: tmp/scryfall-cache-name-audit.json)
 *   --out-csv=path      Override CSV path (default: tmp/scryfall-cache-name-audit-unmatched.csv)
 *
 * Env (optional, overrides defaults if set):
 *   SCRYFALL_NAME_AUDIT_OUT_JSON   Full path to JSON report
 *   SCRYFALL_NAME_AUDIT_OUT_CSV    Full path to CSV report
 *
 * ## Required environment
 *
 *   SUPABASE_URL              Project URL (NEXT_PUBLIC_SUPABASE_URL is also accepted)
 *   SUPABASE_SERVICE_ROLE_KEY Service role key (read-only SELECT on scryfall_cache)
 *
 * Loads .env.local and .env from frontend/ and repo root if present (does not override existing OS env).
 */

import { createClient } from "@supabase/supabase-js";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const frontendRoot = resolve(__dirname, "..");

// -----------------------------------------------------------------------------
// normalizeScryfallCacheName — MUST stay byte-for-byte identical to:
//   frontend/lib/server/scryfallCacheRow.ts → export function normalizeScryfallCacheName
// (This script is plain .mjs so we cannot import the TS module without tsx.)
// -----------------------------------------------------------------------------
function normalizeScryfallCacheName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// -----------------------------------------------------------------------------
// Env loading (no dotenv dependency)
// -----------------------------------------------------------------------------
function parseEnvFile(content) {
  const out = {};
  for (const line of content.split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function loadEnvFromDisk() {
  const roots = [frontendRoot, resolve(frontendRoot, "..")];
  const names = [".env.local", ".env"];
  for (const root of roots) {
    for (const name of names) {
      const p = join(root, name);
      if (!existsSync(p)) continue;
      try {
        const parsed = parseEnvFile(readFileSync(p, "utf8"));
        for (const [k, v] of Object.entries(parsed)) {
          if (process.env[k] === undefined) process.env[k] = v;
        }
      } catch {
        /* ignore */
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Heuristic classification (reporting only — not all "unknown" rows are invalid)
// -----------------------------------------------------------------------------
function classifyUnmatchedName(name) {
  const s = String(name);

  if (/\[\[/.test(s)) return "bracketed_name";
  if (/[\[\]]/.test(s)) return "partial_bracket_pollution";

  if (/^\s*\/\//.test(s)) return "leading_split_fragment";
  if (/\/\/\s*$/.test(s)) return "trailing_split_fragment";

  if (/\([^)]+\)\s*\d+\s*$/.test(s)) return "import_set_number_junk";

  if (/^[\-–—\u2013]/.test(s.trim())) return "leading_punctuation";

  if (s.includes('"')) return "quoted_name";

  if (s.includes(",") && s.split(",").length >= 2) return "csv_pollution";

  if (/\n/.test(s) || /\s{3,}/.test(s)) return "whitespace_pollution";

  return "unknown";
}

function parseArgs(argv) {
  let outJson = process.env.SCRYFALL_NAME_AUDIT_OUT_JSON
    ? resolve(process.env.SCRYFALL_NAME_AUDIT_OUT_JSON)
    : join(frontendRoot, "tmp", "scryfall-cache-name-audit.json");
  let outCsv = process.env.SCRYFALL_NAME_AUDIT_OUT_CSV
    ? resolve(process.env.SCRYFALL_NAME_AUDIT_OUT_CSV)
    : join(frontendRoot, "tmp", "scryfall-cache-name-audit-unmatched.csv");
  for (const a of argv) {
    if (a.startsWith("--out-json=")) outJson = resolve(a.slice("--out-json=".length));
    else if (a.startsWith("--out-csv=")) outCsv = resolve(a.slice("--out-csv=".length));
  }
  return { outJson, outCsv };
}

async function fetchBulkMetadata() {
  const r = await fetch("https://api.scryfall.com/bulk-data", { cache: "no-store" });
  if (!r.ok) throw new Error(`bulk-data HTTP ${r.status}`);
  const meta = await r.json();
  const entry = (meta?.data || []).find((d) => d?.type === "default_cards");
  if (!entry?.download_uri) throw new Error('No default_cards entry in bulk-data');
  return {
    download_uri: entry.download_uri,
    updated_at: entry.updated_at ?? null,
    size: entry.size ?? null,
    uri: entry.uri ?? null,
  };
}

async function fetchAllDbNames(supabase) {
  const names = [];
  const pageSize = 1000;
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("scryfall_cache")
      .select("name")
      .order("name", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Supabase: ${error.message}`);
    const rows = data || [];
    for (const row of rows) {
      if (row?.name != null) names.push(String(row.name));
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return names;
}

function main() {
  loadEnvFromDisk();
  const { outJson, outCsv } = parseArgs(process.argv.slice(2));

  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error(
      "[audit-scryfall-cache-names] Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY."
    );
    process.exit(1);
  }

  return runAudit(supabaseUrl, serviceKey, outJson, outCsv);
}

async function runAudit(supabaseUrl, serviceKey, outJson, outCsv) {
  const startedAt = new Date().toISOString();
  console.log(`[audit-scryfall-cache-names] START ${startedAt}`);

  console.log("[audit-scryfall-cache-names] Fetching Scryfall bulk-data metadata...");
  const bulkInfo = await fetchBulkMetadata();
  console.log(
    `[audit-scryfall-cache-names] default_cards updated_at=${bulkInfo.updated_at} size_bytes=${bulkInfo.size} uri=${bulkInfo.download_uri}`
  );

  console.log(
    "[audit-scryfall-cache-names] Downloading default_cards JSON (large; may use significant memory)..."
  );
  const bulkResp = await fetch(bulkInfo.download_uri, { cache: "no-store" });
  if (!bulkResp.ok) throw new Error(`Bulk download HTTP ${bulkResp.status}`);
  const cards = await bulkResp.json();
  if (!Array.isArray(cards)) throw new Error("default_cards JSON is not an array");

  const scryfallCanonical = new Set();
  for (const c of cards) {
    const raw = c?.name;
    if (raw == null) continue;
    const key = normalizeScryfallCacheName(String(raw));
    if (key) scryfallCanonical.add(key);
  }

  console.log(
    `[audit-scryfall-cache-names] Built canonical name set: ${scryfallCanonical.size} (from ${cards.length} bulk objects)`
  );

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("[audit-scryfall-cache-names] Loading all scryfall_cache.name from Supabase...");
  const dbNames = await fetchAllDbNames(supabase);
  console.log(`[audit-scryfall-cache-names] DB names loaded: ${dbNames.length}`);

  const unmatched = [];
  for (const name of dbNames) {
    if (!scryfallCanonical.has(name)) {
      unmatched.push({
        name,
        category: classifyUnmatchedName(name),
      });
    }
  }

  const categoryCounts = {};
  for (const row of unmatched) {
    categoryCounts[row.category] = (categoryCounts[row.category] || 0) + 1;
  }

  const finishedAt = new Date().toISOString();
  const report = {
    auditTimestamp: finishedAt,
    startedAt,
    scryfallBulk: {
      download_uri: bulkInfo.download_uri,
      updated_at: bulkInfo.updated_at,
      size_bytes: bulkInfo.size,
      bulk_object_count: cards.length,
    },
    totalDbNames: dbNames.length,
    totalScryfallCanonicalNames: scryfallCanonical.size,
    unmatchedCount: unmatched.length,
    categoryCounts,
    unmatched,
  };

  mkdirSync(dirname(outJson), { recursive: true });
  writeFileSync(outJson, JSON.stringify(report, null, 2), "utf8");
  console.log(`[audit-scryfall-cache-names] Wrote JSON: ${outJson}`);

  const csvLines = ["name,category", ...unmatched.map((r) => csvEscape(r.name) + "," + csvEscape(r.category))];
  writeFileSync(outCsv, csvLines.join("\n"), "utf8");
  console.log(`[audit-scryfall-cache-names] Wrote CSV: ${outCsv}`);

  console.log("");
  console.log("=== Summary ===");
  console.log(`Total DB names:              ${dbNames.length}`);
  console.log(`Total Scryfall canonical:    ${scryfallCanonical.size}`);
  console.log(`Unmatched DB names:          ${unmatched.length}`);
  console.log("By category:");
  for (const [cat, n] of Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${n}`);
  }
  console.log("");
  const samplePer = 3;
  const byCat = {};
  for (const row of unmatched) {
    if (!byCat[row.category]) byCat[row.category] = [];
    if (byCat[row.category].length < samplePer) byCat[row.category].push(row.name);
  }
  console.log("Samples per category:");
  for (const cat of Object.keys(byCat).sort()) {
    console.log(`  [${cat}] ${JSON.stringify(byCat[cat])}`);
  }

  console.log(`[audit-scryfall-cache-names] END ${finishedAt} (ok)`);
}

function csvEscape(s) {
  const t = String(s);
  if (/[",\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

main().catch((err) => {
  console.error("[audit-scryfall-cache-names] FAILED:", err?.message || err);
  process.exit(1);
});
