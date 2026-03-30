/**
 * Shared deck↔collection card usage matching for the collection UI.
 *
 * Phase 2: swap the fetch in `/api/collections/deck-usage` for an RPC, materialized
 * view, precomputed usage table, or edge cache without changing consumers — they
 * should keep using `usageByKey` + `getDeckUsageForCard`.
 *
 * Split: raw rows → `buildUsageByKeyFromDeckCards` (aggregates); lookup stays client-side.
 */

import { normalizeCardName } from "@/lib/deck/mtgValidators";

export type DeckUsageItem = {
  deckId: string;
  deckTitle: string;
  qty: number;
};

/** JSON-serializable map from normalized usage key → usages (unique per deckId). */
export type DeckUsageByKey = Record<string, DeckUsageItem[]>;

/** Fold common unicode quotes/apostrophes so cache/decklist/collection strings match after normalizeCardName. */
function foldUnicodeQuotesForUsage(name: string): string {
  return String(name || "")
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"');
}

/**
 * Primary normalization for matching collection `name` and `deck_cards.name`.
 * Reuses website deck validation normalizer (NFKD, strip punctuation including spaces).
 */
export function getCardUsageKey(name: string): string {
  return normalizeCardName(foldUnicodeQuotesForUsage(name));
}

/**
 * All keys that might appear in `usageByKey` for this card name (MDFC / split face).
 * Use for lookups only; aggregation writes all returned keys.
 */
export function getCardUsageLookupKeys(name: string): string[] {
  const raw = String(name || "").trim();
  const keys = new Set<string>();
  const primary = getCardUsageKey(raw);
  if (primary) keys.add(primary);
  if (raw.includes("//")) {
    const front = raw.split("//")[0]?.trim() ?? "";
    const k2 = getCardUsageKey(front);
    if (k2 && k2 !== primary) keys.add(k2);
  }
  return Array.from(keys);
}

function dedupeDecks(items: DeckUsageItem[]): DeckUsageItem[] {
  const byDeck = new Map<string, DeckUsageItem>();
  for (const it of items) {
    const cur = byDeck.get(it.deckId);
    if (!cur) byDeck.set(it.deckId, { ...it });
    else byDeck.set(it.deckId, { ...cur, qty: cur.qty + it.qty });
  }
  return Array.from(byDeck.values()).sort((a, b) => a.deckTitle.localeCompare(b.deckTitle));
}

/** Merge usages for all lookup keys (e.g. full MDFC name + front face). */
export function getDeckUsageForCard(name: string, usageByKey: DeckUsageByKey | null | undefined): DeckUsageItem[] {
  if (!usageByKey || typeof usageByKey !== "object") return [];
  const merged: DeckUsageItem[] = [];
  for (const key of getCardUsageLookupKeys(name)) {
    const row = usageByKey[key];
    if (Array.isArray(row)) merged.push(...row);
  }
  return dedupeDecks(merged);
}

export function cardAppearsInDecks(name: string, usageByKey: DeckUsageByKey | null | undefined): boolean {
  return getDeckUsageForCard(name, usageByKey).length > 0;
}

type DeckRow = { id: string; title?: string | null };
type DeckCardRow = { deck_id: string; name: string; qty?: number | null };

/**
 * Server-side: aggregate deck_cards into `usageByKey` (bulk, no N+1).
 */
export function buildUsageByKeyFromDeckCards(
  decks: DeckRow[],
  deckCards: DeckCardRow[],
): { usageByKey: DeckUsageByKey; deckCount: number } {
  const titleById = new Map<string, string>();
  for (const d of decks) {
    titleById.set(d.id, String(d.title || "Untitled deck"));
  }

  /** normKey → deckId → qty */
  const acc = new Map<string, Map<string, number>>();

  for (const row of deckCards) {
    const deckId = row.deck_id;
    const title = titleById.get(deckId);
    if (!title) continue;
    const qty = Math.max(0, Number(row.qty) || 0);
    const nm = String(row.name || "");
    for (const key of getCardUsageLookupKeys(nm)) {
      if (!key) continue;
      let inner = acc.get(key);
      if (!inner) {
        inner = new Map();
        acc.set(key, inner);
      }
      inner.set(deckId, (inner.get(deckId) || 0) + qty);
    }
  }

  const usageByKey: DeckUsageByKey = {};
  for (const [key, inner] of acc) {
    usageByKey[key] = Array.from(inner.entries())
      .map(([deckId, q]) => ({ deckId, deckTitle: titleById.get(deckId) || "Deck", qty: q }))
      .sort((a, b) => a.deckTitle.localeCompare(b.deckTitle));
  }

  return { usageByKey, deckCount: decks.length };
}
