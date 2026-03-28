#!/usr/bin/env node
/**
 * READ-ONLY: final safe SQL plan after a committed batch (or any DB state).
 *
 * Reads:
 *   - tmp/scryfall-cache-name-audit.json (current unmatched PKs from latest audit)
 *   - tmp/scryfall-cache-cleanup-preview.json (mapper output)
 * Queries Supabase for involved rows (SELECT only).
 *
 * Includes only:
 *   - repair_to_canonical + delete_candidate rows whose original_name is still in
 *     the CURRENT audit unmatched list (excludes already-fixed / deleted PKs)
 *   - Same merge/rename/delete classification as preview-scryfall-cache-sql-plan.mjs
 * Excludes: manual_review, preview rows not in audit, unsafe skips (missing bad row, etc.)
 *
 * Output: tmp/scryfall-cache-sql-plan-final-safe.sql (ends with ROLLBACK;)
 *
 * Run: npm run preview:scryfall-cache-sql-plan-final-safe
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
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
  let auditJson = join(frontendRoot, "tmp", "scryfall-cache-name-audit.json");
  let previewJson = join(frontendRoot, "tmp", "scryfall-cache-cleanup-preview.json");
  let outSql = join(frontendRoot, "tmp", "scryfall-cache-sql-plan-final-safe.sql");
  let outJson = join(frontendRoot, "tmp", "scryfall-cache-sql-plan-final-safe.json");
  for (const a of argv) {
    if (a.startsWith("--audit-json=")) auditJson = resolve(a.slice("--audit-json=".length));
    else if (a.startsWith("--preview-json=")) previewJson = resolve(a.slice("--preview-json=".length));
    else if (a.startsWith("--out-sql=")) outSql = resolve(a.slice("--out-sql=".length));
    else if (a.startsWith("--out-json=")) outJson = resolve(a.slice("--out-json=".length));
  }
  return { auditJson, previewJson, outSql, outJson };
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
  const { auditJson, previewJson, outSql, outJson } = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error(
      "[final-safe] Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY."
    );
    process.exit(1);
  }

  if (!existsSync(auditJson)) {
    console.error(`[final-safe] Audit file not found: ${auditJson}`);
    process.exit(1);
  }
  if (!existsSync(previewJson)) {
    console.error(`[final-safe] Preview file not found: ${previewJson}`);
    process.exit(1);
  }

  const audit = JSON.parse(readFileSync(auditJson, "utf8"));
  const unmatchedList = audit.unmatched;
  if (!Array.isArray(unmatchedList)) {
    console.error("[final-safe] Audit JSON: expected unmatched[]");
    process.exit(1);
  }
  const auditUnmatched = new Set(unmatchedList.map((u) => String(u.name)));

  const preview = JSON.parse(readFileSync(previewJson, "utf8"));
  const allRows = preview.rows || [];
  if (!Array.isArray(allRows)) {
    console.error("[final-safe] Preview JSON: expected rows[]");
    process.exit(1);
  }

  let excludedManualReview = 0;
  let excludedNotInAudit = 0;

  const filteredRows = [];
  for (const r of allRows) {
    const action = r.proposed_action;
    if (action === "manual_review") {
      excludedManualReview++;
      continue;
    }
    if (action !== "repair_to_canonical" && action !== "delete_candidate") {
      continue;
    }
    const orig = String(r.original_name);
    if (!auditUnmatched.has(orig)) {
      excludedNotInAudit++;
      continue;
    }
    filteredRows.push(r);
  }

  const toFetch = new Set();
  for (const r of filteredRows) {
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
    `[final-safe] Audit unmatched: ${auditUnmatched.size}; preview rows after audit filter: ${filteredRows.length}; fetching ${toFetch.size} PKs...`
  );

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const dbByName = await fetchRowsByNames(supabase, toFetch);
  console.log(`[final-safe] Rows fetched from DB: ${dbByName.size}`);

  const mergePlans = [];
  const mergeBadNames = [];
  const renamePlans = [];
  const deletePlans = [];
  const skippedUnsafe = [];

  for (const r of filteredRows) {
    if (r.proposed_action === "repair_to_canonical") {
      const bad = String(r.original_name);
      const targetRaw = r.proposed_target_name;
      const normTarget = normalizeScryfallCacheName(targetRaw);
      if (!normTarget) {
        skippedUnsafe.push({ original_name: bad, reason: "skip_empty_target", preview: r });
        continue;
      }
      if (bad === normTarget) {
        skippedUnsafe.push({ original_name: bad, reason: "skip_bad_equals_canonical_key", preview: r });
        continue;
      }

      const badRow = dbByName.get(bad);
      const canonRow = dbByName.get(normTarget);

      if (!badRow) {
        skippedUnsafe.push({
          original_name: bad,
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
        skippedUnsafe.push({ original_name: bad, reason: "missing_bad_row", preview: r });
        continue;
      }
      deletePlans.push({
        strategy: "delete_candidate",
        bad_name: bad,
        matched_by_rule: r.matched_by_rule ?? null,
      });
    }
  }

  const sqlParts = [];
  sqlParts.push(`-- =============================================================================`);
  sqlParts.push(`-- scryfall_cache — FINAL SAFE SQL PREVIEW (not executed)`);
  sqlParts.push(`-- Generated: ${new Date().toISOString()}`);
  sqlParts.push(`-- Audit: ${auditJson}`);
  sqlParts.push(`-- Preview: ${previewJson}`);
  sqlParts.push(`-- Filter: original_name must be in current audit unmatched; manual_review excluded.`);
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
  mkdirSync(dirname(outSql), { recursive: true });
  writeFileSync(outSql, sqlText, "utf8");

  const report = {
    generatedAt: new Date().toISOString(),
    sourceAuditPath: auditJson,
    sourcePreviewPath: previewJson,
    summary: {
      audit_unmatched_count: auditUnmatched.size,
      preview_excluded_manual_review: excludedManualReview,
      preview_excluded_not_in_current_audit: excludedNotInAudit,
      merge_then_delete_bad_row: mergePlans.length,
      rename_row_to_canonical: renamePlans.length,
      delete_candidate: deletePlans.length,
      skipped_unsafe_after_db: skippedUnsafe.length,
    },
    merge_plans: mergePlans,
    rename_plans: renamePlans,
    delete_plans: deletePlans,
    skipped_unsafe: skippedUnsafe,
  };
  writeFileSync(outJson, JSON.stringify(report, null, 2), "utf8");

  const s = report.summary;
  console.log("");
  console.log("=== final-safe SQL plan (preview only) ===");
  console.log(`audit_unmatched_count:              ${s.audit_unmatched_count}`);
  console.log(`preview excluded (manual_review):   ${s.preview_excluded_manual_review}`);
  console.log(`preview excluded (not in audit):     ${s.preview_excluded_not_in_current_audit}`);
  console.log(`merge_then_delete_bad_row:          ${s.merge_then_delete_bad_row}`);
  console.log(`rename_row_to_canonical:            ${s.rename_row_to_canonical}`);
  console.log(`delete_candidate:                   ${s.delete_candidate}`);
  console.log(`skipped_unsafe (missing row, etc.): ${s.skipped_unsafe_after_db}`);
  console.log("");
  console.log(`Wrote SQL: ${outSql}`);
  console.log(`Wrote JSON: ${outJson}`);
  console.log("");
  console.log("[final-safe] END (ok)");
}

main().catch((err) => {
  console.error("[final-safe] FAILED:", err?.message || err);
  process.exit(1);
});
