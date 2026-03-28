#!/usr/bin/env node
/**
 * Rich export for REMAINING unmatched scryfall_cache.name rows (operator / AI review).
 * READ-ONLY: audit JSON + Supabase SELECT + Scryfall default_cards fetch.
 * No writes, no mutations.
 *
 * Outputs:
 *   tmp/scryfall-cache-remaining-ai-review.json
 *   tmp/scryfall-cache-remaining-ai-review.csv
 *   tmp/scryfall-cache-remaining-ai-review-prompt.txt
 *
 * Run (from frontend/):
 *   npm run export:scryfall-cache-remaining-ai-review
 *
 * LOCKSTEP: normalizeScryfallCacheName + strip helpers align with scryfallCacheRow.ts / preview-scryfall-cache-cleanup.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");

const MAX_CANDIDATES = 3;

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

async function fetchBulkCards() {
  const r = await fetch("https://api.scryfall.com/bulk-data", { cache: "no-store" });
  if (!r.ok) throw new Error(`bulk-data HTTP ${r.status}`);
  const meta = await r.json();
  const entry = (meta?.data || []).find((d) => d?.type === "default_cards");
  if (!entry?.download_uri) throw new Error("No default_cards in bulk-data");
  console.log(
    `[remaining-review] Fetching default_cards (${entry.updated_at || "?"}, ${entry.size ? Math.round(entry.size / 1024 / 1024) + "MB" : "?"})...`
  );
  const bulkResp = await fetch(entry.download_uri, { cache: "no-store" });
  if (!bulkResp.ok) throw new Error(`Bulk download HTTP ${bulkResp.status}`);
  const cards = await bulkResp.json();
  if (!Array.isArray(cards)) throw new Error("default_cards is not an array");
  return { cards, bulkMeta: { updated_at: entry.updated_at, download_uri: entry.download_uri, size: entry.size } };
}

/** First card per normalized oracle name (default_cards may repeat names across printings). */
function buildNormToCard(cards) {
  const normToCard = new Map();
  for (const c of cards) {
    if (c?.name == null) continue;
    const k = normalizeScryfallCacheName(String(c.name));
    if (!k || normToCard.has(k)) continue;
    normToCard.set(k, c);
  }
  return normToCard;
}

function cardSnippet(card) {
  if (!card) return null;
  const faces = Array.isArray(card.card_faces) ? card.card_faces : [];
  const ot =
    card.oracle_text ??
    (faces.length ? faces.map((f) => f.oracle_text || "").filter(Boolean).join("\n---\n") : null);
  const tl =
    card.type_line ??
    (faces.length ? faces.map((f) => f.type_line || "").filter(Boolean).join(" // ") : null);
  const img = card.image_uris || (faces[0] && faces[0].image_uris) || null;
  return {
    display_name: String(card.name ?? ""),
    normalized_pk: normalizeScryfallCacheName(String(card.name ?? "")),
    set: card.set ?? null,
    collector_number: card.collector_number ?? null,
    oracle_text: ot,
    type_line: tl,
    image_uris: img
      ? {
          small: img.small ?? null,
          normal: img.normal ?? null,
          art_crop: img.art_crop ?? null,
        }
      : null,
  };
}

/**
 * Deterministic candidate keys (ordered) with reasons. Resolves unique face → full oracle PK.
 */
function collectDeterministicKeys(original, canonicalSet, faceToFull) {
  const pre = normalizeCurlyQuotesAndSpaces(original);
  const out = [];
  const seen = new Set();

  function resolveToOraclePk(normKey) {
    if (!normKey) return null;
    if (canonicalSet.has(normKey)) return normKey;
    if (faceToFull.has(normKey)) return faceToFull.get(normKey);
    return null;
  }

  function pushRaw(normKey, reason) {
    const pk = resolveToOraclePk(normKey);
    if (!pk || seen.has(pk)) return;
    seen.add(pk);
    out.push({ normKey: pk, reason });
  }

  const fk = normalizeScryfallCacheName(pre);
  if (faceToFull.has(fk)) {
    pushRaw(faceToFull.get(fk), "face_match:unique_face_to_full");
  }

  let s = pre;
  for (const step of REPAIR_STEPS_PASS1_DOUBLE) {
    s = step.fn(s);
    pushRaw(normalizeScryfallCacheName(s), `exact_pipeline:pass1_cumulative:${step.id}`);
  }
  for (const step of REPAIR_STEPS_PASS1) {
    pushRaw(normalizeScryfallCacheName(step.fn(pre)), `exact_pipeline:pass1_single:${step.id}`);
  }
  const combo = comboPass1Norm(pre);
  if (combo) pushRaw(combo, "exact_pipeline:pass1_combo");
  s = pre;
  for (const step of REPAIR_STEPS_PASS2_DOUBLE) {
    s = step.fn(s);
    pushRaw(normalizeScryfallCacheName(s), `exact_pipeline:pass2_cumulative:${step.id}`);
  }
  for (const step of REPAIR_STEPS_PASS2) {
    pushRaw(normalizeScryfallCacheName(step.fn(pre)), `exact_pipeline:pass2_single:${step.id}`);
  }
  pushRaw(normalizeScryfallCacheName(importJunkPipeline(original)), "exact_pipeline:import_junk");

  return out;
}

