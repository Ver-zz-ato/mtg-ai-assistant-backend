#!/usr/bin/env node
/**
 * Final small-bucket review: quoted_name, bracketed_name, import_set_number_junk only.
 * READ-ONLY. Writes review JSON + preview SQL (BEGIN/ROLLBACK); optional Supabase SELECT.
 *
 * Inputs:
 *   tmp/scryfall-cache-name-audit.json
 *   tmp/scryfall-cache-remaining-ai-review.json
 *   tmp/scryfall-cache-remaining-ai-reviewed.json (cross-reference only)
 *
 * Outputs:
 *   tmp/scryfall-cache-final-small-bucket-review.json
 *   db/preview_scryfall_cache_final_small_bucket.sql
 *   db/preview_scryfall_cache_final_small_bucket.json
 *
 * Run: npm run generate:scryfall-cache-final-small-bucket
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");
const repoRoot = resolve(frontendRoot, "..");

const SMALL_BUCKETS = new Set(["quoted_name", "bracketed_name", "import_set_number_junk"]);

function normalizeScryfallCacheName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCurlyQuotesAndSpaces(s) {
  return String(s)
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
    .replace(/[\u00a0\u2000-\u200b\ufeff]/g, " ");
}

function isStrongCandidate(top) {
  if (!top?.match_reason) return false;
  const r = top.match_reason;
  if (r.startsWith("word_overlap")) return false;
  return r.startsWith("exact_pipeline:") || r.startsWith("face_match:");
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
  let reviewJson = join(frontendRoot, "tmp", "scryfall-cache-remaining-ai-review.json");
  let reviewedJson = join(frontendRoot, "tmp", "scryfall-cache-remaining-ai-reviewed.json");
  let outReview = join(frontendRoot, "tmp", "scryfall-cache-final-small-bucket-review.json");
  let outSql = join(repoRoot, "db", "preview_scryfall_cache_final_small_bucket.sql");
  let outSqlJson = join(repoRoot, "db", "preview_scryfall_cache_final_small_bucket.json");
  for (const a of argv) {
    if (a.startsWith("--audit-json=")) auditJson = resolve(a.slice("--audit-json=".length));
    else if (a.startsWith("--review-json=")) reviewJson = resolve(a.slice("--review-json=".length));
    else if (a.startsWith("--reviewed-json=")) reviewedJson = resolve(a.slice("--reviewed-json=".length));
    else if (a.startsWith("--out-review=")) outReview = resolve(a.slice("--out-review=".length));
    else if (a.startsWith("--out-sql=")) outSql = resolve(a.slice("--out-sql=".length));
    else if (a.startsWith("--out-sql-json=")) outSqlJson = resolve(a.slice("--out-sql-json=".length));
  }
  return { auditJson, reviewJson, reviewedJson, outReview, outSql, outSqlJson };
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

/**
 * Conservative: merge | rename | keep_real | unsure only (no delete in this pass).
 */
function classifySmallBucket(exportRow) {
  const original = String(exportRow.original_name ?? "");
  const badPresent = !!exportRow.bad_row;
  const top = exportRow.candidates?.[0];
  const audit_category = exportRow.audit_category ?? null;

  if (!top || !isStrongCandidate(top)) {
    if (!top) {
      return {
        final_action: "unsure",
        confidence: "low",
        proposed_target_pk: null,
        reason: "No candidate from deterministic pipeline / face map",
      };
    }
    return {
      final_action: "unsure",
      confidence: "low",
      proposed_target_pk: top.normalized_pk ?? null,
      reason: "Top candidate is fuzzy word-overlap only; no destructive action",
    };
  }

  if (!badPresent) {
    return {
      final_action: "unsure",
      confidence: "low",
      proposed_target_pk: top.normalized_pk,
      reason: "Strong deterministic match but no bad_row in DB for this PK",
    };
  }

  const targetPk = String(top.normalized_pk ?? "").trim();
  if (!targetPk) {
    return {
      final_action: "unsure",
      confidence: "low",
      proposed_target_pk: null,
      reason: "Missing normalized_pk",
    };
  }

  if (original === targetPk) {
    return {
      final_action: "keep_real",
      confidence: "high",
      proposed_target_pk: targetPk,
      reason: "Bad PK string already equals canonical target",
    };
  }

  const badNorm = normalizeScryfallCacheName(normalizeCurlyQuotesAndSpaces(original));
  if (badNorm === targetPk) {
    return {
      final_action: "keep_real",
      confidence: "high",
      proposed_target_pk: targetPk,
      reason: "Normalized bad key equals target PK",
    };
  }

  if (top.exists_in_scryfall_cache) {
    return {
      final_action: "merge_then_delete_bad_row",
      confidence: "high",
      proposed_target_pk: targetPk,
      reason: `Deterministic match (${top.match_reason}); canonical row exists`,
    };
  }

  return {
    final_action: "rename_row_to_canonical",
    confidence: "high",
    proposed_target_pk: targetPk,
    reason: `Deterministic match (${top.match_reason}); canonical PK not in cache`,
  };
}

