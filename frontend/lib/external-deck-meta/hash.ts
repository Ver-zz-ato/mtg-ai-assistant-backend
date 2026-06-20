import { createHash } from "node:crypto";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";
import type { ExternalDeckCard, NormalizedExternalDeck } from "./types";

export function stableDeckHash(deck: Pick<NormalizedExternalDeck, "commanders" | "cards" | "format">): string {
  const commanders = [...deck.commanders].map(normalizeScryfallCacheName).sort();
  const cards = deck.cards
    .map((c) => ({
      n: normalizeScryfallCacheName(c.name),
      q: Math.max(1, Number(c.quantity) || 1),
      b: c.board || "mainboard",
    }))
    .sort((a, b) => `${a.b}:${a.n}`.localeCompare(`${b.b}:${b.n}`));
  return createHash("sha256")
    .update(JSON.stringify({ format: String(deck.format || "").toLowerCase(), commanders, cards }))
    .digest("hex");
}

export function countCards(cards: ExternalDeckCard[], boards: string[] = ["mainboard", "commander"]): number {
  const allowed = new Set(boards);
  return cards.reduce((sum, c) => sum + (allowed.has(c.board) ? Math.max(1, Number(c.quantity) || 1) : 0), 0);
}