/** Word overlap fuzzy: index built from deduped cards. */
function buildWordIndex(normToCard) {
  const wordToNormKeys = new Map();
  for (const [normKey] of normToCard) {
    const words = normKey.split(/\s+/).filter((w) => w.length > 2);
    for (const w of new Set(words)) {
      if (!wordToNormKeys.has(w)) wordToNormKeys.set(w, new Set());
      wordToNormKeys.get(w).add(normKey);
    }
  }
  return wordToNormKeys;
}

function fuzzyTopMatches(badNorm, wordToNormKeys, normToCard, exclude, max) {
  const badWords = new Set(badNorm.split(/\s+/).filter((w) => w.length > 2));
  if (badWords.size === 0) return [];
  const candidateKeys = new Set();
  for (const w of badWords) {
    const set = wordToNormKeys.get(w);
    if (set) for (const k of set) candidateKeys.add(k);
  }
  const scores = [];
  for (const k of candidateKeys) {
    if (exclude.has(k)) continue;
    const cw = new Set(k.split(/\s+/).filter((w) => w.length > 2));
    let inter = 0;
    for (const w of badWords) if (cw.has(w)) inter++;
    const union = new Set([...badWords, ...cw]).size;
    const score = union ? inter / union : 0;
    if (score > 0.15) scores.push({ normKey: k, score, reason: `word_overlap:jaccard_${score.toFixed(3)}` });
  }
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, max);
}

