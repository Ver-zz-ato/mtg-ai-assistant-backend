#!/usr/bin/env node
/**
 * PREVIEW ONLY — classify `import_set_number_junk` audit rows.
 * Reads tmp/scryfall-cache-name-audit.json, fetches Scryfall default_cards (no DB).
 *
 * Run: npm run preview:scryfall-cache-import-set-number-junk
 *
 * LOCKSTEP: normalizeScryfallCacheName matches frontend/lib/server/scryfallCacheRow.ts
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

/**
 * Trailing import noise: ` (set) 123`, ` (set) 123a`, ` (set) 123★`
 * Set code: 2–6 alphanumerics (Scryfall set codes).
 */
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

/** Single ` / ` between words → ` // ` when no `//` yet (MDFC / pathway). */
function normalizeSingleSlashToMdfc(s) {
  const t = s.trim();
  if (t.includes("//")) return t;
  return t.replace(/\s+\/\s+/, " // ");
}

function importJunkPipeline(original) {
  let t = normalizeCurlyQuotesAndSpaces(original).trim();
  t = stripTrailingImportSetParen(t);
  t = normalizeSingleSlashToMdfc(t);
  t = stripTrailingImportSetParen(t);
  return t.trim();
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

async function fetchBulk() {
  const r = await fetch("https://api.scryfall.com/bulk-data", { cache: "no-store" });
  if (!r.ok) throw new Error(`bulk-data HTTP ${r.status}`);
  const meta = await r.json();
  const entry = (meta?.data || []).find((d) => d?.type === "default_cards");
  if (!entry?.download_uri) throw new Error("No default_cards in bulk-data");
  console.log(
    `[import-junk] Fetching default_cards (${entry.updated_at || "?"}, ${entry.size ? Math.round(entry.size / 1024 / 1024) + "MB" : "?"})...`
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

function isImportJunkDeleteCandidate(original, afterPipeline) {
  if (isPunctuationOnlyGarbage(afterPipeline)) return true;
  if (isObviousPromptOrSentenceJunk(original.trim())) return true;
  if (/^\s*\/\//.test(original.trim())) return true;
  if (afterPipeline.length === 0) return true;
  return false;
}

function displayTarget(normKey, normToDisplay) {
  return normToDisplay.get(normKey) || normKey;
}

function classifyRow(original, canonicalSet, faceToFull, normToDisplay) {
  const cleaned = importJunkPipeline(original);
  const k = normalizeScryfallCacheName(cleaned);

  if (k && canonicalSet.has(k)) {
    return {
      proposed_action: "repair_to_canonical",
      proposed_target_name: displayTarget(k, normToDisplay),
      confidence: "high",
      reason:
        "Trailing (set) collector stripped; optional / → // for MDFC; normalized name matches Scryfall oracle",
      matched_by_rule: "import_junk:canonical_exact",
    };
  }

  if (k && faceToFull.has(k)) {
    const t = faceToFull.get(k);
    return {
      proposed_action: "repair_to_canonical",
      proposed_target_name: displayTarget(t, normToDisplay),
      confidence: "medium",
      reason: "After import-junk pipeline, string matches unique face name → full card.name",
      matched_by_rule: "import_junk:face_to_full",
    };
  }

  if (isImportJunkDeleteCandidate(original, cleaned)) {
    let delReason = "Not a safe card name after import-junk pipeline; verify before delete";
    if (cleaned.length === 0) delReason = "Empty after stripping (set) number suffix and slash normalize";
    else if (isPunctuationOnlyGarbage(cleaned)) delReason = "Punctuation-only after pipeline";
    else if (isObviousPromptOrSentenceJunk(original.trim())) delReason = "Obvious prompt/sentence (not a card name)";
    return {
      proposed_action: "delete_candidate",
      proposed_target_name: null,
      confidence: "medium",
      reason: delReason,
      matched_by_rule: "delete:import_junk_heuristic",
    };
  }

  return {
    proposed_action: "manual_review",
    proposed_target_name: null,
    confidence: "low",
    reason: "No exact canonical match after safe import-junk pipeline; not a conservative delete",
    matched_by_rule: "manual:none",
  };
}

function parseArgs(argv) {
  let auditJson = join(frontendRoot, "tmp", "scryfall-cache-name-audit.json");
  let outJson = join(frontendRoot, "tmp", "scryfall-cache-preview-import-set-number-junk.json");
  let outCsv = join(frontendRoot, "tmp", "scryfall-cache-preview-import-set-number-junk.csv");
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
    console.error(`[import-junk] Audit not found: ${auditJson}`);
    process.exit(1);
  }

  const audit = JSON.parse(readFileSync(auditJson, "utf8"));
  const unmatched = audit.unmatched;
  if (!Array.isArray(unmatched)) {
    console.error("[import-junk] Expected unmatched[]");
    process.exit(1);
  }

  const bucket = unmatched.filter((u) => u?.category === "import_set_number_junk");
  console.log(`[import-junk] import_set_number_junk rows: ${bucket.length}`);

  const { set: canonicalSet, normToDisplay, faceToFull, bulkMeta } = await fetchBulk();
  console.log(`[import-junk] Canonical names: ${canonicalSet.size}; face→full: ${faceToFull.size}`);

  const rows = [];
  let repair = 0;
  let del = 0;
  let manual = 0;

  for (const u of bucket) {
    const original_name = String(u.name ?? "");
    const c = classifyRow(original_name, canonicalSet, faceToFull, normToDisplay);
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
      import_set_number_junk_input: bucket.length,
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
  console.log("=== import_set_number_junk preview (no DB) ===");
  console.log(`repair_to_canonical: ${repair}`);
  console.log(`delete_candidate:    ${del}`);
  console.log(`manual_review:       ${manual}`);
  console.log("");
  console.log(`Wrote JSON: ${outJson}`);
  console.log(`Wrote CSV:  ${outCsv}`);
  console.log("[import-junk] END (ok)");
}

main().catch((e) => {
  console.error("[import-junk] FAILED:", e?.message || e);
  process.exit(1);
});
