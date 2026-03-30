import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildUsageByKeyFromDeckCards, type DeckUsageByKey } from "@/lib/collection/deckCardUsage";

export const runtime = "nodejs";

const DECK_ID_CHUNK = 25;
const ROW_PAGE = 1000;

type DeckCardRow = { deck_id: string; name: string; qty: number | null };

async function fetchAllDeckCardsForDecks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  deckIds: string[],
): Promise<DeckCardRow[]> {
  const out: DeckCardRow[] = [];
  for (let i = 0; i < deckIds.length; i += DECK_ID_CHUNK) {
    const slice = deckIds.slice(i, i + DECK_ID_CHUNK);
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("deck_cards")
        .select("deck_id, name, qty")
        .in("deck_id", slice)
        .order("id", { ascending: true })
        .range(from, from + ROW_PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as DeckCardRow[];
      out.push(...rows);
      if (rows.length < ROW_PAGE) break;
      from += ROW_PAGE;
    }
  }
  return out;
}

/**
 * GET — authenticated user's decks + all deck_cards, aggregated for collection matching.
 * Unsigned: `{ ok: true, anonymous: true, deckCount: 0, usageByKey: {} }` (fail-open for UI).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (userErr || !user) {
      return NextResponse.json({
        ok: true,
        anonymous: true,
        deckCount: 0,
        usageByKey: {} as DeckUsageByKey,
      });
    }

    const { data: decks, error: deckErr } = await supabase
      .from("decks")
      .select("id, title")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (deckErr) {
      console.error("[collections/deck-usage] decks error", deckErr);
      return NextResponse.json({
        ok: true,
        deckCount: 0,
        usageByKey: {} as DeckUsageByKey,
        loadError: deckErr.message,
      });
    }

    const deckList = decks ?? [];
    if (deckList.length === 0) {
      return NextResponse.json({
        ok: true,
        deckCount: 0,
        usageByKey: {} as DeckUsageByKey,
      });
    }

    const deckIds = deckList.map((d) => d.id);
    let deckCards: DeckCardRow[] = [];
    try {
      deckCards = await fetchAllDeckCardsForDecks(supabase, deckIds);
    } catch (e: any) {
      console.error("[collections/deck-usage] deck_cards error", e);
      return NextResponse.json({
        ok: true,
        deckCount: deckList.length,
        usageByKey: {} as DeckUsageByKey,
        loadError: e?.message || "deck_cards failed",
      });
    }

    const { usageByKey, deckCount } = buildUsageByKeyFromDeckCards(deckList, deckCards);
    return NextResponse.json({
      ok: true,
      deckCount,
      usageByKey,
    });
  } catch (e: any) {
    console.error("[collections/deck-usage] fatal", e);
    return NextResponse.json(
      {
        ok: true,
        deckCount: 0,
        usageByKey: {} as DeckUsageByKey,
        loadError: e?.message || "unknown",
      },
      { status: 200 },
    );
  }
}
