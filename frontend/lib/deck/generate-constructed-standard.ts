/**
 * Standard-only helpers for POST /api/deck/generate-constructed (narrow AI fragility vs rotation/bans).
 */

import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";
import { isBasicLandName } from "@/lib/deck/formatRules";
import { aggregateCards, totalDeckQty, trimDeckToMaxQty } from "@/lib/deck/generation-helpers";
import { filterDecklistQtyRowsForFormat } from "@/lib/deck/recommendation-legality";
import type { QtyRow } from "@/lib/deck/generate-constructed-post";

export const STANDARD_MAIN_PAD_MIN = 45;
export const STANDARD_MAIN_PAD_MAX = 59;

export function normalizeRequestColorLetters(colors: unknown): string[] {
  if (!Array.isArray(colors)) return [];
  const out: string[] = [];
  const allowed = new Set(["W", "U", "B", "R", "G"]);
  for (const c of colors) {
    const letters = String(c || "")
      .trim()
      .toUpperCase()
      .replace(/[^WUBRG]/g, "");
    for (const ch of letters) {
      if (allowed.has(ch) && !out.includes(ch)) out.push(ch);
    }
  }
  return out;
}

/**
 * Restricted fallback: Standard + exactly Azorius (W and U only) + archetype mentions Control.
 * Does not match Esper/Bant shard labels.
 */
export function shouldStandardWuControlFallback(body: {
  format: string;
  colors?: string[];
  archetype?: string;
}): boolean {
  if (body.format !== "Standard") return false;
  const cols = normalizeRequestColorLetters(body.colors);
  const set = new Set(cols);
  if (set.size !== 2 || !set.has("W") || !set.has("U")) return false;
  return /\bcontrol\b/i.test(body.archetype || "");
}

/**
 * Pad Standard mainboard when total qty is in [45,59] — basics first (W/U distribution), then nonbasic copies up to 4.
 */
