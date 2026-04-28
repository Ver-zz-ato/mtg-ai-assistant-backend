/**
 * Post-processing for POST /api/deck/generate-constructed only (constructed AI decklists).
 * Pure helpers — safe to unit test.
 */

import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";
import { isBasicLandName } from "@/lib/deck/formatRules";
import { aggregateCards, totalDeckQty, trimDeckToMaxQty } from "@/lib/deck/generation-helpers";

export type QtyRow = { name: string; qty: number };

const BASIC_BY_COLOR: Record<string, string> = {
  W: "Plains",
  U: "Island",
  B: "Swamp",
  R: "Mountain",
  G: "Forest",
};

export type PadMainboardNearSixtyOpts = {
  /** Lower bound inclusive for padding band (default 55). Use 52 when a validated seed shell exists. */
  minBand?: number;
};

/** Pad mainboard when total qty is within [minBand,59] inclusive (default minBand 55). Does nothing if outside band or already 60. */
export function padMainboardNearSixty(
  rows: QtyRow[],
  colorLetters: string[],
  opts?: PadMainboardNearSixtyOpts
): { rows: QtyRow[]; adjusted: boolean } {
  const low = opts?.minBand ?? 55;
  const q = totalDeckQty(rows);
  if (q < low || q > 59) return { rows: rows.map((r) => ({ ...r })), adjusted: false };

  const working = rows.map((r) => ({
    name: String(r.name || "").trim(),
    qty: Math.min(99, Math.max(0, Math.floor(Number(r.qty) || 0))),
  }));
  let need = 60 - totalDeckQty(working);

  for (let i = 0; i < working.length && need > 0; i++) {
    const r = working[i];
    if (!r.name || isBasicLandName(r.name)) continue;
    const room = Math.min(Math.max(0, 4 - r.qty), need);
    if (room <= 0) continue;
    r.qty += room;
    need -= room;
  }

  let still = 60 - totalDeckQty(working);
  const cols = [...new Set(colorLetters.map((c) => c.toUpperCase()).filter((c) => "WUBRG".includes(c)))];
  let rr = 0;
  const safety = 120;
  while (still > 0 && cols.length > 0 && rr < safety) {
    const letter = cols[rr % cols.length];
    rr++;
    const basicName = BASIC_BY_COLOR[letter];
    if (!basicName) continue;
    let idx = working.findIndex((r) => normalizeScryfallCacheName(r.name) === normalizeScryfallCacheName(basicName));
    if (idx === -1) {
      working.push({ name: basicName, qty: 0 });
      idx = working.length - 1;
    }
    const add = Math.min(still, 99 - working[idx].qty);
    working[idx].qty += add;
    still -= add;
  }

  while (still > 0 && cols.length === 0 && rr < safety) {
    let idx = working.findIndex((r) => normalizeScryfallCacheName(r.name) === normalizeScryfallCacheName("Mountain"));
    if (idx === -1) {
      working.push({ name: "Mountain", qty: 0 });
      idx = working.length - 1;
    }
    const add = Math.min(still, 99 - working[idx].qty);
    working[idx].qty += add;
    still -= add;
    rr++;
  }

  const agg = aggregateCards(working.filter((r) => r.name && r.qty > 0));
  const trimmed = trimDeckToMaxQty(agg, 60);
  return { rows: trimmed, adjusted: totalDeckQty(trimmed) !== q };
}

/** Prefer duplicate existing sideboard cards (max 4 each) when side total is 10–14. */
export function padSideboardTowardFifteen(rows: QtyRow[]): { rows: QtyRow[]; adjusted: boolean } {
  const q = totalDeckQty(rows);
  if (q >= 15 || q === 0 || q < 10) return { rows: rows.map((r) => ({ ...r })), adjusted: false };

  const working = rows.map((r) => ({
    name: String(r.name || "").trim(),
    qty: Math.min(99, Math.max(0, Math.floor(Number(r.qty) || 0))),
  }));
  const before = totalDeckQty(working);
  let need = 15 - before;

  for (const r of working) {
    if (need <= 0) break;
    const room = Math.min(Math.max(0, 4 - r.qty), need);
    if (room <= 0) continue;
    r.qty += room;
    need -= room;
  }

  const agg = aggregateCards(working.filter((r) => r.name && r.qty > 0));
  const trimmed = trimDeckToMaxQty(agg, 15);
  const after = totalDeckQty(trimmed);
  return { rows: trimmed, adjusted: after > before };
}

const GENERIC_EXPLANATION_FALLBACK =
  "Solid role alignment with the final card choices for this archetype and format.";

/** Title-case phrases that look like card names but are deck jargon — do not treat as unknown cards. */
const COMMON_BULLET_PHRASES = new Set([
  "the deck",
  "this deck",
  "your deck",
  "the format",
  "this format",
  "the meta",
  "the sideboard",
  "the mainboard",
  "game plan",
  "mana base",
]);

function textReferencesUnknownMultiWordCard(text: string, deckRows: QtyRow[]): boolean {
  const deckNorms = deckRows.map((r) => normalizeScryfallCacheName(r.name.trim())).filter(Boolean);
  /** Adjacent Title-Case tokens (typical English card names); avoids absorbing trailing lowercase prose. */
  const matches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4}\b/g) || [];
  for (const m of matches) {
    const n = normalizeScryfallCacheName(m);
    if (n.length < 6) continue;
    if (COMMON_BULLET_PHRASES.has(n)) continue;
    let ok = false;
    for (const d of deckNorms) {
      if (d === n || d.includes(n) || n.includes(d)) {
        ok = true;
        break;
      }
    }
    if (!ok) return true;
  }
  return false;
}

/** Remove explanation bullets that cite multi-word card titles not present on the final decklist. */
export function filterExplanationBulletsForDeck(bullets: string[], deckRows: QtyRow[]): string[] {
  const out: string[] = [];
  for (const raw of bullets) {
    const bullet = String(raw || "").trim();
    if (!bullet) continue;
    if (textReferencesUnknownMultiWordCard(bullet, deckRows)) out.push(GENERIC_EXPLANATION_FALLBACK);
    else out.push(bullet);
  }
  return [...new Set(out)].filter(Boolean).slice(0, 8);
}

/** Same hygiene as explanations — drop lines that mention unknown multi-word card titles. */
export function filterWarningsForDeck(warnings: string[], deckRows: QtyRow[]): string[] {
  const out: string[] = [];
  for (const raw of warnings) {
    const w = String(raw || "").trim();
    if (!w) continue;
    if (textReferencesUnknownMultiWordCard(w, deckRows)) continue;
    out.push(w);
  }
  return [...new Set(out)].slice(0, 12);
}

export function logConstructedDiag(payload: Record<string, unknown>): void {
  console.warn("[generate-constructed]", JSON.stringify(payload));
}

export function unwrapJsonFenceForConstructed(text: string): string {
  let t = text.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)```$/im.exec(t);
  if (fence) t = fence[1].trim();
  return t;
}

/** Safe parse result for diagnostics — never log raw content here; callers log `parseError` only. */
export function parseConstructedAiJsonDetailed(
  raw: string
): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(unwrapJsonFenceForConstructed(raw)) as unknown;
    if (!parsed || typeof parsed !== "object") return { ok: false, error: "root_not_object" };
    return { ok: true, data: parsed as Record<string, unknown> };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "json_parse_error";
    return { ok: false, error: msg.length > 200 ? msg.slice(0, 200) : msg };
  }
}
