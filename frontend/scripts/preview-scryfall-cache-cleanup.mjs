#!/usr/bin/env node
/**
 * PREVIEW ONLY — proposes repair / delete / manual review for unmatched scryfall_cache.name rows.
 * Reads output from audit-scryfall-cache-names.mjs. Does NOT read or write Supabase.
 *
 * Pass 1: original transform pipeline (trim, quotes, brackets, qty, set codes, tags).
 * Pass 2: price/collector/foil/role tags, slash→MDFC, curly quotes; unique face→full card map.
 *
 * ## Run (from frontend/)
 *
 *   node scripts/preview-scryfall-cache-cleanup.mjs
 *
 * Optional:
 *   --audit-json=path     Input audit JSON (default: tmp/scryfall-cache-name-audit.json)
 *   --out-json=path       Output preview JSON (default: tmp/scryfall-cache-cleanup-preview.json)
 *   --out-csv=path        Output preview CSV
 *   --skip-bulk-download  Use --canonical-json instead of fetching default_cards
 *   --canonical-json=path JSON array of strings: pre-built canonical names (face map unavailable)
 */

import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const frontendRoot = resolve(__dirname, "..");

// LOCKSTEP: frontend/lib/server/scryfallCacheRow.ts → normalizeScryfallCacheName
function normalizeScryfallCacheName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Curly quotes / nbsp → ASCII-ish before any comparison (pass-0). */
function normalizeCurlyQuotesAndSpaces(s) {
  return String(s)
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
    .replace(/[\u00a0\u2000-\u200b\ufeff]/g, " ");
}

function parseArgs(argv) {
  let auditJson = join(frontendRoot, "tmp", "scryfall-cache-name-audit.json");
  let outJson = join(frontendRoot, "tmp", "scryfall-cache-cleanup-preview.json");
  let outCsv = join(frontendRoot, "tmp", "scryfall-cache-cleanup-preview.csv");
  let skipBulk = false;
  let canonicalJsonPath = null;

  for (const a of argv) {
    if (a.startsWith("--audit-json=")) auditJson = resolve(a.slice("--audit-json=".length));
    else if (a.startsWith("--out-json=")) outJson = resolve(a.slice("--out-json=".length));
    else if (a.startsWith("--out-csv=")) outCsv = resolve(a.slice("--out-csv=".length));
    else if (a === "--skip-bulk-download") skipBulk = true;
    else if (a.startsWith("--canonical-json="))
      canonicalJsonPath = resolve(a.slice("--canonical-json=".length));
  }

  return { auditJson, outJson, outCsv, skipBulk, canonicalJsonPath };
}

/**
 * Unique normalized face name → normalized full card.name (only when exactly one oracle full name).
 */
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

async function fetchCanonicalSetFromBulk() {
  const r = await fetch("https://api.scryfall.com/bulk-data", { cache: "no-store" });
  if (!r.ok) throw new Error(`bulk-data HTTP ${r.status}`);
  const meta = await r.json();
  const entry = (meta?.data || []).find((d) => d?.type === "default_cards");
  if (!entry?.download_uri) throw new Error("No default_cards in bulk-data");
  console.log(
    `[preview] Fetching default_cards (${entry.updated_at || "?"}, ${entry.size ? Math.round(entry.size / 1024 / 1024) + "MB" : "?"})...`
  );
  const bulkResp = await fetch(entry.download_uri, { cache: "no-store" });
  if (!bulkResp.ok) throw new Error(`Bulk download HTTP ${bulkResp.status}`);
  const cards = await bulkResp.json();
  if (!Array.isArray(cards)) throw new Error("default_cards is not an array");
  const set = new Set();
  for (const c of cards) {
    if (c?.name == null) continue;
    const k = normalizeScryfallCacheName(String(c.name));
    if (k) set.add(k);
  }
  const faceToFull = buildFaceToUniqueFull(cards);
  return {
    set,
    cards,
    faceToFull,
    bulkMeta: { updated_at: entry.updated_at, download_uri: entry.download_uri, size: entry.size },
  };
}