export function padStandardMainboardWide(rows: QtyRow[], colorLetters: string[]): { rows: QtyRow[]; adjusted: boolean } {
  const q = totalDeckQty(rows);
  if (q < STANDARD_MAIN_PAD_MIN || q > STANDARD_MAIN_PAD_MAX) {
    return { rows: rows.map((r) => ({ ...r })), adjusted: false };
  }

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
  const BASIC: Record<string, string> = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };
  let rr = 0;
  const safety = 200;
  while (still > 0 && cols.length > 0 && rr < safety) {
    const letter = cols[rr % cols.length];
    rr++;
    const basicName = BASIC[letter];
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
    let idx = working.findIndex((r) => normalizeScryfallCacheName(r.name) === normalizeScryfallCacheName("Plains"));
    if (idx === -1) {
      working.push({ name: "Plains", qty: 0 });
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

async function fetchStandardNames(query: string, max = 40): Promise<string[]> {
  try {
    const out: string[] = [];
    let url: string | null = `https://api.scryfall.com/cards/search?order=edhrec&unique=cards&q=${encodeURIComponent(query)}`;
    while (url && out.length < max) {
      const res = await fetch(url, {
        headers: { "user-agent": "ManaTapAI/standard-fallback" },
        cache: "no-store",
      });
      if (!res.ok) break;
      const json = await res.json().catch(() => null) as {
        data?: Array<{ name?: string; type_line?: string }>;
        has_more?: boolean;
        next_page?: string;
      } | null;
      for (const card of json?.data ?? []) {
        const name = String(card?.name || "").trim();
        if (!name || out.some((existing) => existing.toLowerCase() === name.toLowerCase())) continue;
        out.push(name);
        if (out.length >= max) break;
      }
      url = json?.has_more && json?.next_page ? json.next_page : null;
    }
    return out;
  } catch {
    return [];
  }
}

function addCopiesUntil(
  rows: QtyRow[],
  names: string[],
  targetQty: number,
  copiesPerCard: number,
  opts?: { skipBasics?: boolean }
): void {
  for (const name of names) {
    if (totalDeckQty(rows) >= targetQty) return;
    if (opts?.skipBasics && isBasicLandName(name)) continue;
    const existing = rows.find((r) => normalizeScryfallCacheName(r.name) === normalizeScryfallCacheName(name));
    const current = existing?.qty ?? 0;
    const maxCopies = isBasicLandName(name) ? 99 : 4;
    const add = Math.min(copiesPerCard, maxCopies - current, targetQty - totalDeckQty(rows));
    if (add <= 0) continue;
    if (existing) existing.qty += add;
    else rows.push({ name, qty: add });
  }
}

function addAzoriusBasics(rows: QtyRow[], targetQty: number): void {
  let i = 0;
  const basics = ["Plains", "Island"];
  while (totalDeckQty(rows) < targetQty && i < 120) {
    const name = basics[i % basics.length];
    const existing = rows.find((r) => normalizeScryfallCacheName(r.name) === normalizeScryfallCacheName(name));
    if (existing) existing.qty += 1;
    else rows.push({ name, qty: 1 });
    i++;
  }
}

/**
 * Conservative Azorius-only Standard fallback, validated via the same filter as AI decks.
 * It uses live Scryfall legality to avoid shipping a stale static Standard list.
 */
export async function buildStandardWuFallbackDeck(): Promise<{ mainRows: QtyRow[]; sideRows: QtyRow[] } | null> {
  const interactionNames = await fetchStandardNames(
    "f:standard id<=uw (o:counter or o:draw or o:exile or o:destroy or o:return) -t:land",
    36
  );
  const permanentNames = await fetchStandardNames(
    "f:standard id<=uw (t:creature or t:planeswalker or t:artifact or t:enchantment) -t:land",
    36
  );
  const landNames = await fetchStandardNames("f:standard id<=uw t:land", 24);

  const roughMain: QtyRow[] = [];
  addCopiesUntil(roughMain, interactionNames, 24, 3);
  addCopiesUntil(roughMain, permanentNames, 36, 2);
  addCopiesUntil(roughMain, landNames, 48, 2, { skipBasics: true });
  addAzoriusBasics(roughMain, 60);

  const roughSide: QtyRow[] = [];
  addCopiesUntil(
    roughSide,
    [...interactionNames.slice(8), ...permanentNames.slice(8)],
    15,
    2
  );
  if (totalDeckQty(roughSide) < 15) addCopiesUntil(roughSide, interactionNames, 15, 1);
  if (totalDeckQty(roughSide) < 15) addAzoriusBasics(roughSide, 15);

  const fm = await filterDecklistQtyRowsForFormat(aggregateCards(roughMain), "Standard", {
    logPrefix: "/api/deck/generate-constructed standard-fallback main",
  });
  const fs = await filterDecklistQtyRowsForFormat(aggregateCards(roughSide), "Standard", {
    logPrefix: "/api/deck/generate-constructed standard-fallback side",
  });

  let mainRows = trimDeckToMaxQty(fm.lines, 60);
  let sideRows = trimDeckToMaxQty(fs.lines, 15);

  let mq = totalDeckQty(mainRows);
  const nonlandQty = mainRows.reduce((sum, row) => sum + (isBasicLandName(row.name) ? 0 : row.qty), 0);
  if (nonlandQty < 20) return null;
  if (mq < STANDARD_MAIN_PAD_MIN) return null;

  if (mq <= STANDARD_MAIN_PAD_MAX) {
    const padded = padStandardMainboardWide(mainRows, ["W", "U"]);
    mainRows = padded.rows;
    mq = totalDeckQty(mainRows);
  }

  if (mq !== 60) return null;

  const sq = totalDeckQty(sideRows);
  if (sq > 15) sideRows = trimDeckToMaxQty(sideRows, 15);

  return { mainRows, sideRows };
}
