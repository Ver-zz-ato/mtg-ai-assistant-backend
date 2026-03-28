#!/usr/bin/env node
/**
 * Export structured rows for AI-assisted review of unmatched scryfall_cache.name values.
 * READ-ONLY: reads audit + cleanup preview JSON; optionally fetches Scryfall default_cards.
 * No Supabase, no SQL, no auto-fix.
 *
 * Run (from frontend/):
 *   npm run export:scryfall-cache-ai-review
 *
 * LOCKSTEP: normalizeScryfallCacheName + repair micro-steps match
 *   frontend/lib/server/scryfallCacheRow.ts and preview-scryfall-cache-cleanup.mjs
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

function stripOuterQuotes(s) {
  let t = s.trim();
  if (t.length >= 2) {
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      return t.slice(1, -1).trim();
    }
  }
  return t;
}

function stripOuterDoubleBrackets(s) {
  let t = s.trim();
  const inner = t.match(/^\[\[\s*([\s\S]+?)\s*\]\]$/);
  if (inner) return inner[1].trim();
  return t;
}

function stripLeadingDash(s) {
  return s.replace(/^[\-–—\u2013]\s*/u, "").trim();
}

function stripLeadingQtyPrefix(s) {
  return s.replace(/^\d+\s*x?\s+/i, "").trim();
}

function stripLeadingStuckDigits(s) {
  return s.replace(/^(\d+)(?=[a-z])/i, "").trim();
}

function stripTrailingSetParenNumber(s) {
  let t = s.trim();
  let prev;
  do {
    prev = t;
    t = t.replace(/\s*\(\s*[a-z0-9]{2,6}\s*\)\s*\d+\s*$/i, "").trim();
  } while (t !== prev);
  return t;
}

function stripTrailingCommaNumber(s) {
  return s.replace(/,\s*\d+\s*$/i, "").trim();
}

