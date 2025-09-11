// app/api/decks/recent/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Cookie-free client so this route can be cached safely
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(url, anon, { auth: { persistSession: false } });

export const revalidate = 30; // ISR for this route

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "12", 10) || 12, 24);

  const { data, error } = await supabase
    .from("decks")
    .select("id, user_id, title, commander, created_at, updated_at")
    .eq("is_public", true)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, decks: data ?? [] });
}
