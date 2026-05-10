import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseDeckText } from "@/lib/deck/parseDeckText";
import {
  buildStoredCardNameFixItems,
  resolveCardNamesForImport,
} from "@/lib/server/cardNameResolution";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const deckText = String(body?.deckText || "").trim();

    if (!deckText) {
      return NextResponse.json({ ok: false, error: "deckText required" }, { status: 400 });
    }

    const cards = parseDeckText(deckText);
    if (!cards.length) {
      return NextResponse.json({ ok: true, items: [], cards: [] });
    }

    const supabase = await createClient();
    const names = [...new Set(cards.map((card) => card.name))];
    const resolved = await resolveCardNamesForImport(supabase, names, 1000);
    const resolvedByName = new Map(resolved.map((row) => [row.originalName, row]));

    const correctedCards = cards.map((card) => {
      const match = resolvedByName.get(card.name);
      if (match?.matchStatus === "exact" && match.suggestedName) {
        return { name: match.suggestedName, qty: card.qty };
      }
      return { name: card.name, qty: card.qty };
    });

    const fixItems = await buildStoredCardNameFixItems(
      supabase,
      cards.map((card) => ({ name: card.name, qty: card.qty })),
    );

    const items = fixItems
      .filter((item) => resolvedByName.get(item.name)?.matchStatus !== "exact")
      .map((item) => ({
        originalName: item.name,
        qty: item.qty || 1,
        suggestions: item.suggestions,
      }));

    return NextResponse.json({ ok: true, items, cards: correctedCards });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
