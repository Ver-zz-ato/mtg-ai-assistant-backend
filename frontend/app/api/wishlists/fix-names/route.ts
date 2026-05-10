import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { buildStoredCardNameFixItems } from "@/lib/server/cardNameResolution";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const wishlistId = String(url.searchParams.get("wishlistId") || "");
    if (!wishlistId) return NextResponse.json({ ok: false, error: "wishlistId required" }, { status: 400 });

    const supabase = await getServerSupabase();
    const { data: rows, error } = await (supabase as any)
      .from("wishlist_items")
      .select("id, name")
      .eq("wishlist_id", wishlistId)
      .limit(1000);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const cards = Array.isArray(rows) ? rows.map((row: any) => ({ id: row.id, name: row.name })) : [];
    if (!cards.length) return NextResponse.json({ ok: true, items: [] });

    const items = await buildStoredCardNameFixItems(supabase as any, cards);
    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
