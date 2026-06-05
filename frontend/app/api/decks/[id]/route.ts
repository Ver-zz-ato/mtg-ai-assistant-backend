// app/api/decks/[id]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleSupabase } from "@/lib/server/serviceRoleSupabase";

type Params = { id: string };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getRequestUser(req: Request) {
  let supabase = await createClient();
  let { data: ures } = await supabase.auth.getUser();
  let user = ures?.user ?? null;

  if (!user) {
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (bearerToken) {
      const { createClientWithBearerToken } = await import("@/lib/server-supabase");
      const bearerSupabase = createClientWithBearerToken(bearerToken);
      const { data: { user: bearerUser } } = await bearerSupabase.auth.getUser();
      if (bearerUser) {
        user = bearerUser;
        supabase = bearerSupabase;
      }
    }
  }

  return { supabase, user };
}

export async function GET(req: Request, ctx: { params: Promise<Params> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Deck not found" }, { status: 404 });
  }
  const { supabase, user } = await getRequestUser(req);
  const readSupabase = getServiceRoleSupabase() ?? supabase;

  // Single-query public/owner OR filter; no dependency on views
  const { data: deck, error: deckErr } = await readSupabase
    .from("decks")
    .select(
      "id, user_id, title, format, plan, colors, currency, deck_text, deck_aim, is_public, created_at, updated_at, commander, data, meta"
    )
    .or(`and(id.eq.${id},is_public.eq.true),and(id.eq.${id},user_id.eq.${user ? user.id : "00000000-0000-0000-0000-000000000000"})`) // bogus UUID won't match when logged out
    .single();

  if (deckErr || !deck) {
    return NextResponse.json(
      {
        ok: false,
        error: "Deck not found",
      },
      { status: 404 }
    );
  }

  // Cards: permitted by deck_cards_read policy (public or owner)
  const { data: cards, error: cardsErr } = await readSupabase
    .from("deck_cards")
    .select("id, deck_id, name, qty, zone, created_at")
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
