import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  const supabase = createClient();

  const { data, error } = await supabase
    .from("decks")
    .select("id, title, commander, deck_text, is_public, user_id, updated_at")
    .eq("id", id)
    .single();

  if (error) {
    console.error("[DECKS/GET] error", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
  }

  // RLS already enforces: owner OR is_public
  return NextResponse.json({ ok: true, deck: data });
}
