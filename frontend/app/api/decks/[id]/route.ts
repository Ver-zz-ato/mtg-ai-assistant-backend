// app/api/decks/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = { params: { id: string } };

// GET /api/decks/:id
// Returns the deck if it's public, or if it belongs to the signed-in user.
export async function GET(_req: NextRequest, { params }: Params) {
  const deckId = params.id;
  if (!deckId) {
    return NextResponse.json({ error: "Missing deck id" }, { status: 400 });
  }

  const supabase = createClient();

  // best-effort auth (user may be null for public decks)
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;

  // Build query: if user exists, allow own deck OR public; otherwise only public
  let query = supabase.from("decks").select("*").eq("id", deckId).limit(1);

  if (user) {
    // Supabase OR syntax
    query = query.or(`is_public.eq.true,user_id.eq.${user.id}`);
  } else {
    query = query.eq("is_public", true);
  }

  const { data, error } = await query.single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json({ ok: true, deck: data }, { status: 200 });
}
