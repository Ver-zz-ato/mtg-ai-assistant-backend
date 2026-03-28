#!/usr/bin/env node
/**
 * SAFE preview SQL for deterministic repairs from scryfall-cache-cleanup-preview.json only.
 * - Rows: proposed_action === repair_to_canonical (excludes manual_review, delete_candidate, etc.)
 * - Target PK: normalizeScryfallCacheName(proposed_target_name)
 * - READ-ONLY Supabase SELECT → merge_then_delete_bad_row vs rename_row_to_canonical
 * - Does NOT execute SQL.
 *
 * Inputs (defaults under frontend/tmp/):
 *   --preview-json   scryfall-cache-cleanup-preview.json (required rows)
 *   --audit-json     scryfall-cache-name-audit.json (metadata only in output JSON)
 *
 * Outputs:
 *   db/preview_scryfall_cache_cleanup_preview_repairs_safe.sql
 *   db/preview_scryfall_cache_cleanup_preview_repairs_safe.json
 *
 * Run (from frontend/):
 *   npm run generate:preview-scryfall-cache-cleanup-repairs-safe
 *
 * LOCKSTEP: normalizeScryfallCacheName matches frontend/lib/server/scryfallCacheRow.ts
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");
const repoRoot = resolve(frontendRoot, "..");

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
  let auditJson = join(frontendRoot, "tmp", "scryfall-cache-name-audit.json");
  let outSql = join(repoRoot, "db", "preview_scryfall_cache_cleanup_preview_repairs_safe.sql");
  let outJson = join(repoRoot, "db", "preview_scryfall_cache_cleanup_preview_repairs_safe.json");
  for (const a of argv) {
    if (a.startsWith("--preview-json=")) previewJson = resolve(a.slice("--preview-json=".length));
    else if (a.startsWith("--audit-json=")) auditJson = resolve(a.slice("--audit-json=".length));
    else if (a.startsWith("--out-sql=")) outSql = resolve(a.slice("--out-sql=".length));
    else if (a.startsWith("--out-json=")) outJson = resolve(a.slice("--out-json=".length));
  }
  return { previewJson, auditJson, outSql, outJson };
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
  const list = [...new Set(names)].filter(Boolean);
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
  const { previewJson, auditJson, outSql, outJson } = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error(
      "[cleanup-repairs-safe] Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY."
    );
    process.exit(1);
  }

  if (!existsSync(previewJson)) {
    console.error(`[cleanup-repairs-safe] Preview JSON not found: ${previewJson}`);
    process.exit(1);
  }

  const previewDoc = JSON.parse(readFileSync(previewJson, "utf8"));
  const allRows = previewDoc.rows;
  if (!Array.isArray(allRows)) {
    console.error("[cleanup-repairs-safe] Expected preview.rows[]");
    process.exit(1);
  }

  let auditSummary = null;
  if (existsSync(auditJson)) {
    try {
      const audit = JSON.parse(readFileSync(auditJson, "utf8"));
      auditSummary = {
        unmatchedCount: audit.unmatchedCount ?? null,
        categoryCounts: audit.categoryCounts ?? null,
      };
    } catch {
      auditSummary = null;
    }
  }

  const repairsRaw = allRows.filter((r) => r?.proposed_action === "repair_to_canonical");

  const parsed = [];
  for (const r of repairsRaw) {
    const bad = String(r.original_name ?? "");
    const rawTarget = r.proposed_target_name;
    if (!bad || rawTarget == null || String(rawTarget).trim() === "") continue;
    const targetPk = normalizeScryfallCacheName(String(rawTarget));
    if (!targetPk) continue;
    parsed.push({
      original_name: bad,
      proposed_target_pk: targetPk,
      preview: {
        category: r.category ?? null,
        confidence: r.confidence ?? null,
        reason: r.reason ?? null,
        repair_pass: r.repair_pass ?? null,
        matched_by_rule: r.matched_by_rule ?? null,
      },
    });
  }

  const byPk = new Map();
  for (const p of parsed) {
    if (!byPk.has(p.proposed_target_pk)) byPk.set(p.proposed_target_pk, []);
    byPk.get(p.proposed_target_pk).push(p);
  }

  const repairsDeduped = [];
  const skippedDuplicatePk = [];
  for (const [pk, list] of byPk) {
    const sorted = [...list].sort((a, b) => a.original_name.localeCompare(b.original_name));
    repairsDeduped.push(sorted[0]);
    for (let i = 1; i < sorted.length; i++) {
      skippedDuplicatePk.push({
        original_name: sorted[i].original_name,
        reason: "duplicate_proposed_target_pk",
        detail: `target_pk=${pk}; kept ${sorted[0].original_name}`,
      });
    }
  }

  const noopSkipped = [];
  const repairsFinal = [];
  for (const p of repairsDeduped) {
    if (p.original_name === p.proposed_target_pk) {
      noopSkipped.push({
        original_name: p.original_name,
        reason: "bad_equals_target_pk",
        detail: p.proposed_target_pk,
      });
      continue;
    }
    repairsFinal.push(p);
  }

  const toFetch = new Set();
  for (const p of repairsFinal) {
    toFetch.add(p.original_name);
    toFetch.add(p.proposed_target_pk);
  }

  console.log(
    `[cleanup-repairs-safe] Deterministic repairs in preview: ${repairsRaw.length}; after dedupe/noop: ${repairsFinal.length}; fetching ${toFetch.size} PKs...`
  );

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const dbByName = await fetchRowsByNames(supabase, [...toFetch]);
  console.log(`[cleanup-repairs-safe] Rows loaded from DB: ${dbByName.size}`);

  const mergePlans = [];
  const mergeBadNames = [];
  const renamePlans = [];
  const skippedUnsafe = [...skippedDuplicatePk, ...noopSkipped];

  for (const p of repairsFinal) {
    const bad = p.original_name;
    const canonPk = p.proposed_target_pk;
    const badRow = dbByName.get(bad);
    if (!badRow) {
      skippedUnsafe.push({
        original_name: bad,
        reason: "repair_bad_row_not_in_database",
        detail: canonPk,
        preview: p.preview,
      });
      continue;
    }

    const canonRow = dbByName.get(canonPk);
    if (canonRow) {
      mergePlans.push({
        strategy: "merge_then_delete_bad_row",
        bad_name: bad,
        canonical_name: canonPk,
        preview: p.preview,
      });
      mergeBadNames.push(bad);
    } else {
      renamePlans.push({
        strategy: "rename_row_to_canonical",
        bad_name: bad,
        canonical_name: canonPk,
        preview: p.preview,
      });
    }
  }

  const previewNames = new Set();
  for (const x of mergePlans) {
    previewNames.add(x.bad_name);
    previewNames.add(x.canonical_name);
  }
  for (const x of renamePlans) {
    previewNames.add(x.bad_name);
  }

  const sqlParts = [];
  sqlParts.push(`-- =============================================================================`);
  sqlParts.push(`-- preview_scryfall_cache_cleanup_preview_repairs_safe.sql`);
  sqlParts.push(`-- READ-ONLY PREVIEW — BEGIN/ROLLBACK`);
  sqlParts.push(`-- Source preview: ${previewJson}`);
  sqlParts.push(`-- Filter: proposed_action = repair_to_canonical only (no manual_review)`);
  sqlParts.push(`-- PK: normalizeScryfallCacheName(proposed_target_name)`);
  sqlParts.push(`-- merge_then_delete_bad_row: ${mergePlans.length}`);
  sqlParts.push(`-- rename_row_to_canonical: ${renamePlans.length}`);
  sqlParts.push(`-- skipped_unsafe: ${skippedUnsafe.length}`);
  sqlParts.push(`-- =============================================================================`);
  sqlParts.push(``);
  sqlParts.push(`BEGIN;`);
  sqlParts.push(``);

  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  sqlParts.push(`-- Section A — Preview SELECTs`);
  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  if (previewNames.size) {
    const arr = [...previewNames].sort();
    sqlParts.push(`SELECT * FROM public.scryfall_cache WHERE name IN (${arr.map(sqlStringLiteral).join(", ")});`);
  } else {
    sqlParts.push(`-- (no PKs in scope)`);
  }
  sqlParts.push(``);

  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  sqlParts.push(`-- Section B — Merge (canonical row exists)`);
  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  for (const p of mergePlans) {
    sqlParts.push(`-- merge: bad=${p.bad_name} → canonical_pk=${p.canonical_name}`);
    sqlParts.push(buildMergeUpdateSql(p.bad_name, p.canonical_name));
  }

  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  sqlParts.push(`-- Section C — Delete merged bad rows`);
  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  for (const name of mergeBadNames) {
    sqlParts.push(`-- delete merged bad: ${name}`);
    sqlParts.push(buildDeleteSql(name));
  }

  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  sqlParts.push(`-- Section D — Rename (no existing canonical row)`);
  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  for (const p of renamePlans) {
    sqlParts.push(`-- rename: ${p.bad_name} → ${p.canonical_name}`);
    sqlParts.push(buildRenameSql(p.bad_name, p.canonical_name));
  }

  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  sqlParts.push(`-- Section E — (none: deterministic preview repairs only)`);
  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  sqlParts.push(``);

  sqlParts.push(`ROLLBACK;`);
  sqlParts.push(``);
  sqlParts.push(`-- End preview`);

  mkdirSync(dirname(outSql), { recursive: true });
  writeFileSync(outSql, sqlParts.join("\n"), "utf8");

  const report = {
    generatedAt: new Date().toISOString(),
    sourcePreviewPath: previewJson,
    sourceAuditPath: existsSync(auditJson) ? auditJson : null,
    auditSummary,
    previewSummary: previewDoc.summary ?? null,
    summary: {
      repair_to_canonical_in_preview: repairsRaw.length,
      merge_then_delete_bad_row: mergePlans.length,
      rename_row_to_canonical: renamePlans.length,
      skipped_unsafe: skippedUnsafe.length,
    },
    merge_plans: mergePlans,
    rename_plans: renamePlans,
    skipped_unsafe: skippedUnsafe,
  };
  writeFileSync(outJson, JSON.stringify(report, null, 2), "utf8");

  console.log("");
  console.log("=== cleanup preview repairs — safe SQL (normalized PK) ===");
  console.log(`merge_then_delete_bad_row:  ${mergePlans.length}`);
  console.log(`rename_row_to_canonical:    ${renamePlans.length}`);
  console.log(`skipped_unsafe:             ${skippedUnsafe.length}`);
  console.log("");
  console.log(`Wrote SQL:  ${outSql}`);
  console.log(`Wrote JSON: ${outJson}`);
  console.log("[cleanup-repairs-safe] END (ok)");
}

main().catch((e) => {
  console.error("[cleanup-repairs-safe] FAILED:", e?.message || e);
  process.exit(1);
});
