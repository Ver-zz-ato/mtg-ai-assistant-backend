import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function handle(req: NextRequest) {
  const supabase = createClient();

  // Auth
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  // GET ?collectionId=... or POST { collectionId }
  const url = new URL(req.url);
  let collectionId: string | null = url.searchParams.get("collectionId");
  if (!collectionId) {
    try {
      const body = await req.json().catch(() => null);
      if (body?.collectionId) collectionId = String(body.collectionId);
    } catch {/* ignore */}
  }
  if (!collectionId) {
    return NextResponse.json({ ok: false, error: "collectionId required" }, { status: 400 });
  }

  // Ownership check (RLS should also enforce, but this gives a nice message)
  const { data: col, error: colErr } = await supabase
    .from("collections")
    .select("id, user_id")
    .eq("id", collectionId)
    .single();

  if (colErr || !col) {
    return NextResponse.json({ ok: false, error: "Collection not found" }, { status: 404 });
  }
  if (col.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  // Cards for this collection
  const { data, error } = await supabase
    .from("collection_cards")
    .select("name, qty")
    .eq("collection_id", collectionId)
    .order("name", { ascending: true });

  if (error) {
    console.error("[collections/cards] supabase error", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, cards: data ?? [] }, { status: 200 });
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