async function main() {
  loadEnvFromDisk();
  const { auditJson, reviewJson, reviewedJson, outReview, outSql, outSqlJson } = parseArgs(
    process.argv.slice(2)
  );

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error(
      "[final-small-bucket] Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY."
    );
    process.exit(1);
  }

  for (const p of [auditJson, reviewJson]) {
    if (!existsSync(p)) {
      console.error(`[final-small-bucket] Missing: ${p}`);
      process.exit(1);
    }
  }

  const audit = JSON.parse(readFileSync(auditJson, "utf8"));
  const reviewDoc = JSON.parse(readFileSync(reviewJson, "utf8"));
  let reviewedPrior = null;
  if (existsSync(reviewedJson)) {
    try {
      reviewedPrior = JSON.parse(readFileSync(reviewedJson, "utf8"));
    } catch {
      reviewedPrior = null;
    }
  }

  const reviewedByName = new Map();
  if (reviewedPrior?.rows && Array.isArray(reviewedPrior.rows)) {
    for (const r of reviewedPrior.rows) {
      const k = String(r.original_name ?? "");
      if (k) reviewedByName.set(k, r);
    }
  }

  const reviewRows = reviewDoc.rows;
  if (!Array.isArray(reviewRows)) {
    console.error("[final-small-bucket] remaining-ai-review.json needs rows[]");
    process.exit(1);
  }

  const reviewByName = new Map();
  for (const r of reviewRows) {
    const k = String(r.original_name ?? "");
    if (k) reviewByName.set(k, r);
  }

  const unmatched = audit.unmatched;
  if (!Array.isArray(unmatched)) {
    console.error("[final-small-bucket] audit needs unmatched[]");
    process.exit(1);
  }

  const scoped = unmatched.filter((u) => SMALL_BUCKETS.has(String(u.category ?? "")));

  const outRows = [];
  for (const u of scoped) {
    const name = String(u.name ?? "");
    const category = String(u.category ?? "");
    const exportRow = reviewByName.get(name);

    if (!exportRow) {
      outRows.push({
        original_name: name,
        audit_category: category,
        final_action: "unsure",
        confidence: "low",
        proposed_target_pk: null,
        reason: "Row missing from scryfall-cache-remaining-ai-review.json (re-run export)",
        prior_reviewed: reviewedByName.get(name) ?? null,
      });
      continue;
    }

    const c = classifySmallBucket(exportRow);
    outRows.push({
      original_name: name,
      audit_category: category,
      ...c,
      match_detail: exportRow.candidates?.[0]
        ? {
            rank: exportRow.candidates[0].rank,
            match_reason: exportRow.candidates[0].match_reason,
            normalized_pk: exportRow.candidates[0].normalized_pk,
          }
        : null,
      prior_reviewed: reviewedByName.get(name) ?? null,
    });
  }

  const summary = {
    quoted_name: 0,
    bracketed_name: 0,
    import_set_number_junk: 0,
    merge_then_delete_bad_row: 0,
    rename_row_to_canonical: 0,
    keep_real: 0,
    unsure: 0,
  };

  for (const r of outRows) {
    if (r.audit_category && summary[r.audit_category] !== undefined) summary[r.audit_category]++;
    const a = r.final_action;
    if (a === "merge_then_delete_bad_row") summary.merge_then_delete_bad_row++;
    else if (a === "rename_row_to_canonical") summary.rename_row_to_canonical++;
    else if (a === "keep_real") summary.keep_real++;
    else if (a === "unsure") summary.unsure++;
  }

  const reviewReport = {
    generatedAt: new Date().toISOString(),
    scope: {
      categories: [...SMALL_BUCKETS],
      row_count: outRows.length,
    },
    sources: {
      auditPath: auditJson,
      remainingAiReviewPath: reviewJson,
      remainingAiReviewedPath: existsSync(reviewedJson) ? reviewedJson : null,
    },
    rules:
      "quoted_name, bracketed_name, import_set_number_junk only; merge/rename only with exact_pipeline or face_match (not word_overlap); normalized PK targets",
    summary,
    rows: outRows,
  };

  mkdirSync(dirname(outReview), { recursive: true });
  writeFileSync(outReview, JSON.stringify(reviewReport, null, 2), "utf8");

  const repairs = outRows.filter(
    (r) => r.final_action === "merge_then_delete_bad_row" || r.final_action === "rename_row_to_canonical"
  );

  const toFetch = new Set();
  for (const r of repairs) {
    toFetch.add(r.original_name);
    toFetch.add(String(r.proposed_target_pk ?? ""));
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const dbByName = await fetchRowsByNames(supabase, [...toFetch]);

  const mergePlans = [];
  const mergeBadNames = [];
  const renamePlans = [];
  const skippedSql = [];

  for (const r of repairs) {
    const bad = r.original_name;
    const canonPk = String(r.proposed_target_pk ?? "").trim();
    if (!canonPk) {
      skippedSql.push({ original_name: bad, reason: "empty target pk" });
      continue;
    }
    const badRow = dbByName.get(bad);
    if (!badRow) {
      skippedSql.push({ original_name: bad, reason: "bad_row_not_in_database" });
      continue;
    }
    const canonRow = dbByName.get(canonPk);
    if (canonRow) {
      mergePlans.push({ bad_name: bad, canonical_name: canonPk, from_review: r.final_action });
      mergeBadNames.push(bad);
    } else {
      renamePlans.push({ bad_name: bad, canonical_name: canonPk, from_review: r.final_action });
    }
  }

  const previewNames = new Set();
  for (const p of mergePlans) {
    previewNames.add(p.bad_name);
    previewNames.add(p.canonical_name);
  }
  for (const p of renamePlans) previewNames.add(p.bad_name);

  const scopedBadNames = outRows.map((r) => r.original_name).filter(Boolean);

  const sqlParts = [];
  sqlParts.push(`-- =============================================================================`);
  sqlParts.push(`-- preview_scryfall_cache_final_small_bucket.sql`);
  sqlParts.push(`-- READ-ONLY PREVIEW (quoted_name, bracketed_name, import_set_number_junk)`);
  sqlParts.push(`-- Generated: ${new Date().toISOString()}`);
  sqlParts.push(`-- merge_then_delete_bad_row: ${mergePlans.length}`);
  sqlParts.push(`-- rename_row_to_canonical: ${renamePlans.length}`);
  sqlParts.push(`-- skipped_sql: ${skippedSql.length}`);
  sqlParts.push(`-- =============================================================================`);
  sqlParts.push(``);
  sqlParts.push(`BEGIN;`);
  sqlParts.push(``);
  sqlParts.push(`-- Section A — Preview SELECTs`);
  sqlParts.push(`-- A1 — All small-bucket unmatched PKs (audit scope)`);
  sqlParts.push(``);
  if (scopedBadNames.length) {
    sqlParts.push(
      `SELECT * FROM public.scryfall_cache WHERE name IN (${scopedBadNames.map(sqlStringLiteral).join(", ")});`
    );
  } else {
    sqlParts.push(`-- (no scoped rows)`);
  }
  sqlParts.push(``);
  sqlParts.push(`-- A2 — PKs involved in merge/rename preview (subset)`);
  sqlParts.push(``);
  if (previewNames.size) {
    const arr = [...previewNames].sort();
    sqlParts.push(`SELECT * FROM public.scryfall_cache WHERE name IN (${arr.map(sqlStringLiteral).join(", ")});`);
  } else {
    sqlParts.push(`-- (no merge/rename PKs — all high-confidence actions were unsure/keep_real)`);
  }
  sqlParts.push(``);
  sqlParts.push(`-- Section B — Merge`);
  sqlParts.push(``);
  for (const p of mergePlans) {
    sqlParts.push(`-- merge: ${p.bad_name} → ${p.canonical_name}`);
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
    sqlParts.push(`-- rename: ${p.bad_name} → ${p.canonical_name}`);
    sqlParts.push(buildRenameSql(p.bad_name, p.canonical_name));
  }
  sqlParts.push(`ROLLBACK;`);
  sqlParts.push(``);

  mkdirSync(dirname(outSql), { recursive: true });
  writeFileSync(outSql, sqlParts.join("\n"), "utf8");

  const sqlReport = {
    generatedAt: new Date().toISOString(),
    sourceReviewPath: outReview,
    summary: {
      merge_then_delete_bad_row: mergePlans.length,
      rename_row_to_canonical: renamePlans.length,
      skipped_sql: skippedSql.length,
    },
    merge_plans: mergePlans,
    rename_plans: renamePlans,
    skipped_sql: skippedSql,
  };
  writeFileSync(outSqlJson, JSON.stringify(sqlReport, null, 2), "utf8");

  console.log("");
  console.log("=== final small-bucket review ===");
  console.log(`Scoped rows: ${outRows.length}`);
  console.log("Summary:", summary);
  console.log("SQL plan:", sqlReport.summary);
  console.log(`Wrote: ${outReview}`);
  console.log(`Wrote: ${outSql}`);
  console.log(`Wrote: ${outSqlJson}`);
  console.log("[final-small-bucket] END (ok)");
}

main().catch((e) => {
  console.error("[final-small-bucket] FAILED:", e?.message || e);
  process.exit(1);
});
