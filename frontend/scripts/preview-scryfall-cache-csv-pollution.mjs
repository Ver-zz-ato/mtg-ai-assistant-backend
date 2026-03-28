#!/usr/bin/env node
/**
 * PREVIEW ONLY — classify `csv_pollution` audit rows into repair / delete / manual.
 * Reads tmp/scryfall-cache-name-audit.json, fetches Scryfall default_cards (no DB).
 *
 * Run: npm run preview:scryfall-cache-csv-pollution
 *
 * LOCKSTEP: normalizeScryfallCacheName matches frontend/lib/server/scryfallCacheRow.ts
 * Repair passes align with preview-scryfall-cache-cleanup.mjs (subset duplicated here).
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

/** CSV: trailing `, budget $…`, `, $…`, ` budget $…` */
function stripCsvBudgetAndCommaPrice(s) {
  let t = s.trim();
  let prev;
  do {
    prev = t;
    t = t.replace(/,\s*budget\s*\$[\d.,]+\s*$/i, "").trim();
    t = t.replace(/,\s*\$\s*\d+(?:\.\d{1,2})?\s*$/i, "").trim();
    t = t.replace(/,\s*\$\d+\s*$/i, "").trim();
    t = t.replace(/\s+budget\s*\$[\d.,]+\s*$/i, "").trim();
  } while (t !== prev);
  return t;
}

