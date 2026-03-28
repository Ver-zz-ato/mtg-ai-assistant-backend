#!/usr/bin/env node
/**
 * READ-ONLY: build a reviewable SQL + JSON/CSV plan from
 * `tmp/scryfall-cache-cleanup-preview.json` + live `scryfall_cache` rows.
 *
 * Does NOT execute SQL, does NOT write to Supabase.
 *
 * Run (from frontend/):
 *   npm run preview:scryfall-cache-sql-plan
 *
 * Optional:
 *   --preview-json=path   Path to cleanup preview JSON (default: tmp/scryfall-cache-cleanup-preview.json)
 *   --out-dir=path        Output directory (default: tmp)
 *
 * Env (same as audit):
 *   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (SELECT on scryfall_cache only)
 *
 * Loads .env.local / .env from frontend/ and repo root if present.
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const frontendRoot = resolve(__dirname, "..");

/** Lockstep with frontend/lib/server/scryfallCacheRow.ts → normalizeScryfallCacheName */
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
  let previewJson = join(frontendRoot, "tmp", "scryfall-cache-cleanup-preview.json");
  let outDir = join(frontendRoot, "tmp");
  for (const a of argv) {
    if (a.startsWith("--preview-json=")) previewJson = resolve(a.slice("--preview-json=".length));
    else if (a.startsWith("--out-dir=")) outDir = resolve(a.slice("--out-dir=".length));
  }
  return { previewJson, outDir };
}