function stripKnownTagBrackets(s) {
  let t = s;
  let prev;
  do {
    prev = t;
    t = t
      .replace(/\s*\[(commander|creature|creatures|artifact|enchantment|instant|land|planeswalker|sorcery)\]\s*/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  } while (t !== prev);
  return t;
}

function stripTrailingPrice(s) {
  let t = s.trim();
  let prev;
  do {
    prev = t;
    t = t.replace(/\s+\$\s*\d+(?:\.\d{1,2})?\s*$/i, "").trim();
    t = t.replace(/\s+\$\d+\s*$/i, "").trim();
  } while (t !== prev);
  return t;
}

function stripTrailingCollectorRarity(s) {
  let t = s.trim();
  let prev;
  do {
    prev = t;
    t = t.replace(/\s+\d{3,4}\s+[rucm]\s*$/i, "").trim();
  } while (t !== prev);
  return t;
}

function stripFoilMarkers(s) {
  return s
    .replace(/\s*\*[fF]\*\s*$/i, "")
    .replace(/\s*★\s*$/u, "")
    .replace(/\s*☆\s*$/u, "")
    .trim();
}

const ROLE_TAGS = [
  "ramp",
  "draw",
  "removal",
  "interaction",
  "tokens",
  "land",
  "lifegain",
  "drain",
  "recursion",
  "finisher",
  "burn",
  "theft",
  "mill",
  "counters",
  "combo",
  "protection",
  "tutor",
  "sweeper",
  "board",
  "graveyard",
];

function stripTrailingRoleTags(s) {
  const re = new RegExp(`\\s*\\[(${ROLE_TAGS.join("|")})\\]\\s*$`, "i");
  let t = s.trim();
  let prev;
  do {
    prev = t;
    t = t.replace(re, "").trim();
  } while (t !== prev);
  return t;
}

function normalizeSingleSlashToMdfc(s) {
  const t = s.trim();
  if (t.includes("//")) return t;
  return t.replace(/\s+\/\s+/, " // ");
}

/** import_set_number_junk-style trailing strip (lockstep with preview-scryfall-cache-import-set-number-junk.mjs) */
function stripTrailingImportSetParen(s) {
  let t = s.trim();
  let prev;
  do {
    prev = t;
    t = t
      .replace(/\s*\(\s*[a-z0-9]{2,6}\s*\)\s*\d+[a-z]?\s*(?:★|☆)?\s*$/iu, "")
      .trim();
  } while (t !== prev);
  return t;
}

function importJunkPipeline(original) {
  let t = normalizeCurlyQuotesAndSpaces(original).trim();
  t = stripTrailingImportSetParen(t);
  t = normalizeSingleSlashToMdfc(t);
  t = stripTrailingImportSetParen(t);
  return t.trim();
}

const REPAIR_STEPS_PASS1 = [
  { id: "trim", fn: (s) => s.trim() },
  { id: "strip_outer_quotes", fn: stripOuterQuotes },
  { id: "strip_outer_double_brackets", fn: stripOuterDoubleBrackets },
  { id: "strip_leading_dash", fn: stripLeadingDash },
  { id: "strip_leading_qty_prefix", fn: stripLeadingQtyPrefix },
  { id: "strip_leading_stuck_digits", fn: stripLeadingStuckDigits },
  { id: "strip_trailing_set_paren_number", fn: stripTrailingSetParenNumber },
  { id: "strip_trailing_comma_number", fn: stripTrailingCommaNumber },
  { id: "strip_known_tag_brackets", fn: stripKnownTagBrackets },
];

const REPAIR_STEPS_PASS1_DOUBLE = [...REPAIR_STEPS_PASS1, ...REPAIR_STEPS_PASS1];

const REPAIR_STEPS_PASS2 = [
  { id: "strip_trailing_price", fn: stripTrailingPrice },
  { id: "strip_trailing_collector_rarity", fn: stripTrailingCollectorRarity },
  { id: "strip_foil_markers", fn: stripFoilMarkers },
  { id: "strip_trailing_role_tags", fn: stripTrailingRoleTags },
  { id: "normalize_single_slash_to_mdfc", fn: normalizeSingleSlashToMdfc },
];

const REPAIR_STEPS_PASS2_DOUBLE = [...REPAIR_STEPS_PASS2, ...REPAIR_STEPS_PASS2];

function comboPass1Norm(pre) {
  return normalizeScryfallCacheName(
    stripKnownTagBrackets(
      stripTrailingSetParenNumber(
        stripLeadingQtyPrefix(stripOuterDoubleBrackets(stripOuterQuotes(pre.trim())))
      )
    )
  );
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

function buildFaceToUniqueFull(cards) {
  const faceToFulls = new Map();
  for (const card of cards) {
    const full = normalizeScryfallCacheName(String(card.name ?? ""));
    if (!full) continue;
    const faces = Array.isArray(card.card_faces) ? card.card_faces : [];
    for (const face of faces) {
      if (!face?.name) continue;
      const fn = normalizeScryfallCacheName(String(face.name));
      if (!fn || fn === full) continue;
      if (!faceToFulls.has(fn)) faceToFulls.set(fn, new Set());
      faceToFulls.get(fn).add(full);
    }
  }
  const out = new Map();
  for (const [fn, set] of faceToFulls) {
    if (set.size === 1) out.set(fn, [...set][0]);
  }
  return out;
}

async function fetchBulkData() {
  const r = await fetch("https://api.scryfall.com/bulk-data", { cache: "no-store" });
  if (!r.ok) throw new Error(`bulk-data HTTP ${r.status}`);
  const meta = await r.json();
  const entry = (meta?.data || []).find((d) => d?.type === "default_cards");
  if (!entry?.download_uri) throw new Error("No default_cards in bulk-data");
  console.log(
    `[ai-review] Fetching default_cards (${entry.updated_at || "?"}, ${entry.size ? Math.round(entry.size / 1024 / 1024) + "MB" : "?"})...`
  );
  const bulkResp = await fetch(entry.download_uri, { cache: "no-store" });
  if (!bulkResp.ok) throw new Error(`Bulk download HTTP ${bulkResp.status}`);
  const cards = await bulkResp.json();
  if (!Array.isArray(cards)) throw new Error("default_cards is not an array");
  const canonicalSet = new Set();
  const normToDisplay = new Map();
  for (const c of cards) {
    if (c?.name == null) continue;
    const k = normalizeScryfallCacheName(String(c.name));
    if (!k) continue;
    canonicalSet.add(k);
    if (!normToDisplay.has(k)) normToDisplay.set(k, String(c.name));
  }
  const faceToFull = buildFaceToUniqueFull(cards);
  return {
    canonicalSet,
    normToDisplay,
    faceToFull,
    bulkMeta: { updated_at: entry.updated_at, download_uri: entry.download_uri, size: entry.size },
  };
}

const MAX_CANDIDATES = 5;

/**
 * Small list of deterministic transform hits against oracle set or unique face→full.
 */
function collectDeterministicCandidates(original, canonicalSet, faceToFull, normToDisplay) {
  const pre = normalizeCurlyQuotesAndSpaces(original);
  const out = [];
  const seenNorm = new Set();

  function push(normKey, source) {
    if (!normKey || seenNorm.has(normKey)) return;
    if (canonicalSet.has(normKey)) {
      seenNorm.add(normKey);
      out.push({
        kind: "oracle_exact",
        source,
        normalized_key: normKey,
        display_name: normToDisplay.get(normKey) || normKey,
      });
      return;
    }
    if (faceToFull.has(normKey)) {
      const fullN = faceToFull.get(normKey);
      if (seenNorm.has(fullN)) return;
      seenNorm.add(fullN);
      out.push({
        kind: "unique_face_to_full",
        source,
        normalized_key: fullN,
        display_name: normToDisplay.get(fullN) || fullN,
      });
    }
  }

  let s = pre;
  for (const step of REPAIR_STEPS_PASS1_DOUBLE) {
    s = step.fn(s);
    push(normalizeScryfallCacheName(s), `pass1_cumulative:${step.id}`);
    if (out.length >= MAX_CANDIDATES) return out.slice(0, MAX_CANDIDATES);
  }

  for (const step of REPAIR_STEPS_PASS1) {
    push(normalizeScryfallCacheName(step.fn(pre)), `pass1_single:${step.id}`);
  }

  const combo = comboPass1Norm(pre);
  if (combo) push(combo, "pass1_combo:quotes_brackets_qty_set_tags");

  s = pre;
  for (const step of REPAIR_STEPS_PASS2_DOUBLE) {
    s = step.fn(s);
    push(normalizeScryfallCacheName(s), `pass2_cumulative:${step.id}`);
    if (out.length >= MAX_CANDIDATES) return out.slice(0, MAX_CANDIDATES);
  }

  for (const step of REPAIR_STEPS_PASS2) {
    push(normalizeScryfallCacheName(step.fn(pre)), `pass2_single:${step.id}`);
  }

  const ij = importJunkPipeline(original);
  push(normalizeScryfallCacheName(ij), "import_junk_pipeline");

  return out.slice(0, MAX_CANDIDATES);
}

function uniqueFaceHint(original, faceToFull, normToDisplay) {
  const pre = normalizeCurlyQuotesAndSpaces(original);
  const fk = normalizeScryfallCacheName(pre);
  if (faceToFull.has(fk)) {
    const fullN = faceToFull.get(fk);
    return {
      raw_matches_unique_face: true,
      full_normalized_key: fullN,
      suggested_display_name: normToDisplay.get(fullN) || fullN,
    };
  }
  return { raw_matches_unique_face: false };
}

function computeHints(original, category, normalizedName) {
  const t = String(original);
  const low = t.toLowerCase();
  const words = normalizedName.split(/\s+/).filter(Boolean);
  return {
    bracket_pollution:
      /\[\[|\]\]/.test(t) || /^\[\[/.test(t.trim()) || category === "bracketed_name",
    quote_pollution:
      /^["']/.test(t.trim()) || /["']$/.test(t.trim()) || category === "quoted_name",
    import_set_number_junk:
      /\(\s*[a-z0-9]{2,6}\s*\)\s*\d+[a-z]?\s*(?:★|☆)?\s*$/i.test(t) ||
      category === "import_set_number_junk",
    budget_price_junk: /\$\s*\d/.test(t) || /\s+\$\s*\d+(?:\.\d{1,2})?\s*$/i.test(t),
    possible_alchemy: /^a-/i.test(t.trim()) || normalizedName.startsWith("a-"),
    possible_valid_weird:
      (normalizedName.includes("//") || (words.length >= 2 && words.length <= 12 && t.length <= 120)) &&
      !isObviousPromptOrSentenceJunk(t) &&
      !isPunctuationOnlyGarbage(t),
    likely_non_card_junk:
      isObviousPromptOrSentenceJunk(t) ||
      isPunctuationOnlyGarbage(t) ||
      t.length > 120 ||
      /please |analyze my|what's missing|deck analysis/i.test(low),
  };
}

function parseArgs(argv) {
  let auditJson = join(frontendRoot, "tmp", "scryfall-cache-name-audit.json");
  let previewJson = join(frontendRoot, "tmp", "scryfall-cache-cleanup-preview.json");
  let outJson = join(frontendRoot, "tmp", "scryfall-cache-ai-review-input.json");
  let outCsv = join(frontendRoot, "tmp", "scryfall-cache-ai-review-summary.csv");
  let outPrompt = join(frontendRoot, "tmp", "scryfall-cache-ai-review-prompt.txt");
  let includeRepairs = false;
  let skipBulk = false;
  let canonicalJsonPath = null;

  for (const a of argv) {
    if (a.startsWith("--audit-json=")) auditJson = resolve(a.slice("--audit-json=".length));
    else if (a.startsWith("--preview-json=")) previewJson = resolve(a.slice("--preview-json=".length));
    else if (a.startsWith("--out-json=")) outJson = resolve(a.slice("--out-json=".length));
    else if (a.startsWith("--out-csv=")) outCsv = resolve(a.slice("--out-csv=".length));
    else if (a.startsWith("--out-prompt=")) outPrompt = resolve(a.slice("--out-prompt=".length));
    else if (a === "--include-repairs") includeRepairs = true;
    else if (a === "--skip-bulk-download") skipBulk = true;
    else if (a.startsWith("--canonical-json=")) canonicalJsonPath = resolve(a.slice("--canonical-json=".length));
  }

  if (skipBulk && !canonicalJsonPath) {
    console.error("[ai-review] --skip-bulk-download requires --canonical-json=path (or omit skip for full bulk)");
    process.exit(1);
  }

  return {
    auditJson,
    previewJson,
    outJson,
    outCsv,
    outPrompt,
    includeRepairs,
    skipBulk,
    canonicalJsonPath,
  };
}

function loadCanonicalSetFromFile(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const arr = Array.isArray(raw) ? raw : raw.names || raw.canonicalNames;
  if (!Array.isArray(arr)) throw new Error("canonical-json must be a JSON array of strings (or { names: [] })");
  return new Set(arr.map((s) => normalizeScryfallCacheName(String(s))).filter(Boolean));
}

function csvEscape(s) {
  const t = String(s ?? "");
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function buildPromptText(outJsonPath) {
  return `You are assisting with cleanup of bad primary-key strings in a Magic: The Gathering card cache (Scryfall-shaped names).

## Input file
Attach or paste the JSON export at:
  ${outJsonPath}

The field \`rows[]\` lists unmatched cache names. Each row includes:
- \`original_name\`, \`category\` (from an audit bucket), \`normalized_name\`
- \`cleanup_preview\`: latest deterministic mapper output (proposed_action, reason, etc.) if present
- \`deterministic_candidates\`: up to ${MAX_CANDIDATES} transform hits against latest default_cards (oracle exact or unique face→full), when bulk was loaded
- \`unique_face_to_full_hint\`: whether the raw string matches a unique MDFC face name
- \`hints\`: quick heuristics (bracket/quote/import junk, price, Alchemy-style prefix, etc.)

## Task
For EACH row, output ONE JSON object (or a table) with:

1. \`original_name\` (echo)
2. \`classification\` — exactly one of:
   - \`repair_to_canonical\` — should map to a single real Scryfall card name
   - \`delete_candidate\` — junk, prompt text, fragment, or not a card name; safe to drop from cache
   - \`manual_keep\` — legitimate edge case to preserve as-is or handle outside this pipeline
   - \`unsure\` — need human follow-up

3. If classification is \`repair_to_canonical\`:
   - \`proposed_target_name\`: exact oracle card name as printed on Scryfall (use title case / MDFC \` // \` if double-faced)
   - \`reason\`: one short sentence
   - \`confidence\`: \`high\` | \`medium\` | \`low\`

4. If \`delete_candidate\` or \`manual_keep\`, briefly say why (one line).

## Rules
- Prefer deterministic_candidates and cleanup_preview when they agree with Scryfall reality.
- Do not invent card names; if uncertain, use \`unsure\`.
- Alchemy digital cards may use an \`a-\` prefix; Arena-only names exist.
- Some rows are deck fragments, CSV noise, or user prompts — those are usually \`delete_candidate\`.

## Output format
Return a JSON array of objects, one per input row, in the same order as \`rows[]\`.
`;
}

async function main() {
  const {
    auditJson,
    previewJson,
    outJson,
    outCsv,
    outPrompt,
    includeRepairs,
    skipBulk,
    canonicalJsonPath,
  } = parseArgs(process.argv.slice(2));

  if (!existsSync(auditJson)) {
    console.error(`[ai-review] Audit not found: ${auditJson}`);
    process.exit(1);
  }
  if (!existsSync(previewJson)) {
    console.error(`[ai-review] Preview not found: ${previewJson}`);
    process.exit(1);
  }

  const audit = JSON.parse(readFileSync(auditJson, "utf8"));
  const previewDoc = JSON.parse(readFileSync(previewJson, "utf8"));
  const unmatched = audit.unmatched;
  const previewRows = previewDoc.rows;
  if (!Array.isArray(unmatched) || !Array.isArray(previewRows)) {
    console.error("[ai-review] Expected audit.unmatched[] and preview.rows[]");
    process.exit(1);
  }

  /** @type {Map<string, object>} */
  const previewByName = new Map();
  for (const r of previewRows) {
    const k = String(r.original_name ?? "");
    if (k) previewByName.set(k, r);
  }

  let canonicalSet = new Set();
  let normToDisplay = new Map();
  let faceToFull = new Map();
  let bulkMeta = null;

  if (skipBulk && canonicalJsonPath) {
    canonicalSet = loadCanonicalSetFromFile(canonicalJsonPath);
    console.log(`[ai-review] Loaded canonical set from file: ${canonicalSet.size} (no face map, no display map)`);
  } else {
    const b = await fetchBulkData();
    canonicalSet = b.canonicalSet;
    normToDisplay = b.normToDisplay;
    faceToFull = b.faceToFull;
    bulkMeta = b.bulkMeta;
    console.log(`[ai-review] Canonical: ${canonicalSet.size}; face→full: ${faceToFull.size}`);
  }

  const exported = [];
  let missingPreview = 0;
  /** @type {Record<string, number>} */
  const summaryByCategory = {};
  /** @type {Record<string, number>} */
  const summaryByCleanupActionInExport = {};

  for (let i = 0; i < unmatched.length; i++) {
    const u = unmatched[i];
    const original_name = String(u.name ?? "");
    const category = u.category ?? "unknown";
    const pr = previewByName.get(original_name);
    if (!pr) missingPreview++;

    if (!includeRepairs && pr?.proposed_action === "repair_to_canonical") continue;

    const actionKey = pr?.proposed_action ?? "_no_preview";
    summaryByCleanupActionInExport[actionKey] = (summaryByCleanupActionInExport[actionKey] || 0) + 1;
    summaryByCategory[category] = (summaryByCategory[category] || 0) + 1;

    const normalized_name = normalizeScryfallCacheName(normalizeCurlyQuotesAndSpaces(original_name));

    let deterministic_candidates = [];
    if (!skipBulk) {
      deterministic_candidates = collectDeterministicCandidates(
        original_name,
        canonicalSet,
        faceToFull,
        normToDisplay
      );
    }

    const unique_face_to_full_hint = skipBulk
      ? { skipped: true, reason: "no_bulk" }
      : uniqueFaceHint(original_name, faceToFull, normToDisplay);

    exported.push({
      index: exported.length + 1,
      original_name,
      category,
      normalized_name,
      cleanup_preview: pr
        ? {
            proposed_action: pr.proposed_action,
            proposed_target_name: pr.proposed_target_name ?? null,
            confidence: pr.confidence ?? null,
            reason: pr.reason ?? null,
            repair_pass: pr.repair_pass ?? null,
            matched_by_rule: pr.matched_by_rule ?? null,
          }
        : null,
      deterministic_candidates,
      unique_face_to_full_hint,
      hints: computeHints(original_name, category, normalized_name),
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    purpose: "AI-assisted human review export — no DB writes",
    filter: includeRepairs ? "all_unmatched_including_repairs" : "manual_review_and_delete_only",
    sources: {
      auditPath: auditJson,
      previewPath: previewJson,
    },
    auditSummary: {
      unmatchedCount: audit.unmatchedCount ?? unmatched.length,
      categoryCounts: audit.categoryCounts ?? null,
    },
    previewSummary: previewDoc.summary ?? null,
    scryfallBulk: bulkMeta,
    canonicalSetSize: canonicalSet.size,
    faceToFullMapSize: faceToFull.size,
    exportSummary: {
      rows_exported: exported.length,
      preview_rows_missing: missingPreview,
      include_repairs: includeRepairs,
    },
    summaryByCategory,
    summaryByCleanupActionInExport,
    rows: exported,
  };

  mkdirSync(dirname(outJson), { recursive: true });
  writeFileSync(outJson, JSON.stringify(report, null, 2), "utf8");

  const promptBody = buildPromptText(outJson);
  writeFileSync(outPrompt, promptBody, "utf8");

  const csvHeader =
    "index,original_name,category,normalized_name,preview_action,preview_reason,hints_flags,deterministic_displays\n";
  const csvBody = exported
    .map((r) => {
      const h = r.hints;
      const hintStr = [
        h.bracket_pollution && "bracket",
        h.quote_pollution && "quote",
        h.import_set_number_junk && "import_set",
        h.budget_price_junk && "price",
        h.possible_alchemy && "alchemy",
        h.possible_valid_weird && "weird_ok",
        h.likely_non_card_junk && "junk",
      ]
        .filter(Boolean)
        .join(";");
      const disp = r.deterministic_candidates.map((c) => c.display_name).join(" | ");
      return [
        r.index,
        r.original_name,
        r.category,
        r.normalized_name,
        r.cleanup_preview?.proposed_action ?? "",
        r.cleanup_preview?.reason ?? "",
        hintStr,
        disp,
      ]
        .map(csvEscape)
        .join(",");
    })
    .join("\n");
  writeFileSync(outCsv, csvHeader + csvBody, "utf8");

  console.log("");
  console.log("=== scryfall_cache AI review export (read-only) ===");
  console.log(`Rows exported:     ${exported.length}`);
  console.log(`Missing preview:   ${missingPreview}`);
  console.log(`Include repairs:   ${includeRepairs}`);
  console.log("");
  console.log(`Wrote JSON:   ${outJson}`);
  console.log(`Wrote CSV:    ${outCsv}`);
  console.log(`Wrote prompt: ${outPrompt}`);
  console.log("[ai-review] END (ok)");
}

main().catch((e) => {
  console.error("[ai-review] FAILED:", e?.message || e);
  process.exit(1);
});
