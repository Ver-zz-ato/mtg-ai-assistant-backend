// app/api/decks/[id]/overview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { deck_aim } = body;

    if (deck_aim !== null && typeof deck_aim !== 'string') {
      return NextResponse.json({ ok: false, error: "deck_aim must be a string or null" }, { status: 400 });
    }

    // Verify deck ownership
    const { data: deck, error: deckError } = await supabase
      .from('decks')
      .select('user_id')
      .eq('id', id)
      .single();

    if (deckError || !deck) {
      return NextResponse.json({ ok: false, error: "Deck not found" }, { status: 404 });
    }

    if (deck.user_id !== user.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
    }

    // Update deck_aim (trim and limit length)
    const trimmedAim = deck_aim ? deck_aim.trim().slice(0, 500) : null;

    const { error: updateError } = await supabase
      .from('decks')
      .update({ 
        deck_aim: trimmedAim,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) {
      console.error('Failed to update deck_aim:', updateError);
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error updating deck overview:', error);
    return NextResponse.json({ ok: false, error: error.message || "Server error" }, { status: 500 });
  }
}
