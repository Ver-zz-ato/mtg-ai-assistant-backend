#!/usr/bin/env node
/**
 * PREVIEW-ONLY SQL from AI-reviewed "remaining" JSON (unified pipeline).
 * Normalized PKs; merge vs rename decided by read-only Supabase (same as other safe plans).
 * BEGIN / ROLLBACK; no execution.
 *
 * Input (default): tmp/scryfall-cache-remaining-ai-reviewed.json
 *   Flexible row shape: final_action | recommended_action | classification | heuristic.recommended_action
 *   Target: proposed_target_pk | normalize(proposed_target_name) | candidates[0].normalized_pk
 *
 * Outputs:
 *   db/preview_scryfall_cache_remaining_ai_reviewed.sql
 *   db/preview_scryfall_cache_remaining_ai_reviewed.json
 *
 * Run (from frontend/):
 *   npm run generate:preview-scryfall-cache-remaining-ai-reviewed-sql
 *
 * LOCKSTEP: normalizeScryfallCacheName → frontend/lib/server/scryfallCacheRow.ts
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
  let inputJson = join(frontendRoot, "tmp", "scryfall-cache-remaining-ai-reviewed.json");
  let outSql = join(repoRoot, "db", "preview_scryfall_cache_remaining_ai_reviewed.sql");
  let outJson = join(repoRoot, "db", "preview_scryfall_cache_remaining_ai_reviewed.json");
  let highConfidenceOnly = false;
  for (const a of argv) {
    if (a.startsWith("--input=")) inputJson = resolve(a.slice("--input=".length));
    else if (a.startsWith("--out-sql=")) outSql = resolve(a.slice("--out-sql=".length));
    else if (a.startsWith("--out-json=")) outJson = resolve(a.slice("--out-json=".length));
    else if (a === "--high-confidence-only") highConfidenceOnly = true;
  }
  return { inputJson, outSql, outJson, highConfidenceOnly };
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

function extractRows(doc) {
  if (Array.isArray(doc)) return doc;
  if (Array.isArray(doc.rows)) return doc.rows;
  if (Array.isArray(doc.reviewed_rows)) return doc.reviewed_rows;
  return [];
}

function rowAction(r) {
  const h = r.heuristic && typeof r.heuristic === "object" ? r.heuristic : null;
  return (
    r.final_action ||
    r.recommended_action ||
    r.classification ||
    (h && h.recommended_action) ||
    r.proposed_action ||
    ""
  );
}

function rowConfidence(r) {
  const h = r.heuristic && typeof r.heuristic === "object" ? r.heuristic : null;
  return r.confidence || (h && h.confidence) || null;
}

function rowOriginalName(r) {
  return String(r.original_name ?? r.name ?? "").trim();
}

function rowTargetPk(r) {
  if (r.proposed_target_pk != null && String(r.proposed_target_pk).trim() !== "") {
    return normalizeScryfallCacheName(String(r.proposed_target_pk));
  }
  if (r.proposed_target_name != null && String(r.proposed_target_name).trim() !== "") {
    return normalizeScryfallCacheName(String(r.proposed_target_name));
  }
  const c0 = Array.isArray(r.candidates) ? r.candidates[0] : null;
  if (c0?.normalized_pk) return normalizeScryfallCacheName(String(c0.normalized_pk));
  return "";
}

async function main() {
  loadEnvFromDisk();
  const { inputJson, outSql, outJson, highConfidenceOnly } = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error(
      "[remaining-reviewed-sql] Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY."
    );
    process.exit(1);
  }

  if (!existsSync(inputJson)) {
    console.error(`[remaining-reviewed-sql] Input not found: ${inputJson}`);
    process.exit(1);
  }

  const doc = JSON.parse(readFileSync(inputJson, "utf8"));
  const rawRows = extractRows(doc);

  const repairs = [];
  const deletes = [];
  const skippedParse = [];

  for (const r of rawRows) {
    const action = String(rowAction(r)).trim();
    const bad = rowOriginalName(r);
    if (!bad) {
      skippedParse.push({ reason: "missing original_name" });
      continue;
    }

    if (action === "delete_candidate") {
      if (highConfidenceOnly && rowConfidence(r) !== "high") continue;
      deletes.push({ bad_name: bad, confidence: rowConfidence(r), raw: r });
      continue;
    }

    if (action === "merge_then_delete_bad_row" || action === "rename_row_to_canonical") {
      if (highConfidenceOnly && rowConfidence(r) !== "high") continue;
      const pk = rowTargetPk(r);
      if (!pk) {
        skippedParse.push({ original_name: bad, reason: "missing proposed_target_pk" });
        continue;
      }
      repairs.push({
        bad_name: bad,
        target_pk: pk,
        intended_action: action,
        confidence: rowConfidence(r),
        raw: r,
      });
      continue;
    }

    /* keep_real, unsure, manual_keep, etc. — skip */
  }

  const byTarget = new Map();
  for (const p of repairs) {
    if (!byTarget.has(p.target_pk)) byTarget.set(p.target_pk, []);
    byTarget.get(p.target_pk).push(p);
  }

  const repairsDeduped = [];
  const skippedDup = [];
  for (const [pk, list] of byTarget) {
    const sorted = [...list].sort((a, b) => a.bad_name.localeCompare(b.bad_name));
    repairsDeduped.push(sorted[0]);
    for (let i = 1; i < sorted.length; i++) {
      skippedDup.push({
        bad_name: sorted[i].bad_name,
        reason: "duplicate_target_pk",
        detail: pk,
      });
    }
  }

  const toFetch = new Set();
  for (const p of repairsDeduped) {
    toFetch.add(p.bad_name);
    toFetch.add(p.target_pk);
  }
  for (const d of deletes) toFetch.add(d.bad_name);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const dbByName = await fetchRowsByNames(supabase, [...toFetch]);

  const mergePlans = [];
  const mergeBadNames = [];
  const renamePlans = [];
  const skippedUnsafe = [...skippedParse, ...skippedDup];

  for (const p of repairsDeduped) {
    if (p.bad_name === p.target_pk) {
      skippedUnsafe.push({ original_name: p.bad_name, reason: "bad_equals_target_pk" });
      continue;
    }
    const badRow = dbByName.get(p.bad_name);
    if (!badRow) {
      skippedUnsafe.push({
        original_name: p.bad_name,
        reason: "bad_row_not_in_database",
        detail: p.target_pk,
      });
      continue;
    }
    const canonRow = dbByName.get(p.target_pk);
    if (canonRow) {
      mergePlans.push({
        strategy: "merge_then_delete_bad_row",
        bad_name: p.bad_name,
        canonical_name: p.target_pk,
        ai_intended: p.intended_action,
        confidence: p.confidence,
      });
      mergeBadNames.push(p.bad_name);
    } else {
      renamePlans.push({
        strategy: "rename_row_to_canonical",
        bad_name: p.bad_name,
        canonical_name: p.target_pk,
        ai_intended: p.intended_action,
        confidence: p.confidence,
      });
    }
  }

  const deletePlans = [];
  for (const d of deletes) {
    if (!dbByName.get(d.bad_name)) {
      skippedUnsafe.push({
        original_name: d.bad_name,
        reason: "delete_row_not_in_database",
      });
      continue;
    }
    deletePlans.push(d);
  }

  const previewNames = new Set();
  for (const x of mergePlans) {
    previewNames.add(x.bad_name);
    previewNames.add(x.canonical_name);
  }
  for (const x of renamePlans) previewNames.add(x.bad_name);
  for (const d of deletePlans) previewNames.add(d.bad_name);

  const sqlParts = [];
  sqlParts.push(`-- =============================================================================`);
  sqlParts.push(`-- preview_scryfall_cache_remaining_ai_reviewed.sql`);
  sqlParts.push(`-- READ-ONLY PREVIEW — BEGIN/ROLLBACK`);
  sqlParts.push(`-- Source: ${inputJson}`);
  sqlParts.push(`-- high_confidence_only: ${highConfidenceOnly}`);
  sqlParts.push(`-- merge_then_delete_bad_row: ${mergePlans.length}`);
  sqlParts.push(`-- rename_row_to_canonical: ${renamePlans.length}`);
  sqlParts.push(`-- delete_candidate: ${deletePlans.length}`);
  sqlParts.push(`-- skipped_unsafe: ${skippedUnsafe.length}`);
  sqlParts.push(`-- =============================================================================`);
  sqlParts.push(``);
  sqlParts.push(`BEGIN;`);
  sqlParts.push(``);

  sqlParts.push(`-- Section A — Preview SELECTs`);
  sqlParts.push(``);
  if (previewNames.size) {
    const arr = [...previewNames].sort();
    sqlParts.push(`SELECT * FROM public.scryfall_cache WHERE name IN (${arr.map(sqlStringLiteral).join(", ")});`);
  } else {
    sqlParts.push(`-- (empty)`);
  }
  sqlParts.push(``);

  sqlParts.push(`-- Section B — Merge`);
  sqlParts.push(``);
  for (const p of mergePlans) {
    sqlParts.push(`-- merge: ${p.bad_name} → ${p.canonical_name} (ai: ${p.ai_intended})`);
    sqlParts.push(buildMergeUpdateSql(p.bad_name, p.canonical_name));
  }

  sqlParts.push(`-- Section C — Delete merged bad rows`);
  sqlParts.push(``);
  for (const name of mergeBadNames) {
    sqlParts.push(`-- delete merged bad: ${name}`);
    sqlParts.push(buildDeleteSql(name));
  }

  sqlParts.push(`-- Section D — Rename`);
  sqlParts.push(``);
  for (const p of renamePlans) {
    sqlParts.push(`-- rename: ${p.bad_name} → ${p.canonical_name} (ai: ${p.ai_intended})`);
    sqlParts.push(buildRenameSql(p.bad_name, p.canonical_name));
  }

  sqlParts.push(`-- Section E — Deletes`);
  sqlParts.push(``);
  for (const d of deletePlans) {
    sqlParts.push(`-- delete: ${d.bad_name}`);
    sqlParts.push(buildDeleteSql(d.bad_name));
  }

  sqlParts.push(`ROLLBACK;`);
  sqlParts.push(``);

  mkdirSync(dirname(outSql), { recursive: true });
  writeFileSync(outSql, sqlParts.join("\n"), "utf8");

  const report = {
    generatedAt: new Date().toISOString(),
    sourceInput: inputJson,
    highConfidenceOnly,
    summary: {
      merge_then_delete_bad_row: mergePlans.length,
      rename_row_to_canonical: renamePlans.length,
      delete_candidate: deletePlans.length,
      skipped_unsafe: skippedUnsafe.length,
    },
    merge_plans: mergePlans,
    rename_plans: renamePlans,
    delete_plans: deletePlans,
    skipped_unsafe: skippedUnsafe,
  };
  writeFileSync(outJson, JSON.stringify(report, null, 2), "utf8");

  console.log("");
  console.log("=== remaining AI-reviewed → SQL preview ===");
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Wrote: ${outSql}`);
  console.log(`Wrote: ${outJson}`);
  console.log("[remaining-reviewed-sql] END (ok)");
}

main().catch((e) => {
  console.error("[remaining-reviewed-sql] FAILED:", e?.message || e);
  process.exit(1);
});
