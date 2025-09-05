// app/api/decks/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/decks/:id
export async function GET(_req: NextRequest, ctx: any) {
  const deckId = ctx?.params?.id as string | undefined;
  if (!deckId) {
    return NextResponse.json({ error: "Missing deck id" }, { status: 400 });
    }

  const supabase = createClient();

  // Best-effort auth (user may be null for public decks)
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;

  // If signed in: allow own OR public. If anonymous: only public.
  let query = supabase.from("decks").select("*").eq("id", deckId).limit(1);
  if (user) {
    // Supabase OR filter syntax
    query = query.or(`is_public.eq.true,user_id.eq.${user.id}`);
  } else {
    query = query.eq("is_public", true);
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, deck: data }, { status: 200 });
}
