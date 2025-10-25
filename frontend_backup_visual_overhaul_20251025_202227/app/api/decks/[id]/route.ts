// app/api/decks/[id]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = { id: string };

export async function GET(_req: Request, ctx: { params: Promise<Params> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  // May be null if logged out
  const { data: ures } = await supabase.auth.getUser();
  const user = ures?.user ?? null;

  // Single-query public/owner OR filter; no dependency on views
  const { data: deck, error: deckErr } = await supabase
    .from("decks")
    .select(
      "id, user_id, title, format, plan, colors, currency, deck_text, is_public, created_at, updated_at, commander, data, meta"
    )
    .or(`and(id.eq.${id},is_public.eq.true),and(id.eq.${id},user_id.eq.${user ? user.id : "00000000-0000-0000-0000-000000000000"})`) // bogus UUID won't match when logged out
    .single();

  if (deckErr || !deck) {
    // Return useful diagnostics without leaking private info
    return NextResponse.json(
      {
        ok: false,
        error: "Deck not found",
        details: {
          deck_id: id,
          user_id: user?.id ?? null,
          hint:
            "Either the deck ID is wrong, the deck is private and you are not the owner, or RLS policies are blocking SELECT on 'decks'.",
        },
      },
      { status: 404 }
    );
  }

  // Cards: permitted by deck_cards_read policy (public or owner)
  const { data: cards, error: cardsErr } = await supabase
    .from("deck_cards")
    .select("id, deck_id, name, qty, created_at")
    .eq("deck_id", deck.id)
    .order("created_at", { ascending: true });

  if (cardsErr) {
    return NextResponse.json(
      {
        ok: true,
        deck,
        cards: [],
        warning: "Cards blocked by RLS or other error",
        error: cardsErr.message,
      },
      { status: 200 }
    );
  }

  return NextResponse.json({ ok: true, deck, cards: cards ?? [] }, { status: 200 });
}
