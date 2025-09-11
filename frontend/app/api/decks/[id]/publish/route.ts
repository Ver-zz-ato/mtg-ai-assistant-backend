// app/api/decks/[id]/publish/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = { id: string };

export async function POST(_req: Request, ctx: { params: Promise<Params> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: ures } = await supabase.auth.getUser();
  const user = ures?.user;
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: deck, error: readErr } = await supabase
    .from("decks")
    .select("id, user_id, is_public")
    .eq("id", id)
    .single();

  if (readErr || !deck) {
    return NextResponse.json({ ok: false, error: "Deck not found" }, { status: 404 });
  }
  if (deck.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { error: upErr } = await supabase
    .from("decks")
    .update({ is_public: true, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, is_public: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<Params> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: ures } = await supabase.auth.getUser();
  const user = ures?.user;
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: deck, error: readErr } = await supabase
    .from("decks")
    .select("id, user_id, is_public")
    .eq("id", id)
    .single();

  if (readErr || !deck) {
    return NextResponse.json({ ok: false, error: "Deck not found" }, { status: 404 });
  }
  if (deck.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { error: upErr } = await supabase
    .from("decks")
    .update({ is_public: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, is_public: false });
}
