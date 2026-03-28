#!/usr/bin/env node
/**
 * SAFE preview SQL for AI-reviewed scryfall_cache cleanup.
 * - Target PKs use normalizeScryfallCacheName (lowercase canonical), never display case.
 * - READ-ONLY Supabase SELECT to decide merge vs rename.
 * - Does NOT execute SQL.
 *
 * Input:  tmp/scryfall-cache-ai-reviewed.json
 * Output: db/preview_scryfall_cache_ai_cleanup_safe.sql
 *         db/preview_scryfall_cache_ai_cleanup_safe.json
 *
 * Run (from frontend/):
 *   node scripts/generate-preview-scryfall-cache-ai-cleanup-safe.mjs
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
  let inputJson = join(frontendRoot, "tmp", "scryfall-cache-ai-reviewed.json");
  let outSql = join(repoRoot, "db", "preview_scryfall_cache_ai_cleanup_safe.sql");
  let outJson = join(repoRoot, "db", "preview_scryfall_cache_ai_cleanup_safe.json");
  for (const a of argv) {
    if (a.startsWith("--input=")) inputJson = resolve(a.slice("--input=".length));
    else if (a.startsWith("--out-sql=")) outSql = resolve(a.slice("--out-sql=".length));
    else if (a.startsWith("--out-json=")) outJson = resolve(a.slice("--out-json=".length));
  }
  return { inputJson, outSql, outJson };
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
  const { inputJson, outSql, outJson } = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error(
      "[ai-cleanup-safe] Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY."
    );
    process.exit(1);
  }

  if (!existsSync(inputJson)) {
    console.error(`[ai-cleanup-safe] Input not found: ${inputJson}`);
    process.exit(1);
  }

  const doc = JSON.parse(readFileSync(inputJson, "utf8"));
  const rows = doc.rows;
  if (!Array.isArray(rows)) {
    console.error("[ai-cleanup-safe] Expected rows[]");
    process.exit(1);
  }

  /** @type {{ original_name: string, proposed_target_display: string, proposed_target_pk: string, reason?: string }[]} */
  const repairsRaw = [];
  /** @type {{ original_name: string, reason?: string }[]} */
  const deletesRaw = [];
  let omittedNoConfidence = 0;
  let omittedLowConfidence = 0;

  for (const r of rows) {
    const c = r.classification;
    const conf = r.confidence;
    if (c !== "repair_to_canonical" && c !== "delete_candidate") continue;
    if (conf !== "high") {
      if (conf === "medium" || conf === "low") omittedLowConfidence++;
      else omittedNoConfidence++;
      continue;
    }

    const orig = String(r.original_name ?? "");
    if (!orig) continue;

    if (c === "delete_candidate") {
      deletesRaw.push({ original_name: orig, reason: r.reason });
      continue;
    }

    const display = String(r.proposed_target_name ?? "").trim();
    if (!display) continue;
    const pk = normalizeScryfallCacheName(display);
    if (!pk) continue;
    repairsRaw.push({
      original_name: orig,
      proposed_target_display: display,
      proposed_target_pk: pk,
      reason: r.reason,
    });
  }

  // Deduplicate by canonical target PK (first bad name wins)
  const byPk = new Map();
  for (const r of repairsRaw) {
    if (!byPk.has(r.proposed_target_pk)) byPk.set(r.proposed_target_pk, []);
    byPk.get(r.proposed_target_pk).push(r);
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
  for (const r of repairsDeduped) {
    if (r.original_name === r.proposed_target_pk) {
      noopSkipped.push({
        original_name: r.original_name,
        reason: "bad_equals_target_pk",
        detail: r.proposed_target_pk,
      });
      continue;
    }
    repairsFinal.push(r);
  }

  const toFetch = new Set();
  for (const r of repairsFinal) {
    toFetch.add(r.original_name);
    toFetch.add(r.proposed_target_pk);
  }
  for (const d of deletesRaw) toFetch.add(d.original_name);

  console.log(`[ai-cleanup-safe] Fetching ${toFetch.size} PKs from scryfall_cache...`);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const dbByName = await fetchRowsByNames(supabase, [...toFetch]);
  console.log(`[ai-cleanup-safe] Rows loaded: ${dbByName.size}`);

  const mergePlans = [];
  const mergeBadNames = [];
  const renamePlans = [];
  const skippedUnsafe = [...skippedDuplicatePk, ...noopSkipped];

  /** @type {{ original_name: string, proposed_target_display: string, proposed_target_pk: string, strategy: string }[]} */
  const sampleMappings = [];

  for (const r of repairsFinal) {
    const bad = r.original_name;
    const canonPk = r.proposed_target_pk;
    const badRow = dbByName.get(bad);
    if (!badRow) {
      skippedUnsafe.push({
        original_name: bad,
        reason: "repair_bad_row_not_in_database",
        detail: canonPk,
      });
      continue;
    }

    const canonRow = dbByName.get(canonPk);
    let strategy;
    if (canonRow) {
      mergePlans.push({
        strategy: "merge_then_delete_bad_row",
        bad_name: bad,
        canonical_name: canonPk,
        proposed_target_display: r.proposed_target_display,
      });
      mergeBadNames.push(bad);
      strategy = "merge_then_delete_bad_row";
    } else {
      renamePlans.push({
        strategy: "rename_row_to_canonical",
        bad_name: bad,
        canonical_name: canonPk,
        proposed_target_display: r.proposed_target_display,
      });
      strategy = "rename_row_to_canonical";
    }

    sampleMappings.push({
      original_name: bad,
      proposed_target_display: r.proposed_target_display,
      proposed_target_pk: canonPk,
      strategy,
    });
  }

  const deletePlans = [];
  for (const d of deletesRaw) {
    const bad = d.original_name;
    if (!dbByName.get(bad)) {
      skippedUnsafe.push({
        original_name: bad,
        reason: "delete_row_not_in_database",
        detail: d.reason ?? "",
      });
      continue;
    }
    deletePlans.push({ original_name: bad, reason: d.reason });
  }

  // Preview SELECT: all PKs touched
  const previewNames = new Set();
  for (const p of mergePlans) {
    previewNames.add(p.bad_name);
    previewNames.add(p.canonical_name);
  }
  for (const p of renamePlans) {
    previewNames.add(p.bad_name);
  }
  for (const p of deletePlans) previewNames.add(p.original_name);

  const sqlParts = [];
  sqlParts.push(`-- =============================================================================`);
  sqlParts.push(`-- preview_scryfall_cache_ai_cleanup_safe.sql`);
  sqlParts.push(`-- READ-ONLY PREVIEW — transaction rolled back at end`);
  sqlParts.push(`-- Source: ${inputJson}`);
  sqlParts.push(`-- Rules: repair/delete + confidence high; name/name_norm use normalizeScryfallCacheName (lowercase PK)`);
  sqlParts.push(`-- merge_then_delete_bad_row: ${mergePlans.length}`);
  sqlParts.push(`-- rename_row_to_canonical: ${renamePlans.length}`);
  sqlParts.push(`-- delete_candidate: ${deletePlans.length}`);
  sqlParts.push(`-- skipped_unsafe: ${skippedUnsafe.length}`);
  sqlParts.push(`-- =============================================================================`);
  sqlParts.push(``);
  sqlParts.push(`BEGIN;`);
  sqlParts.push(``);

  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  sqlParts.push(`-- Section A — Preview SELECTs (rows referenced by this plan)`);
  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  if (previewNames.size) {
    const arr = [...previewNames].sort();
    sqlParts.push(`SELECT * FROM public.scryfall_cache WHERE name IN (${arr.map(sqlStringLiteral).join(", ")});`);
  } else {
    sqlParts.push(`-- (no PKs in scope)`);
  }
  sqlParts.push(``);

  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  sqlParts.push(`-- Section B — Merge: fill nulls on canonical row from bad row, then delete bad in Section C`);
  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  for (const p of mergePlans) {
    sqlParts.push(
      `-- merge: bad=${p.bad_name} → canonical_pk=${p.canonical_name} (display: ${p.proposed_target_display.replace(/\r?\n/g, " ").slice(0, 120)})`
    );
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
  sqlParts.push(`-- Section D — Rename bad row to canonical PK (no existing canonical row)`);
  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  for (const p of renamePlans) {
    sqlParts.push(
      `-- rename: ${p.bad_name} → ${p.canonical_name} (display: ${p.proposed_target_display.replace(/\r?\n/g, " ").slice(0, 120)})`
    );
    sqlParts.push(buildRenameSql(p.bad_name, p.canonical_name));
  }

  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  sqlParts.push(`-- Section E — Pure deletes (delete_candidate, high confidence)`);
  sqlParts.push(`-- -----------------------------------------------------------------------------`);
  for (const p of deletePlans) {
    sqlParts.push(`-- delete: ${p.original_name}`);
    if (p.reason) sqlParts.push(`--   ${String(p.reason).replace(/\r?\n/g, " ").slice(0, 200)}`);
    sqlParts.push(buildDeleteSql(p.original_name));
  }

  sqlParts.push(`ROLLBACK;`);
  sqlParts.push(``);
  sqlParts.push(`-- End preview`);

  mkdirSync(dirname(outSql), { recursive: true });
  writeFileSync(outSql, sqlParts.join("\n"), "utf8");

  const report = {
    generatedAt: new Date().toISOString(),
    sourceInput: inputJson,
    summary: {
      merge_then_delete_bad_row: mergePlans.length,
      rename_row_to_canonical: renamePlans.length,
      delete_candidate: deletePlans.length,
      skipped_unsafe: skippedUnsafe.length,
      omitted_low_or_missing_confidence: omittedNoConfidence + omittedLowConfidence,
    },
    merge_plans: mergePlans,
    rename_plans: renamePlans,
    delete_plans: deletePlans,
    skipped_unsafe: skippedUnsafe,
    sample_mappings: sampleMappings,
  };
  writeFileSync(outJson, JSON.stringify(report, null, 2), "utf8");

  console.log("");
  console.log("=== scryfall_cache AI cleanup SAFE preview (normalized PK) ===");
  console.log(`merge_then_delete_bad_row:  ${mergePlans.length}`);
  console.log(`rename_row_to_canonical:    ${renamePlans.length}`);
  console.log(`delete_candidate:           ${deletePlans.length}`);
  console.log(`skipped_unsafe:             ${skippedUnsafe.length}`);
  console.log("");
  console.log("Sample mappings (original_name | proposed_target_display | proposed_target_pk | strategy):");
  for (const m of sampleMappings.slice(0, 15)) {
    console.log(`  ${m.original_name} | ${m.proposed_target_display} | ${m.proposed_target_pk} | ${m.strategy}`);
  }
  if (sampleMappings.length > 15) console.log(`  … +${sampleMappings.length - 15} more in JSON`);
  console.log("");
  console.log(`Wrote SQL:  ${outSql}`);
  console.log(`Wrote JSON: ${outJson}`);
  console.log("[ai-cleanup-safe] END (ok)");
}

main().catch((e) => {
  console.error("[ai-cleanup-safe] FAILED:", e?.message || e);
  process.exit(1);
});
