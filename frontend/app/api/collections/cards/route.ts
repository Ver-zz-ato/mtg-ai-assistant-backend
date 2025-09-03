import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Shared handler for both GET and POST.
 * Reads a collectionId and returns the cards + quantities for that collection.
 */
async function handle(req: NextRequest) {
  const supabase = createClient();

  // Get user session
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (userErr || !user) {
    console.error("[COLLECTIONS/CARDS] Not authenticated", userErr);
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  // Support GET ?collectionId=... or POST { collectionId }
  let collectionId: string | null = null;
  const url = new URL(req.url);
  if (url.searchParams.get("collectionId")) {
    collectionId = url.searchParams.get("collectionId");
  } else {
    try {
      const body = await req.json();
      if (body?.collectionId) collectionId = body.collectionId;
    } catch {
      /* ignore */
    }
  }

  if (!collectionId) {
    return NextResponse.json({ ok: false, error: "collectionId required" }, { status: 400 });
  }

  // Query cards for this collection. Adjust table/column names to match your schema!
  const { data, error } = await supabase
    .from("collection_cards") // replace with your actual table name
    .select("id, name, qty")
    .eq("collection_id", collectionId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[COLLECTIONS/CARDS] Supabase error", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
  }

  return NextResponse.json({ ok: true, cards: data ?? [] });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
