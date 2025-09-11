import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  }

  // Try to get the user; it's fine if nobody is logged in
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes?.user?.id;

  // If not logged in, read from the public view
  if (!uid) {
    const { data, error } = await supabase
      .from("recent_public_decks")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, deck: data });
  }

  // Logged in: allow owner OR public
  const { data, error } = await supabase
    .from("decks")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) {
    // Fallback to public view if deck exists but belongs to someone else
    const { data: pub, error: pubErr } = await supabase
      .from("recent_public_decks")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (pubErr) return NextResponse.json({ ok: false, error: pubErr.message }, { status: 500 });
    if (!pub) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, deck: pub });
  }

  return NextResponse.json({ ok: true, deck: data });
}
