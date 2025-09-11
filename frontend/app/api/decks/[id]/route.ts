import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }   // <- Promise here
) {
  const { id: deckId } = await ctx.params;     // <- and await here

  const supabase = await createClient();

  // Try to read user (may be null if logged out)
  const { data: ures } = await supabase.auth.getUser();
  const user = ures?.user;

  // If logged in, try private "decks" first
  if (user) {
    const { data, error } = await supabase
      .from("decks")
      .select("id, title, deck_text, created_at, owner_id")
      .eq("id", deckId)
      .maybeSingle();

    if (!error && data) {
      return NextResponse.json({ ok: true, deck: data });
    }
    // fall through to public snapshot if not found/authorized
  }

  // Fallback to public snapshot
  const { data: pub, error: pubErr } = await supabase
    .from("recent_public_decks")
    .select("id, title, deck_text, created_at, owner_id")
    .eq("id", deckId)
    .maybeSingle();

  if (pubErr) {
    return NextResponse.json({ ok: false, error: pubErr.message }, { status: 500 });
  }
  if (!pub) {
    return NextResponse.json({ ok: false, error: "Deck not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, deck: pub });
}
