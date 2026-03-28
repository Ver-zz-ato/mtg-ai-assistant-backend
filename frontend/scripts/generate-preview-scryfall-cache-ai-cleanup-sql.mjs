#!/usr/bin/env node
/**
 * @deprecated Prefer `generate-preview-scryfall-cache-ai-cleanup-safe.mjs` — uses normalized PKs
 *   and merge/rename logic with a read-only Supabase check. This script used display-case SET name.
 *
 * Generates a READ-ONLY SQL preview file from AI-reviewed classifications.
 * Does NOT connect to Supabase or execute SQL.
 *
 * Input: tmp/scryfall-cache-ai-reviewed.json (rows[].classification, confidence, etc.)
 * Output: db/preview_scryfall_cache_ai_cleanup.sql
 *
 * Run (from frontend/):
 *   node scripts/generate-preview-scryfall-cache-ai-cleanup-sql.mjs
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");
const repoRoot = resolve(frontendRoot, "..");

function sqlStringLiteral(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function parseArgs(argv) {
  let inputJson = join(frontendRoot, "tmp", "scryfall-cache-ai-reviewed.json");
  let outSql = join(repoRoot, "db", "preview_scryfall_cache_ai_cleanup.sql");
  for (const a of argv) {
    if (a.startsWith("--input=")) inputJson = resolve(a.slice("--input=".length));
    else if (a.startsWith("--out=")) outSql = resolve(a.slice("--out=".length));
  }
  return { inputJson, outSql };
}

function main() {
  const { inputJson, outSql } = parseArgs(process.argv.slice(2));

  if (!existsSync(inputJson)) {
    console.error(`[ai-cleanup-sql] Input not found: ${inputJson}`);
    process.exit(1);
  }

  const doc = JSON.parse(readFileSync(inputJson, "utf8"));
  const rows = doc.rows;
  if (!Array.isArray(rows)) {
    console.error("[ai-cleanup-sql] Expected rows[]");
    process.exit(1);
  }

  /** @type {{ original_name: string, proposed_target_name: string, reason?: string }[]} */
  const repairsRaw = [];
  /** @type {{ original_name: string, reason?: string }[]} */
  const deletesRaw = [];
  let omittedNoConfidence = 0;
  let omittedLowConfidence = 0;

  for (const r of rows) {
    const c = r.classification;
    const conf = r.confidence;

    if (c !== "repair_to_canonical" && c !== "delete_candidate") {
      continue;
    }
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

    const target = String(r.proposed_target_name ?? "").trim();
    if (!target) continue;
    repairsRaw.push({
      original_name: orig,
      proposed_target_name: target,
      reason: r.reason,
    });
  }

  // Deduplicate repairs by target: multiple bad rows → same PK would violate uniqueness
  const byTarget = new Map();
  for (const r of repairsRaw) {
    const t = r.proposed_target_name;
    if (!byTarget.has(t)) byTarget.set(t, []);
    byTarget.get(t).push(r);
  }

  const repairsIncluded = [];
  /** @type {string[]} */
  const repairsSkippedDuplicateTarget = [];

  for (const [target, list] of byTarget) {
    const sorted = [...list].sort((a, b) => a.original_name.localeCompare(b.original_name));
    repairsIncluded.push(sorted[0]);
    for (let i = 1; i < sorted.length; i++) {
      repairsSkippedDuplicateTarget.push(
        `duplicate proposed_target_name ${sqlStringLiteral(target)}: skipped ${sqlStringLiteral(sorted[i].original_name)} (keeping ${sqlStringLiteral(sorted[0].original_name)})`
      );
    }
  }

  // Also skip if original equals target (no-op / already canonical)
  const repairsFinal = [];
  /** @type {string[]} */
  const repairsSkippedNoop = [];
  for (const r of repairsIncluded) {
    if (r.original_name === r.proposed_target_name) {
      repairsSkippedNoop.push(
        `same as target, skipped: ${sqlStringLiteral(r.original_name)}`
      );
      continue;
    }
    repairsFinal.push(r);
  }

  const deletesFinal = deletesRaw;

  const repairNames = repairsFinal.map((r) => r.original_name);
  const deleteNames = deletesFinal.map((d) => d.original_name);

  const lines = [];
  lines.push(`-- =============================================================================`);
  lines.push(`-- preview_scryfall_cache_ai_cleanup.sql`);
  lines.push(`-- READ-ONLY PREVIEW — NOT EXECUTED by this script`);
  lines.push(`-- Source: ${inputJson}`);
  lines.push(`-- Rules: classification in (repair_to_canonical, delete_candidate) AND confidence = high`);
  lines.push(`-- repairs: ${repairsFinal.length}`);
  lines.push(`-- deletes: ${deletesFinal.length}`);
  lines.push(`-- omitted (not high confidence or missing confidence): ${omittedNoConfidence + omittedLowConfidence} (see console)`);
  lines.push(`-- =============================================================================`);
  lines.push(`-- NOTE: App PK uses normalizeScryfallCacheName; you may need name_norm / updated_at to match`);
  lines.push(`--       production conventions before applying any real migration.`);
  lines.push(`-- =============================================================================`);
  lines.push(``);

  if (repairsSkippedDuplicateTarget.length) {
    lines.push(`-- SKIPPED repairs (duplicate proposed_target_name → would violate unique PK):`);
    for (const s of repairsSkippedDuplicateTarget) lines.push(`--   ${s}`);
    lines.push(``);
  }
  if (repairsSkippedNoop.length) {
    lines.push(`-- SKIPPED repairs (original equals target):`);
    for (const s of repairsSkippedNoop) lines.push(`--   ${s}`);
    lines.push(``);
  }

  lines.push(`BEGIN;`);
  lines.push(``);
  lines.push(`-- -----------------------------------------------------------------------------`);
  lines.push(`-- REPAIRS (${repairsFinal.length})`);
  lines.push(`-- -----------------------------------------------------------------------------`);
  if (repairNames.length) {
    lines.push(`-- Preview rows involved (bad PKs):`);
    lines.push(
      `SELECT * FROM public.scryfall_cache WHERE name IN (${repairNames.map(sqlStringLiteral).join(", ")});`
    );
    lines.push(``);
  } else {
    lines.push(`-- (no repair statements after filters)`);
    lines.push(``);
  }

  for (const r of repairsFinal) {
    lines.push(
      `-- repair: ${r.original_name.replace(/\r?\n/g, " ")} → ${r.proposed_target_name.replace(/\r?\n/g, " ")}`
    );
    if (r.reason) lines.push(`--   ${String(r.reason).replace(/\r?\n/g, " ").slice(0, 200)}`);
    lines.push(`UPDATE public.scryfall_cache`);
    lines.push(`SET name = ${sqlStringLiteral(r.proposed_target_name)}`);
    lines.push(`WHERE name = ${sqlStringLiteral(r.original_name)};`);
    lines.push(``);
  }

  lines.push(`-- -----------------------------------------------------------------------------`);
  lines.push(`-- DELETES (${deletesFinal.length})`);
  lines.push(`-- -----------------------------------------------------------------------------`);
  if (deleteNames.length) {
    lines.push(`-- Preview rows involved:`);
    lines.push(
      `SELECT * FROM public.scryfall_cache WHERE name IN (${deleteNames.map(sqlStringLiteral).join(", ")});`
    );
    lines.push(``);
  } else {
    lines.push(`-- (no delete statements — delete_candidate rows lacked confidence: high in source JSON)`);
    lines.push(``);
  }

  for (const d of deletesFinal) {
    lines.push(`-- delete: ${d.original_name.replace(/\r?\n/g, " ")}`);
    if (d.reason) lines.push(`--   ${String(d.reason).replace(/\r?\n/g, " ").slice(0, 200)}`);
    lines.push(`DELETE FROM public.scryfall_cache WHERE name = ${sqlStringLiteral(d.original_name)};`);
    lines.push(``);
  }

  lines.push(`ROLLBACK;`);
  lines.push(``);
  lines.push(`-- End preview (transaction rolled back if executed as-is)`);

  mkdirSync(dirname(outSql), { recursive: true });
  writeFileSync(outSql, lines.join("\n"), "utf8");

  console.log("");
  console.log("=== AI cleanup SQL preview (not executed) ===");
  console.log(`Repairs written:     ${repairsFinal.length}`);
  console.log(`Deletes written:     ${deletesFinal.length}`);
  console.log(`Skipped dup target:  ${repairsSkippedDuplicateTarget.length}`);
  console.log(`Skipped noop:        ${repairsSkippedNoop.length}`);
  console.log(`Omitted (not high):  ${omittedNoConfidence + omittedLowConfidence}`);
  console.log(`Omitted (no conf.):  ${omittedNoConfidence}`);
  console.log(`Omitted med/low:     ${omittedLowConfidence}`);
  console.log("");
  console.log(`Wrote: ${outSql}`);
  console.log("[ai-cleanup-sql] END (ok)");
}

main();