function buildStrippedVariants(original) {
  const pre = normalizeCurlyQuotesAndSpaces(original);
  return {
    after_curly_normalize: pre,
    after_strip_outer_quotes: stripOuterQuotes(pre),
    after_strip_double_brackets: stripOuterDoubleBrackets(pre),
    after_import_junk_pipeline: importJunkPipeline(original),
    after_pass1_combo_norm: comboPass1Norm(pre),
  };
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

function recommendHeuristic(original, auditCategory, candidates, badNorm, badRowPresent) {
  const top = candidates[0];
  const second = candidates[1];

  if (isPunctuationOnlyGarbage(original) || isObviousPromptOrSentenceJunk(original)) {
    return {
      recommended_action: "delete_candidate",
      confidence: "medium",
      reason: "Heuristic: empty/punctuation-only or obvious prompt/sentence junk",
    };
  }

  if (!top) {
    return {
      recommended_action: "unsure",
      confidence: "low",
      reason: "No Scryfall candidate from pipeline, face map, or word overlap",
    };
  }

  if (!badRowPresent) {
    return {
      recommended_action: "unsure",
      confidence: "low",
      reason: "No scryfall_cache row for this PK (audit vs DB drift)",
    };
  }

  const topReason = top.match_reason || "";
  const ambiguous =
    second &&
    top.match_reason?.startsWith("word_overlap") &&
    second.match_reason?.startsWith("word_overlap") &&
    Math.abs((top._score || 0) - (second._score || 0)) < 0.08;

  if (ambiguous) {
    return {
      recommended_action: "unsure",
      confidence: "low",
      reason: "Multiple similar word-overlap candidates; needs human/AI",
    };
  }

  if (topReason.startsWith("word_overlap")) {
    return {
      recommended_action: "unsure",
      confidence: "low",
      reason: "Only fuzzy word-overlap match; verify oracle identity before merge/rename",
    };
  }

  const exists = top.exists_in_scryfall_cache;

  if (topReason.startsWith("face_match") || topReason.startsWith("exact_pipeline")) {
    if (exists && top.normalized_pk !== badNorm) {
      return {
        recommended_action: "merge_then_delete_bad_row",
        confidence: topReason.startsWith("exact_pipeline") ? "high" : "medium",
        reason: "Canonical PK exists in DB; merge nulls from bad row then delete bad PK",
      };
    }
    if (!exists) {
      return {
        recommended_action: "rename_row_to_canonical",
        confidence: "medium",
        reason: "Strong deterministic match; target PK not in DB — rename bad row to canonical PK",
      };
    }
  }

  if (auditCategory === "unknown" && topReason.startsWith("exact_pipeline") && exists) {
    return {
      recommended_action: "merge_then_delete_bad_row",
      confidence: "medium",
      reason: "Deterministic pipeline + canonical row present",
    };
  }

  return {
    recommended_action: "keep_real",
    confidence: "low",
    reason: "Could be legitimate odd name, Arena/Alchemy, or needs manual classification",
  };
}

async function fetchCacheRowsByNames(supabase, names) {
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

function parseArgs(argv) {
  let auditJson = join(frontendRoot, "tmp", "scryfall-cache-name-audit.json");
  let outJson = join(frontendRoot, "tmp", "scryfall-cache-remaining-ai-review.json");
  let outCsv = join(frontendRoot, "tmp", "scryfall-cache-remaining-ai-review.csv");
  let outPrompt = join(frontendRoot, "tmp", "scryfall-cache-remaining-ai-review-prompt.txt");
  for (const a of argv) {
    if (a.startsWith("--audit-json=")) auditJson = resolve(a.slice("--audit-json=".length));
    else if (a.startsWith("--out-json=")) outJson = resolve(a.slice("--out-json=".length));
    else if (a.startsWith("--out-csv=")) outCsv = resolve(a.slice("--out-csv=".length));
    else if (a.startsWith("--out-prompt=")) outPrompt = resolve(a.slice("--out-prompt=".length));
  }
  return { auditJson, outJson, outCsv, outPrompt };
}

function csvEscape(s) {
  const t = String(s ?? "");
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function buildPromptText(outJsonPath) {
  return `You are reviewing bad primary-key strings in public.scryfall_cache (Magic: The Gathering).

## Input
Use the JSON export at:
  ${outJsonPath}

Each row has:
- bad_row: full current DB row for the unmatched name
- audit_category: heuristic bucket from the name audit
- hints: normalized name, stripped variants, face/full hints
- candidates: up to ${MAX_CANDIDATES} Scryfall default_cards matches with oracle/type/images and whether that PK already exists in scryfall_cache
- heuristic: automated guess (merge_then_delete_bad_row | rename_row_to_canonical | delete_candidate | keep_real | unsure) + confidence

## Task
For each row, confirm or override the heuristic. Output classifications suitable for a follow-up SQL preview script:
- merge_then_delete_bad_row — bad row should be merged into existing canonical PK then removed
- rename_row_to_canonical — rename bad row to normalized oracle PK (no duplicate PK)
- delete_candidate — not a valid card record
- keep_real — leave as-is or handle outside this pipeline
- unsure — needs human follow-up

Always use **normalized lowercase PK** for any proposed target (see candidates[].normalized_pk).

## Output
JSON array aligned with input order, with fields: original_name, final_action, proposed_target_pk (if repair), confidence, reason.
`;
}

async function main() {
  loadEnvFromDisk();
  const { auditJson, outJson, outCsv, outPrompt } = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error(
      "[remaining-review] Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY."
    );
    process.exit(1);
  }

  if (!existsSync(auditJson)) {
    console.error(`[remaining-review] Audit not found: ${auditJson}`);
    process.exit(1);
  }

  const audit = JSON.parse(readFileSync(auditJson, "utf8"));
  const unmatched = audit.unmatched;
  if (!Array.isArray(unmatched)) {
    console.error("[remaining-review] Expected unmatched[]");
    process.exit(1);
  }

  const names = unmatched.map((u) => String(u.name ?? "")).filter(Boolean);
  const categoryByName = new Map();
  for (const u of unmatched) {
    categoryByName.set(String(u.name ?? ""), u.category ?? "unknown");
  }

  console.log(`[remaining-review] Unmatched rows: ${names.length}; loading bulk + DB...`);

  const { cards, bulkMeta } = await fetchBulkCards();
  const canonicalSet = new Set();
  for (const c of cards) {
    if (c?.name == null) continue;
    const k = normalizeScryfallCacheName(String(c.name));
    if (k) canonicalSet.add(k);
  }
  const faceToFull = buildFaceToUniqueFull(cards);
  const normToCard = buildNormToCard(cards);
  const wordIndex = buildWordIndex(normToCard);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const badRowsByName = await fetchCacheRowsByNames(supabase, names);
  const allCandidatePks = new Set();
  for (const name of names) {
    const det = collectDeterministicKeys(name, canonicalSet, faceToFull);
    for (const { normKey } of det) allCandidatePks.add(normKey);
  }

  const cacheByPk = await fetchCacheRowsByNames(supabase, [...allCandidatePks, ...names]);

  const exportRows = [];

  for (const name of names) {
    const auditCategory = categoryByName.get(name) ?? "unknown";
    const badNorm = normalizeScryfallCacheName(normalizeCurlyQuotesAndSpaces(name));
    const bad_row = badRowsByName.get(name) ?? null;

    const det = collectDeterministicKeys(name, canonicalSet, faceToFull);
    const used = new Set();
    const candidates = [];

    for (const { normKey, reason } of det) {
      if (candidates.length >= MAX_CANDIDATES) break;
      if (!normKey || used.has(normKey)) continue;
      if (!normToCard.has(normKey)) continue;
      used.add(normKey);
      const card = normToCard.get(normKey);
      const snip = cardSnippet(card);
      const dbRow = cacheByPk.get(normKey) || null;
      candidates.push({
        rank: candidates.length + 1,
        match_reason: reason,
        ...snip,
        exists_in_scryfall_cache: !!dbRow,
        canonical_db_row: dbRow,
      });
    }

    if (candidates.length < MAX_CANDIDATES) {
      const fuzzy = fuzzyTopMatches(badNorm, wordIndex, normToCard, used, MAX_CANDIDATES - candidates.length);
      for (const { normKey, score, reason } of fuzzy) {
        if (candidates.length >= MAX_CANDIDATES) break;
        const card = normToCard.get(normKey);
        const snip = cardSnippet(card);
        const dbRow = cacheByPk.get(normKey) || null;
        const row = {
          rank: candidates.length + 1,
          match_reason: reason,
          ...snip,
          exists_in_scryfall_cache: !!dbRow,
          canonical_db_row: dbRow,
          _score: score,
        };
        candidates.push(row);
      }
    }

    const faceHint = (() => {
      const pre = normalizeCurlyQuotesAndSpaces(name);
      const fk = normalizeScryfallCacheName(pre);
      if (faceToFull.has(fk)) {
        return {
          raw_matches_unique_face: true,
          resolves_to_full_pk: faceToFull.get(fk),
        };
      }
      return { raw_matches_unique_face: false };
    })();

    const heuristic = recommendHeuristic(
      name,
      auditCategory,
      candidates,
      badNorm,
      !!bad_row
    );

    exportRows.push({
      original_name: name,
      audit_category: auditCategory,
      bad_row,
      hints: {
        normalized_name: badNorm,
        stripped_variants: buildStrippedVariants(name),
        face_name_full_name: faceHint,
      },
      candidates: candidates.map(({ _score, ...rest }) => rest),
      heuristic,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    sourceAuditPath: auditJson,
    scryfallBulk: bulkMeta,
    summary: {
      unmatched_count: names.length,
      bad_rows_found_in_db: names.filter((n) => badRowsByName.has(n)).length,
      canonical_set_size: canonicalSet.size,
      face_to_full_size: faceToFull.size,
    },
    rows: exportRows,
  };

  mkdirSync(dirname(outJson), { recursive: true });
  writeFileSync(outJson, JSON.stringify(report, null, 2), "utf8");

  const csvHeader =
    "original_name,audit_category,normalized_name,bad_row_present,heuristic_action,heuristic_confidence,candidate1_pk,candidate1_reason,candidate1_in_db,candidate2_pk,candidate2_reason,candidate3_pk,candidate3_reason\n";
  const csvBody = exportRows
    .map((r) => {
      const h = r.hints.normalized_name;
      const c = r.candidates;
      return [
        r.original_name,
        r.audit_category,
        h,
        r.bad_row ? "yes" : "no",
        r.heuristic.recommended_action,
        r.heuristic.confidence,
        c[0]?.normalized_pk ?? "",
        c[0]?.match_reason ?? "",
        c[0]?.exists_in_scryfall_cache ? "yes" : "no",
        c[1]?.normalized_pk ?? "",
        c[1]?.match_reason ?? "",
        c[2]?.normalized_pk ?? "",
        c[2]?.match_reason ?? "",
      ]
        .map(csvEscape)
        .join(",");
    })
    .join("\n");
  writeFileSync(outCsv, csvHeader + csvBody, "utf8");

  writeFileSync(outPrompt, buildPromptText(outJson), "utf8");

  console.log("");
  console.log("=== scryfall_cache remaining rows — AI review export ===");
  console.log(`Rows: ${exportRows.length}`);
  console.log(`Bad rows in DB: ${report.summary.bad_rows_found_in_db}`);
  console.log("");
  console.log(`Wrote JSON:   ${outJson}`);
  console.log(`Wrote CSV:    ${outCsv}`);
  console.log(`Wrote prompt: ${outPrompt}`);
  console.log("[remaining-review] END (ok)");
}

main().catch((e) => {
  console.error("[remaining-review] FAILED:", e?.message || e);
  process.exit(1);
});