function loadCanonicalSetFromFile(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const arr = Array.isArray(raw) ? raw : raw.names || raw.canonicalNames;
  if (!Array.isArray(arr)) throw new Error("canonical-json must be a JSON array of strings (or { names: [] })");
  return new Set(arr.map((s) => normalizeScryfallCacheName(String(s))).filter(Boolean));
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

/** e.g. "blood moon $8.49" */
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

/** e.g. "… 0137 r", "… 0299 c" */
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

/** Single " / " between words → " // " for MDFC/pathway matching (only when no "//" yet). */
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

function resolveAgainstSetAndFace(k, canonicalSet, faceToFull) {
  if (!k) return null;
  if (canonicalSet.has(k)) return { target: k, via: "canonical" };
  if (faceToFull.has(k)) return { target: faceToFull.get(k), via: "face" };
  return null;
}

/**
 * Pass 1: cumulative + single-step + combo (legacy).
 * `pre` should already have normalizeCurlyQuotesAndSpaces applied.
 */
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

/**
 * Pass 2: new strips + slash; after each step check canonical set OR unique face→full.
 */
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
      reason: "Pass 2: DB string is a unique front/face name → full card.name",
    };
  }

  return null;
}

/** Conservative: obvious prompts / sentences, not odd card names. */
function isObviousPromptOrSentenceJunk(s) {
  const t = s.trim();
  if (t.length < 25) return false;
  const low = t.toLowerCase();
  if (/please analyze|analyze this commander|analyze my commander|tell me what|what's missing|what is missing|please review|deck analysis:/i.test(low))
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

function isDeleteCandidate(original, auditCategory) {
  const t = original.trim();
  if (isPunctuationOnlyGarbage(t)) return true;
  if (isObviousPromptOrSentenceJunk(t)) return true;
  if (/^\s*\/\//.test(t)) return true;
  if (/^\[commander\]$/i.test(t) || /^\[creature\]$/i.test(t) || /^\[creatures\]$/i.test(t))
    return true;
  if (/^\[/.test(t) && /\]$/.test(t) && !t.includes("//")) {
    const inner = t.slice(1, -1).toLowerCase();
    if (["commander", "creature", "creatures", "artifact"].includes(inner)) return true;
  }
  if (auditCategory === "leading_split_fragment" && /^\s*\/\//.test(t)) return true;
  return false;
}

function classifyRow(original, auditCategory, canonicalSet, faceToFull) {
  const pre = normalizeCurlyQuotesAndSpaces(original);

  const p1 = findRepairPass1(pre, canonicalSet);
  if (p1) {
    return {
      proposed_action: "repair_to_canonical",
      proposed_target_name: p1.target,
      confidence: p1.confidence,
      reason: p1.reason,
      repair_pass: 1,
      matched_by_rule: p1.matched_by_rule,
    };
  }

  const p2 = findRepairPass2(pre, canonicalSet, faceToFull);
  if (p2) {
    return {
      proposed_action: "repair_to_canonical",
      proposed_target_name: p2.target,
      confidence: p2.confidence,
      reason: p2.reason,
      repair_pass: 2,
      matched_by_rule: p2.matched_by_rule,
    };
  }

  if (isDeleteCandidate(original, auditCategory)) {
    let delReason = "Heuristic junk; verify before delete";
    if (isObviousPromptOrSentenceJunk(original.trim())) delReason = "Obvious prompt/sentence (not a card name)";
    else if (isPunctuationOnlyGarbage(original.trim())) delReason = "Empty or punctuation-only";
    else if (/^\s*\/\//.test(original.trim())) delReason = "Leading // fragment";
    else if (/^\[(commander|creature|creatures)\]$/i.test(original.trim())) delReason = "Tag-only row";

    return {
      proposed_action: "delete_candidate",
      proposed_target_name: null,
      confidence: "medium",
      reason: delReason,
      repair_pass: null,
      matched_by_rule: "delete:heuristic",
    };
  }

  return {
    proposed_action: "manual_review",
    proposed_target_name: null,
    confidence: "low",
    reason: "No pass-1/2 repair or conservative delete match; review manually",
    repair_pass: null,
    matched_by_rule: "manual:none",
  };
}

async function main() {
  const { auditJson, outJson, outCsv, skipBulk, canonicalJsonPath } = parseArgs(process.argv.slice(2));

  if (skipBulk && !canonicalJsonPath) {
    console.error("[preview] --skip-bulk-download requires --canonical-json=path");
    process.exit(1);
  }

  if (!existsSync(auditJson)) {
    console.error(`[preview] Audit file not found: ${auditJson}`);
    console.error("Run: npm run audit:scryfall-cache-names");
    process.exit(1);
  }

  const audit = JSON.parse(readFileSync(auditJson, "utf8"));
  const unmatched = audit.unmatched;
  if (!Array.isArray(unmatched)) {
    console.error("[preview] audit JSON missing unmatched[] array");
    process.exit(1);
  }

  console.log(`[preview] START — ${unmatched.length} unmatched rows from ${auditJson}`);

  let canonicalSet;
  let bulkMeta = null;
  /** @type {Map<string,string>} */
  let faceToFull = new Map();

  if (skipBulk && canonicalJsonPath) {
    canonicalSet = loadCanonicalSetFromFile(canonicalJsonPath);
    console.log(`[preview] Loaded canonical set from file: ${canonicalSet.size} names (face map empty)`);
  } else {
    const r = await fetchCanonicalSetFromBulk();
    canonicalSet = r.set;
    bulkMeta = r.bulkMeta;
    faceToFull = r.faceToFull;
    console.log(`[preview] Canonical set from bulk: ${canonicalSet.size}`);
    console.log(`[preview] Unique face→full map entries: ${faceToFull.size}`);
  }

  const rows = [];
  let repairPass1 = 0;
  let repairPass2 = 0;
  let deleteCandidates = 0;
  let manual = 0;

  for (const u of unmatched) {
    const original_name = String(u.name ?? "");
    const category = u.category ?? "unknown";
    const c = classifyRow(original_name, category, canonicalSet, faceToFull);

    if (c.proposed_action === "repair_to_canonical") {
      if (c.repair_pass === 1) repairPass1++;
      else if (c.repair_pass === 2) repairPass2++;
    } else if (c.proposed_action === "delete_candidate") deleteCandidates++;
    else manual++;

    rows.push({
      original_name,
      category,
      proposed_action: c.proposed_action,
      proposed_target_name: c.proposed_target_name,
      confidence: c.confidence,
      reason: c.reason,
      repair_pass: c.repair_pass,
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
      total_unmatched: unmatched.length,
      repair_pass_1: repairPass1,
      repair_pass_2: repairPass2,
      repair_to_canonical_total: repairPass1 + repairPass2,
      delete_candidate: deleteCandidates,
      manual_review: manual,
    },
    rows,
  };

  mkdirSync(dirname(outJson), { recursive: true });
  writeFileSync(outJson, JSON.stringify(report, null, 2), "utf8");

  const csvHeader =
    "original_name,category,proposed_action,proposed_target_name,confidence,repair_pass,matched_by_rule,reason\n";
  const csvBody = rows
    .map((r) =>
      [
        r.original_name,
        r.category,
        r.proposed_action,
        r.proposed_target_name ?? "",
        r.confidence,
        r.repair_pass ?? "",
        r.matched_by_rule,
        r.reason,
      ]
        .map(csvEscape)
        .join(",")
    )
    .join("\n");
  writeFileSync(outCsv, csvHeader + csvBody, "utf8");

  console.log("");
  console.log("=== Preview summary (no DB changes) ===");
  console.log(`Repair pass 1:           ${repairPass1}`);
  console.log(`Repair pass 2:           ${repairPass2}`);
  console.log(`Repair (total):          ${repairPass1 + repairPass2}`);
  console.log(`Delete candidates:       ${deleteCandidates}`);
  console.log(`Manual review:           ${manual}`);
  console.log("");
  console.log(`Wrote JSON: ${outJson}`);
  console.log(`Wrote CSV:  ${outCsv}`);
  console.log("[preview] END (ok)");
}

function csvEscape(s) {
  const t = String(s);
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

main().catch((e) => {
  console.error("[preview] FAILED:", e?.message || e);
  process.exit(1);
});
