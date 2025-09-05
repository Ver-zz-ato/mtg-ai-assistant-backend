import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export const runtime = "nodejs";


export async function GET(_req: Request, ctx: any) {
  const supabase = createClient();
  const id = ctx?.params?.id as string;

  const { data, error } = await supabase
    .from("decks")
    .select("id, title, commander, deck_text, is_public, user_id, updated_at")
    .eq("id", id)
    .single();

  if (error) {
    console.error("[DECKS/GET] error", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
  }

  // RLS enforces owner-or-public visibility.
  return NextResponse.json({ ok: true, deck: data });
}
