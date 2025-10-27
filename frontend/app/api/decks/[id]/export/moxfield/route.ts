// app/api/decks/[id]/export/moxfield/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

type Params = { id: string };

export async function GET(req: NextRequest, context: { params: Promise<Params> }) {
  const { id } = await context.params;
  const supabase = await createClient();

  try {
    // Fetch deck data
    const { data: deck } = await supabase
      .from("decks")
      .select("title, commander")
      .eq("id", id)
      .single();

    const { data: cards } = await supabase
      .from("deck_cards")
      .select("name, qty")
      .eq("deck_id", id)
      .order("name");

    if (!deck || !cards) {
      return NextResponse.json({ ok: false, error: "Deck not found" }, { status: 404 });
    }

    // Format for Moxfield (simple text format with commander section)
    let text = "";
    
    // Commander section
    if (deck.commander) {
      text += "Commander\n";
      text += `1 ${deck.commander}\n\n`;
    }
    
    // Main deck
    text += "Deck\n";
    for (const card of cards) {
      text += `${card.qty} ${card.name}\n`;
    }

    return NextResponse.json({ 
      ok: true, 
      text,
      title: deck.title || "Deck",
      instructions: "Decklist copied! Now paste it at moxfield.com/tools/import"
    });
  } catch (error: any) {
    console.error("Moxfield export error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}