/** PostgreSQL string literal (single-quoted, standard escaping). */
function sqlStringLiteral(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

/** Merge expression: fill canonical `c` from dirty `d` only when `c` is null/empty. */
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

function csvEscape(s) {
  const t = String(s ?? "");
  if (/[",\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

async function main() {
  loadEnvFromDisk();
  const { previewJson, outDir } = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error(
      "[preview-scryfall-cache-sql-plan] Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY."
    );
    process.exit(1);
  }

  if (!existsSync(previewJson)) {
    console.error(`[preview-scryfall-cache-sql-plan] Preview file not found: ${previewJson}`);
    process.exit(1);
  }

  const preview = JSON.parse(readFileSync(previewJson, "utf8"));
  const rows = preview.rows || [];
  if (!Array.isArray(rows)) {
    console.error("[preview-scryfall-cache-sql-plan] Invalid preview JSON: expected rows[]");
    process.exit(1);
  }

  const toFetch = new Set();
  for (const r of rows) {
    if (r.proposed_action === "repair_to_canonical") {
      toFetch.add(String(r.original_name));
      const t = r.proposed_target_name;
      if (t != null && String(t).trim() !== "") {
        toFetch.add(normalizeScryfallCacheName(t));
      }
    } else if (r.proposed_action === "delete_candidate") {
      toFetch.add(String(r.original_name));
    }
  }

  console.log(
    `[preview-scryfall-cache-sql-plan] Loading ${toFetch.size} distinct PKs from scryfall_cache...`
  );

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const dbByName = await fetchRowsByNames(supabase, toFetch);
  console.log(`[preview-scryfall-cache-sql-plan] Rows fetched: ${dbByName.size}`);

  const mergePlans = [];
  const mergeBadNames = [];
  const renamePlans = [];
  const deletePlans = [];
  const skipped = [];

  for (const r of rows) {
    if (r.proposed_action === "repair_to_canonical") {
      const bad = String(r.original_name);
      const targetRaw = r.proposed_target_name;
      const normTarget = normalizeScryfallCacheName(targetRaw);
      if (!normTarget) {
        skipped.push({
          original_name: bad,
          proposed_action: "repair_to_canonical",
          reason: "skip_empty_target",
          preview: r,
        });
        continue;
      }

      if (bad === normTarget) {
        skipped.push({
          original_name: bad,
          proposed_action: "repair_to_canonical",
          reason: "skip_bad_equals_canonical_key",
          preview: r,
        });
        continue;
      }

      const badRow = dbByName.get(bad);
      const canonRow = dbByName.get(normTarget);

      if (!badRow) {
        skipped.push({
          original_name: bad,
          proposed_action: "repair_to_canonical",
          reason: "missing_bad_row",
          canonical_key: normTarget,
          preview: r,
        });
        continue;
      }

      if (canonRow) {
        mergePlans.push({
          strategy: "merge_then_delete_bad_row",
          bad_name: bad,
          canonical_name: normTarget,
          matched_by_rule: r.matched_by_rule ?? null,
          repair_pass: r.repair_pass ?? null,
        });
        mergeBadNames.push(bad);
        continue;
      }

      renamePlans.push({
        strategy: "rename_row_to_canonical",
        bad_name: bad,
        canonical_name: normTarget,
        matched_by_rule: r.matched_by_rule ?? null,
        repair_pass: r.repair_pass ?? null,
      });
      continue;
    }

    if (r.proposed_action === "delete_candidate") {
      const bad = String(r.original_name);
      const badRow = dbByName.get(bad);
      if (!badRow) {
        skipped.push({
          original_name: bad,
          proposed_action: "delete_candidate",
          reason: "missing_bad_row",
          preview: r,
        });
        continue;
      }
      deletePlans.push({
        strategy: "delete_candidate",
        bad_name: bad,
        matched_by_rule: r.matched_by_rule ?? null,
      });
    }
  }

  const summary = {
    merge_then_delete_bad_row: mergePlans.length,
    rename_row_to_canonical: renamePlans.length,
    delete_candidate: deletePlans.length,
    skipped_unsafe: skipped.length,
  };

  const sqlParts = [];
  sqlParts.push(`-- =============================================================================`);
  sqlParts.push(`-- scryfall_cache cleanup — SQL PREVIEW ONLY (not executed by this script)`);
  sqlParts.push(`-- Generated: ${new Date().toISOString()}`);
  sqlParts.push(`-- Source preview: ${previewJson}`);
  sqlParts.push(`--`);
  sqlParts.push(`-- Ends with ROLLBACK — replace with COMMIT only after manual review in SQL editor.`);
  sqlParts.push(`-- =============================================================================`);
  sqlParts.push(``);
  sqlParts.push(`BEGIN;`);
  sqlParts.push(``);
  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  sqlParts.push(`-- Section A — Merge useful nulls from bad row into canonical row (conservative)`);
  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  sqlParts.push(``);
  for (const p of mergePlans) {
    sqlParts.push(`-- merge: bad=${p.bad_name} → canonical=${p.canonical_name}`);
    sqlParts.push(buildMergeUpdateSql(p.bad_name, p.canonical_name));
  }

  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  sqlParts.push(`-- Section B — Delete bad rows after merge (same PKs as Section A)`);
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

  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  sqlParts.push(`-- Section D — Pure junk deletes (delete_candidate with DB row present)`);
  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  sqlParts.push(``);
  for (const p of deletePlans) {
    sqlParts.push(`-- junk delete: ${p.bad_name}`);
    sqlParts.push(buildDeleteSql(p.bad_name));
  }

  sqlParts.push(`ROLLBACK;`);
  sqlParts.push(``);

  const sqlText = sqlParts.join("\n");

  mkdirSync(outDir, { recursive: true });
  const outJson = join(outDir, "scryfall-cache-sql-plan.json");
  const outCsv = join(outDir, "scryfall-cache-sql-plan.csv");
  const outSql = join(outDir, "scryfall-cache-sql-plan.sql");

  const report = {
    generatedAt: new Date().toISOString(),
    sourcePreviewPath: previewJson,
    summary,
    merge_plans: mergePlans,
    rename_plans: renamePlans,
    delete_plans: deletePlans,
    skipped,
    sqlPreviewPath: outSql,
  };

  writeFileSync(outJson, JSON.stringify(report, null, 2), "utf8");
  writeFileSync(outSql, sqlText, "utf8");

  const csvLines = [
    [
      "strategy",
      "bad_name",
      "canonical_name",
      "matched_by_rule",
      "repair_pass",
      "skip_reason",
    ].join(","),
  ];
  for (const p of mergePlans) {
    csvLines.push(
      [
        csvEscape(p.strategy),
        csvEscape(p.bad_name),
        csvEscape(p.canonical_name),
        csvEscape(p.matched_by_rule),
        p.repair_pass ?? "",
        "",
      ].join(",")
    );
  }
  for (const p of renamePlans) {
    csvLines.push(
      [
        csvEscape(p.strategy),
        csvEscape(p.bad_name),
        csvEscape(p.canonical_name),
        csvEscape(p.matched_by_rule),
        p.repair_pass ?? "",
        "",
      ].join(",")
    );
  }
  for (const p of deletePlans) {
    csvLines.push(
      [
        csvEscape(p.strategy),
        csvEscape(p.bad_name),
        "",
        csvEscape(p.matched_by_rule),
        "",
        "",
      ].join(",")
    );
  }
  for (const s of skipped) {
    csvLines.push(
      [
        "skip_manual",
        csvEscape(s.original_name),
        csvEscape(s.canonical_key ?? ""),
        csvEscape(s.preview?.matched_by_rule ?? ""),
        "",
        csvEscape(s.reason),
      ].join(",")
    );
  }
  writeFileSync(outCsv, csvLines.join("\n"), "utf8");

  const mdPath = resolve(frontendRoot, "..", "db", "SCRYFALL_CACHE_CLEANUP_SQL_PREVIEW.md");
  const md = [
    `# scryfall_cache cleanup — SQL plan preview (operator)`,
    ``,
    `Generated by \`frontend/scripts/preview-scryfall-cache-sql-plan.mjs\`. **Does not run SQL**; outputs local files only.`,
    ``,
    `## Latest run summary`,
    ``,
    `| Count | Value |`,
    `|--------|--------|`,
    `| merge_then_delete_bad_row | ${summary.merge_then_delete_bad_row} |`,
    `| rename_row_to_canonical | ${summary.rename_row_to_canonical} |`,
    `| delete_candidate | ${summary.delete_candidate} |`,
    `| skipped_unsafe | ${summary.skipped_unsafe} |`,
    ``,
    `## Outputs (under \`frontend/tmp/\` by default)`,
    ``,
    `- \`scryfall-cache-sql-plan.json\` — full plan + skipped rows`,
    `- \`scryfall-cache-sql-plan.csv\` — flat table`,
    `- \`scryfall-cache-sql-plan.sql\` — \`BEGIN\` … sections A–D … \`ROLLBACK\``,
    ``,
    `## Strategy rules`,
    ``,
    `- **merge_then_delete_bad_row:** bad PK exists, canonical PK exists; merge null/empty fields from bad into canonical, then delete bad.`,
    `- **rename_row_to_canonical:** bad PK exists, canonical PK does not; \`UPDATE\` \`name\` / \`name_norm\` to canonical key.`,
    `- **delete_candidate:** preview marked delete + row still in DB.`,
    `- **skipped_unsafe:** missing bad row, empty target, or bad equals canonical key.`,
    ``,
    `Merge columns match conservative rules in the script (same spirit as \`mergeScryfallCacheRowFromApiCard\`).`,
    ``,
  ].join("\n");
  writeFileSync(mdPath, md, "utf8");

  console.log("");
  console.log("=== SQL plan summary (preview only) ===");
  console.log(`merge_then_delete_bad_row:  ${summary.merge_then_delete_bad_row}`);
  console.log(`rename_row_to_canonical:    ${summary.rename_row_to_canonical}`);
  console.log(`delete_candidate:           ${summary.delete_candidate}`);
  console.log(`skipped_unsafe:             ${summary.skipped_unsafe}`);
  console.log("");
  console.log(`Wrote JSON: ${outJson}`);
  console.log(`Wrote CSV:  ${outCsv}`);
  console.log(`Wrote SQL:  ${outSql}`);
  console.log(`Wrote MD:   ${mdPath}`);

  const sample = (arr, n = 5) => arr.slice(0, n);
  console.log("");
  console.log("Samples — merge_then_delete_bad_row:");
  for (const x of sample(mergePlans)) {
    console.log(`  ${x.bad_name} → ${x.canonical_name}`);
  }
  console.log("Samples — rename_row_to_canonical:");
  for (const x of sample(renamePlans)) {
    console.log(`  ${x.bad_name} → ${x.canonical_name}`);
  }
  console.log("Samples — delete_candidate:");
  for (const x of sample(deletePlans)) {
    console.log(`  ${x.bad_name}`);
  }
  console.log("Samples — skipped_unsafe:");
  for (const x of sample(skipped)) {
    console.log(`  ${x.original_name} (${x.reason})`);
  }

  console.log("");
  console.log("[preview-scryfall-cache-sql-plan] END (ok)");
}

main().catch((err) => {
  console.error("[preview-scryfall-cache-sql-plan] FAILED:", err?.message || err);
  process.exit(1);
});
