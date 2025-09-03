import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest) {
  const supabase = createClient();

  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (userErr || !user) {
    console.error("[DECKS/MY] 401 no user", userErr);
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("decks")
    .select("id, title, commander, is_public, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[DECKS/MY] select error", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
  }
  return NextResponse.json({ ok: true, decks: data ?? [] });
}
