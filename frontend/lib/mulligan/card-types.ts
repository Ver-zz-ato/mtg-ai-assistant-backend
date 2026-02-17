/**
 * Card type lookup for mulligan land detection.
 * Uses scryfall_cache (cache-only, no live Scryfall). Admin/test harness only.
 */

import { createClient } from "@/lib/supabase/server";

export type CardTypeInfo = { name: string; typeLine: string | null };

/** Same normalization as scryfallCache.ts — lowercase, NFKD, collapse spaces */
export function normalizeCardName(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Known any-color lands (when type_line missing or generic "Land" without basic types) */
const KNOWN_ANY_COLOR_LANDS = new Set([
  "command tower",
  "city of brass",
  "mana confluence",
  "exotic orchard",
  "forbidden orchard",
  "reflecting pool",
  "gemstone caverns",
]);

type MemoEntry = { typeLine: string | null; expiresAt: number };
const MEMO_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const memo = new Map<string, MemoEntry>();

/**
 * Batch fetch type_line from scryfall_cache. Cache-only, no live API.
 * Returns Map keyed by normalized name.
 */
export async function getTypeLinesForNames(
  names: string[]
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const now = Date.now();
  const toFetch: string[] = [];

  for (const name of names) {
    const key = normalizeCardName(name);
    if (!key) continue;
    const entry = memo.get(key);
    if (entry && entry.expiresAt > now) {
      out.set(key, entry.typeLine);
    } else {
      toFetch.push(key);
    }
  }

  if (toFetch.length > 0) {
    const supabase = await createClient();
    const uniq = Array.from(new Set(toFetch));

    try {
      const { data } = await supabase
        .from("scryfall_cache")
        .select("name, type_line")
        .in("name", uniq);

      const rows = (data || []) as { name: string; type_line?: string | null }[];
      for (const row of rows) {
        const key = normalizeCardName(row.name);
        const typeLine = row.type_line ?? null;
        out.set(key, typeLine);
        memo.set(key, { typeLine, expiresAt: now + MEMO_TTL_MS });
      }
      // Mark misses as null so we don't re-fetch
      for (const k of uniq) {
        if (!out.has(k)) {
          out.set(k, null);
          memo.set(k, { typeLine: null, expiresAt: now + MEMO_TTL_MS });
        }
      }
    } catch {
      for (const k of uniq) {
        if (!out.has(k)) out.set(k, null);
      }
    }
  }

  return out;
}

/** typeLine includes "Land" (case-insensitive) */
export function isLandType(typeLine: string | null): boolean {
  if (!typeLine) return false;
  return typeLine.toLowerCase().includes("land");
}

/**
 * Extract colors from type_line. Basic lands and "Basic Land — X" only.
 * For known any-color lands when typeLine is null, returns WUBRG.
 */
export function colorsFromTypeLine(
  typeLine: string | null,
  cardNameNormalized?: string
): Set<"W" | "U" | "B" | "R" | "G"> {
  const out = new Set<"W" | "U" | "B" | "R" | "G">();

  if (typeLine) {
    const t = typeLine.toLowerCase();
    if (t.includes("plains") || t.includes("basic land — w")) out.add("W");
    if (t.includes("island") || t.includes("basic land — u")) out.add("U");
    if (t.includes("swamp") || t.includes("basic land — b")) out.add("B");
    if (t.includes("mountain") || t.includes("basic land — r")) out.add("R");
    if (t.includes("forest") || t.includes("basic land — g")) out.add("G");
    // Dual-type basics: "Basic Land — Island Mountain" etc
    if (t.includes("basic land —")) {
      if (t.includes("plains")) out.add("W");
      if (t.includes("island")) out.add("U");
      if (t.includes("swamp")) out.add("B");
      if (t.includes("mountain")) out.add("R");
      if (t.includes("forest")) out.add("G");
    }
  }

  if (out.size > 0) return out;

  // Fallback: known any-color lands when typeLine is null or didn't match
  if (cardNameNormalized && KNOWN_ANY_COLOR_LANDS.has(cardNameNormalized)) {
    out.add("W");
    out.add("U");
    out.add("B");
    out.add("R");
    out.add("G");
  }

  return out;
}

/**
 * Check if a card is a land: either type_line says Land, or it's a known any-color land.
 */
export function isLandFromLookup(
  typeLine: string | null,
  cardNameNormalized: string
): boolean {
  if (isLandType(typeLine)) return true;
  return KNOWN_ANY_COLOR_LANDS.has(cardNameNormalized);
}
