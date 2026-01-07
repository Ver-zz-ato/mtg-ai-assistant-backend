// app/api/decks/[id]/commander/route.ts
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
    const { commander } = body;

    if (typeof commander !== 'string') {
      return NextResponse.json({ ok: false, error: "Commander must be a string" }, { status: 400 });
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

    // Update commander
    const { error: updateError } = await supabase
      .from('decks')
      .update({ 
        commander: commander.trim() || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) {
      console.error('Failed to update commander:', updateError);
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error updating commander:', error);
    return NextResponse.json({ ok: false, error: error.message || "Server error" }, { status: 500 });
  }
}
