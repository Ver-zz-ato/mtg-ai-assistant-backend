#!/usr/bin/env node
/**
 * One-off helper: slice frontend/tmp/scryfall-cache-sql-plan.sql into
 * scryfall-cache-sql-plan-first-batch.sql (150 merges + Section D junk deletes).
 * Run: node scripts/slice-scryfall-sql-plan-first-batch.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");
const src = join(frontendRoot, "tmp", "scryfall-cache-sql-plan.sql");
const dst = join(frontendRoot, "tmp", "scryfall-cache-sql-plan-first-batch.sql");

let text = readFileSync(src, "utf8").replace(/\r\n/g, "\n");

const bIdx = text.indexOf("-- Section B");
const cIdx = text.indexOf("-- Section C");
const dIdx = text.indexOf("-- Section D");
const rbIdx = text.lastIndexOf("ROLLBACK;");

if (bIdx < 0 || cIdx < 0 || dIdx < 0 || rbIdx < 0) {
  console.error("Could not find section markers in", src);
  process.exit(1);
}

const sectionA = text.slice(0, bIdx);
const merges = sectionA.match(/-- merge: bad=[\s\S]*?;\n/g) || [];

const sectionB = text.slice(bIdx, cIdx);
const deletesMerged = sectionB.match(/-- delete merged bad:[\s\S]*?;\n/g) || [];

const sectionD = text.slice(dIdx, rbIdx).trimEnd() + "\n";

const N = 150;
const merges150 = merges.slice(0, N);
const del150 = deletesMerged.slice(0, N);

if (merges150.length !== del150.length) {
  console.error("Mismatch: merges", merges150.length, "vs deletes", del150.length);
  process.exit(1);
}

const headerLines = text.slice(0, text.indexOf("-- Section A"));

const out = [
  headerLines.trimEnd(),
  "",
  "-- First batch: 150 merge_then_delete pairs + all Section D junk deletes (preview).",
  "",
  "-- -----------------------------------------------------------------------------",
  "-- Section A — Merge useful nulls from bad row into canonical row (conservative)",
  "-- -----------------------------------------------------------------------------",
  "",
  merges150.join(""),
  "",
  "-- -----------------------------------------------------------------------------",
  "-- Section B — Delete bad rows after merge (same PKs as Section A)",
  "-- -----------------------------------------------------------------------------",
  "",
  del150.join(""),
  "",
  "-- -----------------------------------------------------------------------------",
  "-- Section C — Rename row to canonical (no existing canonical row)",
  "-- -----------------------------------------------------------------------------",
  "",
  "-- -----------------------------------------------------------------------------",
  sectionD,
  "",
  "ROLLBACK;",
  "",
].join("\n");

writeFileSync(dst, out, "utf8");

const junkDeletes = (sectionD.match(/DELETE FROM public\.scryfall_cache/g) || []).length;
console.log("--- first-batch summary ---");
console.log("merges (Section A):", merges150.length);
console.log("merge deletes (Section B):", del150.length);
console.log("junk deletes (Section D):", junkDeletes);
console.log("total DELETE statements:", del150.length + junkDeletes);
console.log("Wrote:", dst);
