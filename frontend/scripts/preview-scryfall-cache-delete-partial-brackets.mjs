#!/usr/bin/env node
/**
 * PREVIEW ONLY: build DELETE SQL for audit rows with category partial_bracket_pollution.
 * Reads tmp JSON only — does not connect to Supabase or execute SQL.
 *
 * Run (from frontend/): npm run preview:scryfall-cache-delete-partial-brackets
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");

function parseArgs(argv) {
  let auditJson = join(frontendRoot, "tmp", "scryfall-cache-name-audit.json");
  let outSql = join(frontendRoot, "tmp", "scryfall-cache-delete-partial-brackets.sql");
  let outJson = join(frontendRoot, "tmp", "scryfall-cache-delete-partial-brackets.json");
  for (const a of argv) {
    if (a.startsWith("--audit-json=")) auditJson = resolve(a.slice("--audit-json=".length));
    else if (a.startsWith("--out-sql=")) outSql = resolve(a.slice("--out-sql=".length));
    else if (a.startsWith("--out-json=")) outJson = resolve(a.slice("--out-json=".length));
  }
  return { auditJson, outSql, outJson };
}

/** PostgreSQL single-quoted literal */
function sqlStringLiteral(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function main() {
  const { auditJson, outSql, outJson } = parseArgs(process.argv.slice(2));

  if (!existsSync(auditJson)) {
    console.error(`[delete-partial-brackets] File not found: ${auditJson}`);
    process.exit(1);
  }

  const audit = JSON.parse(readFileSync(auditJson, "utf8"));
  const unmatched = audit.unmatched;
  if (!Array.isArray(unmatched)) {
    console.error("[delete-partial-brackets] Expected audit.unmatched[]");
    process.exit(1);
  }

  const rows = unmatched.filter((r) => r?.category === "partial_bracket_pollution");
  const names = rows.map((r) => String(r.name));

  const sqlParts = [];
  sqlParts.push(`-- =============================================================================`);
  sqlParts.push(`-- PREVIEW ONLY — not executed by this script`);
  sqlParts.push(`-- Delete scryfall_cache rows (exact PK match) — partial_bracket_pollution`);
  sqlParts.push(`-- Source audit: ${auditJson}`);
  sqlParts.push(`-- Generated: ${new Date().toISOString()}`);
  sqlParts.push(`-- Row count: ${names.length}`);
  sqlParts.push(`-- Replace ROLLBACK with COMMIT only after review in SQL editor.`);
  sqlParts.push(`-- =============================================================================`);
  sqlParts.push(``);
  sqlParts.push(`BEGIN;`);
  sqlParts.push(``);

  if (names.length === 0) {
    sqlParts.push(`-- No rows matched category partial_bracket_pollution.`);
    sqlParts.push(`-- DELETE FROM public.scryfall_cache WHERE name IN ();`);
  } else {
    const literals = names.map(sqlStringLiteral);
    sqlParts.push(`DELETE FROM public.scryfall_cache`);
    sqlParts.push(`WHERE name IN (`);
    for (let i = 0; i < literals.length; i++) {
      const comma = i < literals.length - 1 ? "," : "";
      sqlParts.push(`  ${literals[i]}${comma}`);
    }
    sqlParts.push(`);`);
  }

  sqlParts.push(``);
  sqlParts.push(`ROLLBACK;`);
  sqlParts.push(``);

  mkdirSync(dirname(outSql), { recursive: true });
  writeFileSync(outSql, sqlParts.join("\n"), "utf8");

  const report = {
    generatedAt: new Date().toISOString(),
    sourceAuditPath: auditJson,
    category: "partial_bracket_pollution",
    count: names.length,
    names,
  };
  writeFileSync(outJson, JSON.stringify(report, null, 2), "utf8");

  console.log("");
  console.log("=== partial_bracket_pollution delete preview ===");
  console.log(`Count (rows to delete): ${names.length}`);
  console.log("");
  console.log("Sample names (first 20):");
  for (const n of names.slice(0, 20)) {
    console.log(`  ${n}`);
  }
  if (names.length > 20) console.log(`  ... and ${names.length - 20} more (see JSON)`);
  console.log("");
  console.log(`Wrote SQL:  ${outSql}`);
  console.log(`Wrote JSON: ${outJson}`);
  console.log("");
  console.log("[delete-partial-brackets] END (ok)");
}

main();
