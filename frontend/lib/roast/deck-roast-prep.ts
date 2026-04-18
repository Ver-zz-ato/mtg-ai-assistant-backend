/**
 * Shared decklist preparation for roast flows.
 * Duplicates the name-fix behavior from POST /api/deck/roast without modifying that route.
 * Optional follow-up: import this from /api/deck/roast/route.ts for a no-behavior-change refactor.
 */

import type { NextRequest } from "next/server";
import { parseDeckText } from "@/lib/deck/parseDeckText";

export type PreparedRoastDeck = {
  cards: Array<{ name: string; qty: number }>;
  totalCards: number;
};

export async function prepareDeckCardsForRoast(
  req: NextRequest,
  deckText: string
): Promise<PreparedRoastDeck> {
  const parsed = parseDeckText(deckText);
  if (parsed.length === 0) {
    return { cards: [], totalCards: 0 };
  }

  let cards = parsed;
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      (typeof req.url === "string" ? new URL(req.url).origin : "http://localhost:3000");
    const fixRes = await fetch(`${baseUrl}/api/deck/parse-and-fix-names`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deckText }),
    });
    const fixData: unknown = await fixRes.json().catch(() => ({}));
    const fd = fixData as { ok?: boolean; cards?: Array<{ name: string; qty: number }> };
    if (fd?.ok && Array.isArray(fd.cards) && fd.cards.length > 0) {
      cards = fd.cards.map((c) => ({ name: String(c.name), qty: Number(c.qty) || 0 }));
    }
  } catch (e) {
    console.warn("[deck-roast-prep] Name fixing failed, using original:", (e as Error)?.message);
  }

  const totalCards = cards.reduce((sum, c) => sum + (Number(c.qty) || 0), 0);
  return { cards, totalCards };
}
