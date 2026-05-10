import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetchAllRows";
import { buildStoredCardNameFixItems } from "@/lib/server/cardNameResolution";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const collectionId = sp.get("collectionId");
    if (!collectionId) return NextResponse.json({ ok: false, error: "collectionId required" }, { status: 400 });

    const supabase = await createClient();
    const cards = await fetchAllSupabaseRows<{ id: string; name: string }>(() =>
      supabase
        .from("collection_cards")
        .select("id, name")
        .eq("collection_id", collectionId)
        .order("id", { ascending: true }),
    );

    if (!cards.length) return NextResponse.json({ ok: true, items: [] });

    const items = await buildStoredCardNameFixItems(supabase, cards);
    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
