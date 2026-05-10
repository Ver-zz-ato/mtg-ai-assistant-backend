import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildStoredCardNameFixItems } from "@/lib/server/cardNameResolution";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const deckId = sp.get("deckId");
    if (!deckId) return NextResponse.json({ ok: false, error: "deckId required" }, { status: 400 });

    const supabase = await createClient();
    const { data: rows, error } = await supabase
      .from("deck_cards")
      .select("id, name")
      .eq("deck_id", deckId)
      .limit(1000);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const cards = Array.isArray(rows) ? rows.map((row: any) => ({ id: row.id, name: row.name })) : [];
    if (!cards.length) return NextResponse.json({ ok: true, items: [] });

    const items = await buildStoredCardNameFixItems(supabase, cards);
    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
