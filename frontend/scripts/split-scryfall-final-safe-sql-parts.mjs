#!/usr/bin/env node
/**
 * Splits frontend/tmp/scryfall-cache-sql-plan-final-safe.sql into 4 part files
 * with ~300 merge+delete pairs each (even split of total merges).
 *
 * Run: node scripts/split-scryfall-final-safe-sql-parts.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");
const src = join(frontendRoot, "tmp", "scryfall-cache-sql-plan-final-safe.sql");

const NUM_PARTS = 4;

let text = readFileSync(src, "utf8").replace(/\r\n/g, "\n");

const bIdx = text.indexOf("-- Section B");
const rbIdx = text.lastIndexOf("ROLLBACK;");
const cTitle = "-- Section C — Rename row to canonical (no existing canonical row)";
const ixSectionC = text.indexOf(cTitle);
if (bIdx < 0 || ixSectionC < 0 || rbIdx < 0) {
  console.error("Could not find section markers");
  process.exit(1);
}
/** Start of dashed line immediately before Section C (do not use indexOf('-- Section C') — it skips that line). */
const tailStart = text.lastIndexOf("-- -----------------------------------------------------------------------------", ixSectionC);

const sectionA = text.slice(0, bIdx);
const merges = sectionA.match(/-- merge: bad=[\s\S]*?;\n/g) || [];

const sectionB = text.slice(bIdx, tailStart);
const deletes = sectionB.match(/-- delete merged bad:[\s\S]*?;\n/g) || [];

const tailAfterB = text.slice(tailStart, rbIdx).trimEnd() + "\n";
const rollback = "ROLLBACK;\n";

if (merges.length !== deletes.length) {
  console.error(`Mismatch: ${merges.length} merges vs ${deletes.length} deletes`);
  process.exit(1);
}

const total = merges.length;
const base = Math.floor(total / NUM_PARTS);
const rem = total % NUM_PARTS;
/** Sizes: first `rem` parts get base+1, rest get base — totals ~300 when total≈1200 */
const sizes = [];
for (let i = 0; i < NUM_PARTS; i++) {
  sizes.push(base + (i < rem ? 1 : 0));
}

let offset = 0;
const headerBase = text.slice(0, text.indexOf("BEGIN;")).trimEnd();

for (let p = 0; p < NUM_PARTS; p++) {
  const n = sizes[p];
  const mChunk = merges.slice(offset, offset + n);
  const dChunk = deletes.slice(offset, offset + n);
  offset += n;

  const partHeader = [
    headerBase,
    "",
    `-- Split part ${p + 1}/${NUM_PARTS} — ${n} merge_then_delete pairs (merges ${offset - n + 1}–${offset} of ${total})`,
    "",
  ].join("\n");

  const out = [
    partHeader,
    "BEGIN;",
    "",
    "-- -----------------------------------------------------------------------------",
    "-- Section A — Merge useful nulls from bad row into canonical row (conservative)",
    "-- -----------------------------------------------------------------------------",
    "",
    mChunk.join(""),
    "",
    "-- -----------------------------------------------------------------------------",
    "-- Section B — Delete bad rows after merge (same PKs as Section A)",
    "-- -----------------------------------------------------------------------------",
    "",
    dChunk.join(""),
    "",
    tailAfterB,
    "",
    rollback,
    "",
  ].join("\n");

  const outPath = join(
    frontendRoot,
    "tmp",
    `scryfall-cache-sql-plan-final-safe-part-${p + 1}.sql`
  );
  writeFileSync(outPath, out, "utf8");

  const junkInD = (tailAfterB.match(/DELETE FROM public\.scryfall_cache/g) || []).length;
  console.log(`part-${p + 1}: merge+delete pairs=${n}${p === NUM_PARTS - 1 && junkInD ? ` | Section D DELETEs in tail=${junkInD}` : ""}`);
  console.log(`  → ${outPath}`);
}
