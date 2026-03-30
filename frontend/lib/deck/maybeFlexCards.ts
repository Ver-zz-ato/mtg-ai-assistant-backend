/**
 * Optional "Maybe / Flex" card list for non-Commander decks.
 * Stored on `decks.meta.maybeFlexCards` — not in `deck_cards` (main deck only).
 */

export type MaybeFlexCard = { name: string; qty: number };

/** Key inside `decks.meta` JSON (additive, backward compatible). */
export const META_KEY_MAYBE_FLEX = "maybeFlexCards" as const;

/**
 * Commander / EDH-style and missing format: no Maybe/Flex UI (safest default).
 * Keeps UI and POST /api/decks/maybe-flex aligned (same normalization).
 */
const MAYBE_FLEX_DISABLED_FORMATS = new Set(["commander", "edh", "cedh"]);

export function isMaybeFlexBucketEnabledForFormat(format?: string | null): boolean {
  if (format == null || String(format).trim() === "") return false;
  const n = String(format).trim().toLowerCase();
  return !MAYBE_FLEX_DISABLED_FORMATS.has(n);
}

export function normalizeMaybeFlexCards(raw: unknown): MaybeFlexCard[] {
  if (!Array.isArray(raw)) return [];
  const out: MaybeFlexCard[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const name = String((row as { name?: unknown }).name ?? "").trim();
    const qty = Math.max(1, Math.min(99, Math.floor(Number((row as { qty?: unknown }).qty) || 1)));
    if (!name || name.length > 200) continue;
    out.push({ name, qty });
  }
  return out.slice(0, 80);
}

/** Total qty across maybe/flex rows (not unique line count). */
export function totalMaybeFlexQty(cards: MaybeFlexCard[]): number {
  return cards.reduce((s, c) => s + Math.max(0, Math.floor(Number(c.qty) || 0)), 0);
}

/**
 * Plain-text lines to append after the main decklist for copy/export (eligible formats only).
 * Returns "" if format disables maybe/flex or list is empty.
 */
export function buildMaybeFlexPlaintextAppend(format: string | null | undefined, rawMaybeFlex: unknown): string {
  if (!isMaybeFlexBucketEnabledForFormat(format)) return "";
  const cards = normalizeMaybeFlexCards(rawMaybeFlex);
  if (cards.length === 0) return "";
  const lines = cards.map((c) => `${c.qty} ${c.name}`).join("\n");
  return `\n\n// Maybe / Flex cards\n${lines}`;
}

export function mergeMaybeFlexByName(existing: MaybeFlexCard[], name: string, qtyDelta: number): MaybeFlexCard[] {
  const map = new Map<string, MaybeFlexCard>();
  for (const c of existing) {
    const k = c.name.toLowerCase();
    const prev = map.get(k);
    if (prev) map.set(k, { name: prev.name, qty: Math.min(99, prev.qty + c.qty) });
    else map.set(k, { name: c.name, qty: c.qty });
  }
  const k = name.toLowerCase();
  const cur = map.get(k);
  const nextQty = (cur?.qty ?? 0) + qtyDelta;
  if (nextQty <= 0) {
    map.delete(k);
  } else {
    map.set(k, { name: cur?.name || name, qty: Math.min(99, nextQty) });
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}
