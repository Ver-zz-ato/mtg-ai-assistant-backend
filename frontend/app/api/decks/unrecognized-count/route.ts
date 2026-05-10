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
      .select("name")
      .eq("deck_id", deckId)
      .limit(500);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const uniqueNames = [...new Set((Array.isArray(rows) ? rows : []).map((row: any) => String(row.name || "").trim()).filter(Boolean))];
    if (!uniqueNames.length) return NextResponse.json({ ok: true, count: 0 });

    const items = await buildStoredCardNameFixItems(
      supabase,
      uniqueNames.map((name) => ({ name })),
    );

    return NextResponse.json({ ok: true, count: items.length });
  } catch (e: any) {
    console.error("[unrecognized-count] Error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
