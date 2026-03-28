#!/usr/bin/env node
/**
 * READ-ONLY: SQL plan for import_set_number_junk preview (repair_to_canonical only).
 *
 * Reads: tmp/scryfall-cache-preview-import-set-number-junk.json
 * Queries: scryfall_cache (SELECT only)
 *
 * Skips repairs when the bad PK is not present in DB (not in scope for SQL).
 *
 * Run: npm run preview:scryfall-cache-sql-plan-import-set-number-junk-safe
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");

function normalizeScryfallCacheName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEnvFile(content) {
  const out = {};
  for (const line of content.split("\n")) {
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

function parseArgs(argv) {
  let previewJson = join(frontendRoot, "tmp", "scryfall-cache-preview-import-set-number-junk.json");
  let outSql = join(frontendRoot, "tmp", "scryfall-cache-sql-plan-import-set-number-junk-safe.sql");
  let outJson = join(frontendRoot, "tmp", "scryfall-cache-sql-plan-import-set-number-junk-safe.json");
  for (const a of argv) {
    if (a.startsWith("--preview-json=")) previewJson = resolve(a.slice("--preview-json=".length));
    else if (a.startsWith("--out-sql=")) outSql = resolve(a.slice("--out-sql=".length));
    else if (a.startsWith("--out-json=")) outJson = resolve(a.slice("--out-json=".length));
  }
  return { previewJson, outSql, outJson };
}

function sqlStringLiteral(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function mergeExprForColumn(col) {
  const qc = `c.${quoteIdent(col)}`;
  const qd = `d.${quoteIdent(col)}`;
  switch (col) {
    case "small":
    case "normal":
    case "art_crop":
    case "type_line":
    case "oracle_text":
    case "mana_cost":
    case "rarity":
    case "collector_number":
    case "power":
    case "toughness":
    case "loyalty":
      return `CASE WHEN (${qc} IS NULL OR ${qc} = '') THEN ${qd} ELSE ${qc} END`;
    case "set":
      return `CASE WHEN (c."set" IS NULL OR c."set" = '') THEN d."set" ELSE c."set" END`;
    case "name_norm":
      return `CASE WHEN (${qc} IS NULL OR ${qc} = '') THEN ${qd} ELSE ${qc} END`;
    case "cmc":
      return `CASE WHEN ${qc} IS NULL THEN ${qd} ELSE ${qc} END`;
    case "color_identity":
    case "colors":
    case "keywords":
      return `CASE WHEN (COALESCE(cardinality(${qc}), 0) = 0) THEN ${qd} ELSE ${qc} END`;
    case "legalities":
      return `CASE WHEN (${qc} IS NULL OR ${qc} = '{}'::jsonb) THEN ${qd} ELSE ${qc} END`;
    case "is_land":
    case "is_creature":
    case "is_instant":
    case "is_sorcery":
    case "is_enchantment":
    case "is_artifact":
    case "is_planeswalker":
      return `CASE WHEN ${qc} IS NULL THEN ${qd} ELSE ${qc} END`;
    default:
      return `${qc}`;
  }
}

function quoteIdent(col) {
  if (col === "set") return '"set"';
  return col;
}

const MERGE_ORDER = [
  "small",
  "normal",
  "art_crop",
  "type_line",
  "oracle_text",
  "color_identity",
  "colors",
  "keywords",
  "power",
  "toughness",
  "loyalty",
  "is_land",
  "is_creature",
  "is_instant",
  "is_sorcery",
  "is_enchantment",
  "is_artifact",
  "is_planeswalker",
  "cmc",
  "mana_cost",
  "rarity",
  "set",
  "collector_number",
  "legalities",
  "name_norm",
];

function buildMergeUpdateSql(badName, canonicalName) {
  const lines = MERGE_ORDER.map((col) => `  ${quoteIdent(col)} = ${mergeExprForColumn(col)},`);
  lines.push(`  updated_at = now()`);
  return [
    `UPDATE public.scryfall_cache AS c`,
    `SET`,
    lines.join("\n"),
    `FROM public.scryfall_cache AS d`,
    `WHERE c.name = ${sqlStringLiteral(canonicalName)}`,
    `  AND d.name = ${sqlStringLiteral(badName)};`,
    ``,
  ].join("\n");
}

function buildRenameSql(badName, canonicalName) {
  return [
    `UPDATE public.scryfall_cache`,
    `SET`,
    `  name = ${sqlStringLiteral(canonicalName)},`,
    `  name_norm = ${sqlStringLiteral(canonicalName)},`,
    `  updated_at = now()`,
    `WHERE name = ${sqlStringLiteral(badName)};`,
    ``,
  ].join("\n");
}

function buildDeleteSql(badName) {
  return `DELETE FROM public.scryfall_cache WHERE name = ${sqlStringLiteral(badName)};\n\n`;
}

async function fetchRowsByNames(supabase, names) {
  const list = [...names].filter(Boolean);
  const out = new Map();
  const chunkSize = 150;
  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("scryfall_cache")
      .select("*")
      .in("name", chunk);
    if (error) throw new Error(`Supabase: ${error.message}`);
    for (const row of data || []) {
      if (row?.name != null) out.set(String(row.name), row);
    }
  }
  return out;
}

async function main() {
  loadEnvFromDisk();
  const { previewJson, outSql, outJson } = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error(
      "[import-junk-sql-plan] Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY."
    );
    process.exit(1);
  }

  if (!existsSync(previewJson)) {
    console.error(`[import-junk-sql-plan] Preview file not found: ${previewJson}`);
    process.exit(1);
  }

  const preview = JSON.parse(readFileSync(previewJson, "utf8"));
  const allRows = preview.rows || [];
  if (!Array.isArray(allRows)) {
    console.error("[import-junk-sql-plan] Expected rows[]");
    process.exit(1);
  }

  const repairs = allRows.filter((r) => r.proposed_action === "repair_to_canonical");

  const toFetch = new Set();
  for (const r of repairs) {
    toFetch.add(String(r.original_name));
    const t = r.proposed_target_name;
    if (t != null && String(t).trim() !== "") {
      toFetch.add(normalizeScryfallCacheName(t));
    }
  }

  console.log(
    `[import-junk-sql-plan] Preview repair rows: ${repairs.length}; fetching ${toFetch.size} PKs...`
  );

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const dbByName = await fetchRowsByNames(supabase, toFetch);
  console.log(`[import-junk-sql-plan] Rows fetched from DB: ${dbByName.size}`);

  const mergePlans = [];
  const mergeBadNames = [];
  const renamePlans = [];
  const skippedUnsafe = [];

  for (const r of repairs) {
    const bad = String(r.original_name);
    const normTarget = normalizeScryfallCacheName(r.proposed_target_name);
    if (!normTarget) {
      skippedUnsafe.push({
        original_name: bad,
        reason: "skip_empty_target",
        preview: r,
      });
      continue;
    }
    if (bad === normTarget) {
      skippedUnsafe.push({
        original_name: bad,
        reason: "skip_bad_equals_canonical_key",
        preview: r,
      });
      continue;
    }

    const badRow = dbByName.get(bad);
    if (!badRow) {
      skippedUnsafe.push({
        original_name: bad,
        reason: "not_in_database",
        canonical_key: normTarget,
        preview: r,
      });
      continue;
    }

    const canonRow = dbByName.get(normTarget);
    if (canonRow) {
      mergePlans.push({
        strategy: "merge_then_delete_bad_row",
        bad_name: bad,
        canonical_name: normTarget,
        matched_by_rule: r.matched_by_rule ?? null,
      });
      mergeBadNames.push(bad);
    } else {
      renamePlans.push({
        strategy: "rename_row_to_canonical",
        bad_name: bad,
        canonical_name: normTarget,
        matched_by_rule: r.matched_by_rule ?? null,
      });
    }
  }

  const sqlParts = [];
  sqlParts.push(`-- =============================================================================`);
  sqlParts.push(`-- scryfall_cache — import_set_number_junk safe SQL PREVIEW (not executed)`);
  sqlParts.push(`-- Generated: ${new Date().toISOString()}`);
  sqlParts.push(`-- Source: ${previewJson}`);
  sqlParts.push(`-- Only repair_to_canonical rows whose bad PK exists in DB.`);
  sqlParts.push(`-- =============================================================================`);
  sqlParts.push(``);
  sqlParts.push(`BEGIN;`);
  sqlParts.push(``);
  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  sqlParts.push(`-- Section A — Merge nulls from bad row into canonical row`);
  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  sqlParts.push(``);
  for (const p of mergePlans) {
    sqlParts.push(`-- merge: bad=${p.bad_name} → canonical=${p.canonical_name}`);
    sqlParts.push(buildMergeUpdateSql(p.bad_name, p.canonical_name));
  }

  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  sqlParts.push(`-- Section B — Delete merged bad rows`);
  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  sqlParts.push(``);
  for (const name of mergeBadNames) {
    sqlParts.push(`-- delete merged bad: ${name}`);
    sqlParts.push(buildDeleteSql(name));
  }

  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  sqlParts.push(`-- Section C — Rename row to canonical (no existing canonical row)`);
  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  sqlParts.push(``);
  for (const p of renamePlans) {
    sqlParts.push(`-- rename: ${p.bad_name} → ${p.canonical_name}`);
    sqlParts.push(buildRenameSql(p.bad_name, p.canonical_name));
  }

  sqlParts.push(`ROLLBACK;`);
  sqlParts.push(``);

  mkdirSync(dirname(outSql), { recursive: true });
  writeFileSync(outSql, sqlParts.join("\n"), "utf8");

  const skippedNotInDb = skippedUnsafe.filter((s) => s.reason === "not_in_database").length;

  const report = {
    generatedAt: new Date().toISOString(),
    sourcePreviewPath: previewJson,
    summary: {
      preview_repair_rows: repairs.length,
      merge_then_delete_bad_row: mergePlans.length,
      rename_row_to_canonical: renamePlans.length,
      skipped: skippedUnsafe.length,
      skipped_not_in_database: skippedNotInDb,
    },
    merge_plans: mergePlans,
    rename_plans: renamePlans,
    skipped_unsafe: skippedUnsafe,
  };
  writeFileSync(outJson, JSON.stringify(report, null, 2), "utf8");

  const s = report.summary;
  console.log("");
  console.log("=== import_set_number_junk safe SQL plan (preview only) ===");
  console.log(`preview repair rows:        ${s.preview_repair_rows}`);
  console.log(`merge_then_delete_bad_row:  ${s.merge_then_delete_bad_row}`);
  console.log(`rename_row_to_canonical:    ${s.rename_row_to_canonical}`);
  console.log(`skipped (total):            ${s.skipped}`);
  console.log(`skipped_not_in_database:    ${s.skipped_not_in_database}`);
  console.log("");
  console.log("Samples — merge:");
  for (const x of mergePlans.slice(0, 5)) {
    console.log(`  ${x.bad_name} → ${x.canonical_name}`);
  }
  console.log("Samples — rename:");
  for (const x of renamePlans.slice(0, 5)) {
    console.log(`  ${x.bad_name} → ${x.canonical_name}`);
  }
  console.log("Samples — skipped:");
  for (const x of skippedUnsafe.slice(0, 8)) {
    console.log(`  ${x.original_name} (${x.reason})`);
  }
  console.log("");
  console.log(`Wrote SQL:  ${outSql}`);
  console.log(`Wrote JSON: ${outJson}`);
  console.log("[import-junk-sql-plan] END (ok)");
}

main().catch((err) => {
  console.error("[import-junk-sql-plan] FAILED:", err?.message || err);
  process.exit(1);
});
