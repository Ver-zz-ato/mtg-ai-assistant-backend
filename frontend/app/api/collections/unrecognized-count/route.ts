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
    const rows = await fetchAllSupabaseRows<{ name: string }>(() =>
      supabase
        .from("collection_cards")
        .select("name")
        .eq("collection_id", collectionId)
        .order("id", { ascending: true }),
    );

    const uniqueNames = [...new Set(rows.map((row) => String(row.name || "").trim()).filter(Boolean))];
    if (!uniqueNames.length) return NextResponse.json({ ok: true, count: 0 });

    const items = await buildStoredCardNameFixItems(
      supabase,
      uniqueNames.map((name) => ({ name })),
    );

    return NextResponse.json({ ok: true, count: items.length });
  } catch (e: any) {
    console.error("[collections/unrecognized-count] Error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