/** Deck / theme suffix after en dash or hyphen (not card MDFC ` // `). */
function stripTrailingDashTitleSuffix(s) {
  const t = s.trim();
  const m = t.match(/^(.+?)\s+[-–—]\s+.+$/);
  if (!m) return t;
  return m[1].trim();
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

async function fetchBulk() {
  const r = await fetch("https://api.scryfall.com/bulk-data", { cache: "no-store" });
  if (!r.ok) throw new Error(`bulk-data HTTP ${r.status}`);
  const meta = await r.json();
  const entry = (meta?.data || []).find((d) => d?.type === "default_cards");
  if (!entry?.download_uri) throw new Error("No default_cards in bulk-data");
  console.log(
    `[csv-pollution] Fetching default_cards (${entry.updated_at || "?"}, ${entry.size ? Math.round(entry.size / 1024 / 1024) + "MB" : "?"})...`
  );
  const bulkResp = await fetch(entry.download_uri, { cache: "no-store" });
  if (!bulkResp.ok) throw new Error(`Bulk download HTTP ${bulkResp.status}`);
  const cards = await bulkResp.json();
  if (!Array.isArray(cards)) throw new Error("default_cards is not an array");
  const set = new Set();
  const normToDisplay = new Map();
  for (const c of cards) {
    if (c?.name == null) continue;
    const k = normalizeScryfallCacheName(String(c.name));
    if (!k) continue;
    set.add(k);
    if (!normToDisplay.has(k)) normToDisplay.set(k, String(c.name));
  }
  const faceToFull = buildFaceToUniqueFull(cards);
  return {
    set,
    normToDisplay,
    faceToFull,
    bulkMeta: { updated_at: entry.updated_at, download_uri: entry.download_uri, size: entry.size },
  };
}

function resolveAgainstSetAndFace(k, canonicalSet, faceToFull) {
  if (!k) return null;
  if (canonicalSet.has(k)) return { target: k, via: "canonical" };
  if (faceToFull.has(k)) return { target: faceToFull.get(k), via: "face" };
  return null;
}

function findRepairPass1(pre, canonicalSet) {
  let s = pre;
  const applied = [];
  for (const step of REPAIR_STEPS_PASS1_DOUBLE) {
    s = step.fn(s);
    applied.push(step.id);
    const k = normalizeScryfallCacheName(s);
    if (k && canonicalSet.has(k)) {
      return {
        target: k,
        confidence: applied.length <= 2 ? "high" : applied.length <= 8 ? "medium" : "low",
        matched_by_rule: `pass1:cumulative_after:${step.id}`,
        reason: `Pass 1 cumulative through ${step.id} (${applied.length} micro-steps)`,
      };
    }
  }
  for (const step of REPAIR_STEPS_PASS1) {
    const once = normalizeScryfallCacheName(step.fn(pre));
    if (once && canonicalSet.has(once)) {
      return {
        target: once,
        confidence: "high",
        matched_by_rule: `pass1:single_step:${step.id}`,
        reason: `Pass 1 single step: ${step.id}`,
      };
    }
  }
  const combo = normalizeScryfallCacheName(
    stripKnownTagBrackets(
      stripTrailingSetParenNumber(
        stripLeadingQtyPrefix(stripOuterDoubleBrackets(stripOuterQuotes(pre.trim())))
      )
    )
  );
  if (combo && canonicalSet.has(combo)) {
    return {
      target: combo,
      confidence: "medium",
      matched_by_rule: "pass1:combo:quotes_brackets_qty_set_tags",
      reason: "Pass 1 fixed combo path",
    };
  }
  return null;
}

function findRepairPass2(pre, canonicalSet, faceToFull) {
  let s = pre;
  for (const step of REPAIR_STEPS_PASS2_DOUBLE) {
    s = step.fn(s);
    const k = normalizeScryfallCacheName(s);
    const hit = resolveAgainstSetAndFace(k, canonicalSet, faceToFull);
    if (hit) {
      return {
        target: hit.target,
        confidence: hit.via === "face" ? "medium" : "high",
        matched_by_rule:
          hit.via === "face"
            ? `pass2:face_resolve:unique_after:${step.id}`
            : `pass2:cumulative_after:${step.id}`,
        reason:
          hit.via === "face"
            ? `Pass 2: face name matched unique MDFC/full card after ${step.id}`
            : `Pass 2 cumulative through ${step.id}`,
      };
    }
  }
  for (const step of REPAIR_STEPS_PASS2) {
    const once = normalizeScryfallCacheName(step.fn(pre));
    const hit = resolveAgainstSetAndFace(once, canonicalSet, faceToFull);
    if (hit) {
      return {
        target: hit.target,
        confidence: "high",
        matched_by_rule:
          hit.via === "face"
            ? `pass2:face_resolve:unique_after_single:${step.id}`
            : `pass2:single_step:${step.id}`,
        reason: `Pass 2 single step: ${step.id}`,
      };
    }
  }
  const fk = normalizeScryfallCacheName(pre);
  const faceOnly = resolveAgainstSetAndFace(fk, canonicalSet, faceToFull);
  if (faceOnly && faceOnly.via === "face") {
    return {
      target: faceOnly.target,
      confidence: "medium",
      matched_by_rule: "pass2:face_resolve:unique_raw",
      reason: "Pass 2: unique face name → full card.name",
    };
  }
  return null;
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

/** Conservative delete for csv bucket */
function isDeleteCandidateCsv(original) {
  const t = original.trim();
  if (isPunctuationOnlyGarbage(t)) return true;
  if (isObviousPromptOrSentenceJunk(t)) return true;
  if (/^deck:/i.test(t)) return true;
  if (/^\s*\/\//.test(t)) return true;
  return false;
}

function csvStripPipeline(s) {
  let t = s.trim();
  let prev;
  do {
    prev = t;
    t = stripCsvBudgetAndCommaPrice(t);
    t = stripTrailingPrice(t);
    t = stripTrailingDashTitleSuffix(t);
  } while (t !== prev);
  return t;
}

function collectStringVariants(pre) {
  const out = new Set();
  out.add(pre);

  let p = pre;
  for (let i = 0; i < 24; i++) {
    const n = stripCsvBudgetAndCommaPrice(p);
    out.add(n);
    if (n === p) break;
    p = n;
  }

  p = pre;
  for (let i = 0; i < 8; i++) {
    p = stripTrailingDashTitleSuffix(stripTrailingPrice(stripCsvBudgetAndCommaPrice(p)));
    out.add(p);
  }

  /** Only treat first comma as CSV split when the RHS looks like budget/price junk — not real card commas (e.g. "Aang, at the Crossroads"). */
  function commaLeftIfCsvJunkRhs(s) {
    const c = s.indexOf(",");
    if (c <= 0) return null;
    const right = s.slice(c + 1).trim();
    if (/^budget\s*\$/i.test(right)) return s.slice(0, c).trim();
    if (/^\$[\d.,]+/i.test(right)) return s.slice(0, c).trim();
    if (/^\$\s*[\d.,]+/i.test(right)) return s.slice(0, c).trim();
    return null;
  }

  for (const v of [...out]) {
    const left = commaLeftIfCsvJunkRhs(v);
    if (left) out.add(left);
  }
  return [...out];
}

function displayTarget(normKey, normToDisplay) {
  return normToDisplay.get(normKey) || normKey;
}

function classifyCsvRow(original, canonicalSet, faceToFull, normToDisplay) {
  const pre = normalizeCurlyQuotesAndSpaces(original);

  const tryResolve = (normKey, reason, matched_by_rule, confidence) => {
    if (!normKey) return null;
    if (canonicalSet.has(normKey)) {
      return {
        proposed_action: "repair_to_canonical",
        proposed_target_name: displayTarget(normKey, normToDisplay),
        confidence,
        reason,
        matched_by_rule,
      };
    }
    if (faceToFull.has(normKey)) {
      const t = faceToFull.get(normKey);
      return {
        proposed_action: "repair_to_canonical",
        proposed_target_name: displayTarget(t, normToDisplay),
        confidence: "medium",
        reason: `${reason} (unique face→full card.name)`,
        matched_by_rule: `${matched_by_rule}:face`,
      };
    }
    return null;
  }

  for (const v of collectStringVariants(pre)) {
    const k = normalizeScryfallCacheName(v);
    const hit = tryResolve(
      k,
      "CSV strip / comma segment matches canonical oracle name",
      "csv:variant_canonical_match",
      "high"
    );
    if (hit) return hit;
  }

  const prePipe = csvStripPipeline(pre);
  let hit = tryResolve(
    normalizeScryfallCacheName(prePipe),
    "After CSV budget/price/dash-title normalization matches canonical name",
    "csv:pipeline_canonical_match",
    "high"
  );
  if (hit) return hit;

  const p1 = findRepairPass1(prePipe, canonicalSet);
  if (p1) {
    return {
      proposed_action: "repair_to_canonical",
      proposed_target_name: displayTarget(p1.target, normToDisplay),
      confidence: p1.confidence,
      reason: p1.reason,
      matched_by_rule: p1.matched_by_rule,
    };
  }

  const p2 = findRepairPass2(prePipe, canonicalSet, faceToFull);
  if (p2) {
    return {
      proposed_action: "repair_to_canonical",
      proposed_target_name: displayTarget(p2.target, normToDisplay),
      confidence: p2.confidence,
      reason: p2.reason,
      matched_by_rule: p2.matched_by_rule,
    };
  }

  const p1raw = findRepairPass1(pre, canonicalSet);
  if (p1raw) {
    return {
      proposed_action: "repair_to_canonical",
      proposed_target_name: displayTarget(p1raw.target, normToDisplay),
      confidence: p1raw.confidence,
      reason: p1raw.reason,
      matched_by_rule: p1raw.matched_by_rule,
    };
  }

  const p2raw = findRepairPass2(pre, canonicalSet, faceToFull);
  if (p2raw) {
    return {
      proposed_action: "repair_to_canonical",
      proposed_target_name: displayTarget(p2raw.target, normToDisplay),
      confidence: p2raw.confidence,
      reason: p2raw.reason,
      matched_by_rule: p2raw.matched_by_rule,
    };
  }

  if (isDeleteCandidateCsv(original)) {
    let delReason = "Heuristic: not a safe card name; verify before delete";
    if (/^deck:/i.test(original.trim())) delReason = "Deck label prefix (deck:) — not a card PK";
    else if (isObviousPromptOrSentenceJunk(original.trim())) delReason = "Obvious prompt/sentence";
    else if (isPunctuationOnlyGarbage(original.trim())) delReason = "Empty or punctuation-only";
    return {
      proposed_action: "delete_candidate",
      proposed_target_name: null,
      confidence: "medium",
      reason: delReason,
      matched_by_rule: "delete:csv_heuristic",
    };
  }

  return {
    proposed_action: "manual_review",
    proposed_target_name: null,
    confidence: "low",
    reason: "No CSV-safe repair to canonical name; not a conservative delete",
    matched_by_rule: "manual:none",
  };
}

function parseArgs(argv) {
  let auditJson = join(frontendRoot, "tmp", "scryfall-cache-name-audit.json");
  let outJson = join(frontendRoot, "tmp", "scryfall-cache-preview-csv-pollution.json");
  let outCsv = join(frontendRoot, "tmp", "scryfall-cache-preview-csv-pollution.csv");
  for (const a of argv) {
    if (a.startsWith("--audit-json=")) auditJson = resolve(a.slice("--audit-json=".length));
    else if (a.startsWith("--out-json=")) outJson = resolve(a.slice("--out-json=".length));
    else if (a.startsWith("--out-csv=")) outCsv = resolve(a.slice("--out-csv=".length));
  }
  return { auditJson, outJson, outCsv };
}

function csvEscape(s) {
  const t = String(s ?? "");
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

async function main() {
  const { auditJson, outJson, outCsv } = parseArgs(process.argv.slice(2));

  if (!existsSync(auditJson)) {
    console.error(`[csv-pollution] Audit not found: ${auditJson}`);
    process.exit(1);
  }

  const audit = JSON.parse(readFileSync(auditJson, "utf8"));
  const unmatched = audit.unmatched;
  if (!Array.isArray(unmatched)) {
    console.error("[csv-pollution] Expected unmatched[]");
    process.exit(1);
  }

  const csvRows = unmatched.filter((u) => u?.category === "csv_pollution");
  console.log(`[csv-pollution] csv_pollution rows: ${csvRows.length}`);

  const { set: canonicalSet, normToDisplay, faceToFull, bulkMeta } = await fetchBulk();
  console.log(`[csv-pollution] Canonical names: ${canonicalSet.size}; face→full: ${faceToFull.size}`);

  const rows = [];
  let repair = 0;
  let del = 0;
  let manual = 0;

  for (const u of csvRows) {
    const original_name = String(u.name ?? "");
    const c = classifyCsvRow(original_name, canonicalSet, faceToFull, normToDisplay);
    if (c.proposed_action === "repair_to_canonical") repair++;
    else if (c.proposed_action === "delete_candidate") del++;
    else manual++;

    rows.push({
      original_name,
      proposed_action: c.proposed_action,
      proposed_target_name: c.proposed_target_name,
      confidence: c.confidence,
      reason: c.reason,
      matched_by_rule: c.matched_by_rule,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    sourceAuditPath: auditJson,
    scryfallBulk: bulkMeta,
    canonicalSetSize: canonicalSet.size,
    faceToFullMapSize: faceToFull.size,
    summary: {
      csv_pollution_input: csvRows.length,
      repair_to_canonical: repair,
      delete_candidate: del,
      manual_review: manual,
    },
    rows,
  };

  mkdirSync(dirname(outJson), { recursive: true });
  writeFileSync(outJson, JSON.stringify(report, null, 2), "utf8");

  const header = [
    "original_name",
    "proposed_action",
    "proposed_target_name",
    "confidence",
    "reason",
  ].join(",");
  const csvBody = rows
    .map((r) =>
      [
        r.original_name,
        r.proposed_action,
        r.proposed_target_name ?? "",
        r.confidence,
        r.reason,
      ]
        .map(csvEscape)
        .join(",")
    )
    .join("\n");
  writeFileSync(outCsv, header + "\n" + csvBody, "utf8");

  console.log("");
  console.log("=== csv_pollution preview (no DB) ===");
  console.log(`repair_to_canonical: ${repair}`);
  console.log(`delete_candidate:    ${del}`);
  console.log(`manual_review:       ${manual}`);
  console.log("");
  console.log(`Wrote JSON: ${outJson}`);
  console.log(`Wrote CSV:  ${outCsv}`);
  console.log("[csv-pollution] END (ok)");
}

main().catch((e) => {
  console.error("[csv-pollution] FAILED:", e?.message || e);
  process.exit(1);
});
