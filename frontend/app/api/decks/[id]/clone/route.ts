// app/api/decks/[id]/clone/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

type Params = { id: string };

export async function POST(req: NextRequest, context: { params: Promise<Params> }) {
  const { id } = await context.params;
  const supabase = await createClient();

  try {
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
    }

    // Fetch the source deck (must be public or owned by user)
    const { data: sourceDeck, error: deckError } = await supabase
      .from("decks")
      .select("title, commander, format, description, is_public, user_id")
      .eq("id", id)
      .single();

    if (deckError || !sourceDeck) {
      return NextResponse.json({ ok: false, error: "Deck not found" }, { status: 404 });
    }

    // Check if deck is public or owned by user
    if (!sourceDeck.is_public && sourceDeck.user_id !== user.id) {
      return NextResponse.json({ ok: false, error: "This deck is private" }, { status: 403 });
    }

    // Fetch all cards from source deck
    const { data: sourceCards, error: cardsError } = await supabase
      .from("deck_cards")
      .select("name, qty")
      .eq("deck_id", id);

    if (cardsError) {
      return NextResponse.json({ ok: false, error: "Failed to fetch deck cards" }, { status: 500 });
    }

    // Create new deck for the user
    const newDeckTitle = `${sourceDeck.title} (Copy)`;
    const { data: newDeck, error: createError } = await supabase
      .from("decks")
      .insert({
        user_id: user.id,
        title: newDeckTitle,
        commander: sourceDeck.commander,
        format: sourceDeck.format,
        description: sourceDeck.description ? `Cloned from public deck. ${sourceDeck.description}` : "Cloned from public deck.",
        is_public: false, // New deck is private by default
      })
      .select("id")
      .single();

    if (createError || !newDeck) {
      return NextResponse.json({ ok: false, error: "Failed to create deck" }, { status: 500 });
    }

    // Copy all cards to new deck
    if (sourceCards && sourceCards.length > 0) {
      const newCards = sourceCards.map(card => ({
        deck_id: newDeck.id,
        name: card.name,
        qty: card.qty,
      }));

      const { error: insertError } = await supabase
        .from("deck_cards")
        .insert(newCards);

      if (insertError) {
        // Rollback: delete the created deck if card insertion fails
        await supabase.from("decks").delete().eq("id", newDeck.id);
        return NextResponse.json({ ok: false, error: "Failed to copy deck cards" }, { status: 500 });
      }
    }

    const totalCardCount = (sourceCards || []).reduce((sum, c) => sum + (Number(c.qty) || 0), 0);
    return NextResponse.json({ 
      ok: true, 
      deckId: newDeck.id,
      title: newDeckTitle,
      cardCount: totalCardCount
    });
  } catch (error: any) {
    console.error("Clone deck error:", error);
    return NextResponse.json({ ok: false, error: error.message || "Internal server error" }, { status: 500 });
  }
}


