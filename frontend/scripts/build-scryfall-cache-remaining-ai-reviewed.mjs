#!/usr/bin/env node
/**
 * Builds tmp/scryfall-cache-remaining-ai-reviewed.json from the rich export.
 * Conservative: only merge_then_delete_bad_row | rename_row_to_canonical | delete_candidate
 * when confidence is truly high; otherwise keep_real | unsure.
 *
 * Run: npm run build:scryfall-cache-remaining-ai-reviewed
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");

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

function isObviousPromptOrSentenceJunk(s) {
  const t = s.trim();
  if (t.length < 25) return false;
  const low = t.toLowerCase();
  if (
    /please analyze|analyze this commander|analyze my commander|tell me what|what's missing|what is missing|please review|deck analysis:/i.test(
      low
    )
  )
    return true;
  if (/^\s*please\s+/.test(low) && (low.includes("deck") || low.includes("commander"))) return true;
  if (t.includes("?") && low.includes("deck") && low.includes("missing") && t.length > 40) return true;
  if (low.includes("commander deck") && (low.includes("tell me") || low.includes("analyze"))) return true;
  return false;
}

function isPunctuationOnlyGarbage(s) {
  const t = s.trim();
  if (t.length === 0) return true;
  if (t.length <= 2 && /^[^\w\u00c0-\u024f]+$/.test(t)) return true;
  return false;
}

/** Truly high-signal match: deterministic pipeline or unique face→full, not fuzzy word overlap. */
function isStrongCandidate(top) {
  if (!top?.match_reason) return false;
  const r = top.match_reason;
  if (r.startsWith("word_overlap")) return false;
  return r.startsWith("exact_pipeline:") || r.startsWith("face_match:");
}

function baseMeta(row) {
  return {
    audit_category: row.audit_category ?? null,
    upstream_heuristic: row.heuristic ?? null,
  };
}

function classifyRow(row) {
  const original = String(row.original_name ?? "");
  const badPresent = !!row.bad_row;
  const top = row.candidates?.[0];
  const meta = baseMeta(row);

  if (isPunctuationOnlyGarbage(original) || isObviousPromptOrSentenceJunk(original)) {
    return {
      original_name: original,
      final_action: "delete_candidate",
      confidence: "high",
      proposed_target_pk: null,
      reason: "High-confidence junk: punctuation-only or obvious prompt/sentence pattern",
      ...meta,
    };
  }

  if (!top || !isStrongCandidate(top)) {
    if (!top) {
      return {
        original_name: original,
        final_action: "unsure",
        confidence: "low",
        proposed_target_pk: null,
        reason: "No deterministic candidate; needs review",
        ...meta,
      };
    }
    return {
      original_name: original,
      final_action: "unsure",
      confidence: "low",
      proposed_target_pk: top.normalized_pk ?? null,
      reason: "Only fuzzy/word-overlap style match; not high enough for automated repair",
      ...meta,
      candidate_hint: { match_reason: top.match_reason, normalized_pk: top.normalized_pk },
    };
  }

  if (!badPresent) {
    return {
      original_name: original,
      final_action: "unsure",
      confidence: "low",
      proposed_target_pk: top.normalized_pk,
      reason: "Strong Scryfall match but no bad row in DB (audit drift); do not merge/rename",
      ...meta,
    };
  }

  const targetPk = String(top.normalized_pk ?? "").trim();
  if (!targetPk) {
    return {
      original_name: original,
      final_action: "unsure",
      confidence: "low",
      proposed_target_pk: null,
      reason: "Missing normalized_pk on candidate",
      ...meta,
    };
  }

  if (original === targetPk) {
    return {
      original_name: original,
      final_action: "keep_real",
      confidence: "high",
      proposed_target_pk: targetPk,
      reason: "Bad PK already equals canonical PK string",
      ...meta,
    };
  }

  const badNorm = normalizeScryfallCacheName(normalizeCurlyQuotesAndSpaces(original));
  if (badNorm === targetPk) {
    return {
      original_name: original,
      final_action: "keep_real",
      confidence: "high",
      proposed_target_pk: targetPk,
      reason: "Normalized bad key equals target PK",
      ...meta,
    };
  }

  if (top.exists_in_scryfall_cache) {
    return {
      original_name: original,
      final_action: "merge_then_delete_bad_row",
      confidence: "high",
      proposed_target_pk: targetPk,
      reason: `Strong match (${top.match_reason}); canonical row exists for PK`,
      ...meta,
      source_candidate: { rank: top.rank, match_reason: top.match_reason },
    };
  }

  return {
    original_name: original,
    final_action: "rename_row_to_canonical",
    confidence: "high",
    proposed_target_pk: targetPk,
    reason: `Strong match (${top.match_reason}); canonical PK not in cache — rename`,
    ...meta,
    source_candidate: { rank: top.rank, match_reason: top.match_reason },
  };
}

function parseArgs(argv) {
  let inputPath = join(frontendRoot, "tmp", "scryfall-cache-remaining-ai-review.json");
  let outPath = join(frontendRoot, "tmp", "scryfall-cache-remaining-ai-reviewed.json");
  for (const a of argv) {
    if (a.startsWith("--input=")) inputPath = resolve(a.slice("--input=".length));
    else if (a.startsWith("--out=")) outPath = resolve(a.slice("--out=".length));
  }
  return { inputPath, outPath };
}

function main() {
  const { inputPath, outPath } = parseArgs(process.argv.slice(2));

  if (!existsSync(inputPath)) {
    console.error(`[build-reviewed] Missing: ${inputPath}`);
    process.exit(1);
  }

  const doc = JSON.parse(readFileSync(inputPath, "utf8"));
  const rows = doc.rows;
  if (!Array.isArray(rows)) {
    console.error("[build-reviewed] Expected rows[]");
    process.exit(1);
  }

  const outRows = rows.map((r) => classifyRow(r));

  const summary = {
    merge_then_delete_bad_row: 0,
    rename_row_to_canonical: 0,
    delete_candidate: 0,
    keep_real: 0,
    unsure: 0,
  };
  for (const r of outRows) {
    const k = r.final_action;
    if (summary[k] !== undefined) summary[k]++;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    sourceExportPath: inputPath,
    rules:
      "Only merge/rename/delete with truly high confidence: strong deterministic candidate (exact_pipeline or face_match, not word_overlap), bad row present for repairs, obvious junk for delete",
    note:
      "If merge_then_delete_bad_row and rename_row_to_canonical are both 0, the export likely has no row where rank-1 candidate is exact_pipeline/face_match AND bad_row is present — edit rows by hand after AI review.",
    summary,
    rows: outRows,
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("[build-reviewed] Summary:", summary);
  console.log(`[build-reviewed] Wrote: ${outPath}`);
}

main();
