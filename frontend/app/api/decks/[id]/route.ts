// app/api/decks/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const deckId = params.id;

  // Try to read user (may be null if logged out)
  const { data: ures } = await supabase.auth.getUser();
  const user = ures?.user;

  // If logged in, first try the private "decks" table
  if (user) {
    const { data, error } = await supabase
      .from("decks")
      .select("id, title, deck_text, created_at, owner_id")
      .eq("id", deckId)
      .maybeSingle();

    if (!error && data) {
      return NextResponse.json({ ok: true, deck: data });
    }
    // falls through to public view if not found / not accessible
  }

  // Fallback: allow logged-out users (and logged-in) to fetch public deck snapshots
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
