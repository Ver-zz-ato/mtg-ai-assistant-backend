import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
    }

    const body = await req.json();
    const { preconId } = body;

    if (!preconId) {
      return NextResponse.json({ ok: false, error: "preconId is required" }, { status: 400 });
    }

    const { data: precon, error: preconError } = await supabase
      .from("precon_decks")
      .select("id, name, commander, colors, format, deck_text")
      .eq("id", preconId)
      .single();

    if (preconError || !precon) {
      return NextResponse.json(
        { ok: false, error: "Precon not found" },
        { status: 404 }
      );
    }

    const { data: newDeck, error: deckError } = await supabase
      .from("decks")
      .insert({
        user_id: user.id,
        title: precon.name,
        format: precon.format || "Commander",
        deck_text: precon.deck_text,
        commander: precon.commander,
        colors: precon.colors || [],
        is_public: false,
      })
      .select()
      .single();

    if (deckError) {
      return NextResponse.json({ ok: false, error: deckError.message }, { status: 500 });
    }

    const lines = (precon.deck_text || "").split(/\r?\n/).filter((l: string) => l.trim());
    const cardRows: Array<{ deck_id: string; name: string; qty: number }> = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed.toLowerCase().startsWith("commander") ||
        trimmed.toLowerCase().includes("commander:") ||
        trimmed.toLowerCase().startsWith("sideboard") ||
        trimmed.toLowerCase().startsWith("mainboard") ||
        trimmed.toLowerCase().startsWith("deck")
      ) {
        continue;
      }
      const match = trimmed.match(/^(\d+)\s*[xX]?\s+(.+)$/);
      if (match) {
        const quantity = parseInt(match[1], 10);
        const cardName = match[2].trim();
        if (cardName && quantity > 0) {
          cardRows.push({ deck_id: newDeck.id, name: cardName, qty: quantity });
        }
      }
    }

    if (cardRows.length > 0) {
      await supabase.from("deck_cards").insert(cardRows);
    }

    return NextResponse.json({
      ok: true,
      deck: { id: newDeck.id, title: newDeck.title, commander: newDeck.commander },
      message: `Successfully imported ${precon.name}!`,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
