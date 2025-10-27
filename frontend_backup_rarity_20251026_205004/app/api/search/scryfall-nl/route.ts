import { NextRequest, NextResponse } from "next/server";
import { mapToScryfall } from "@/lib/search/nl";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = String(sp.get("q") || "").slice(0, 200);
  const sfQuery = mapToScryfall(q);
  try {
    const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(sfQuery)}&order=edhrec&unique=cards`;
    const r = await fetch(url, { cache: "no-store" });
    const j: any = await r.json().catch(() => ({}));
    const cards = Array.isArray(j?.data) ? j.data.slice(0, 5).map((c: any) => ({
      name: c.name,
      type_line: c.type_line,
      mana_cost: c.mana_cost || c.card_faces?.[0]?.mana_cost || null,
      color_identity: c.color_identity || [],
      image: c.image_uris?.small || c.card_faces?.[0]?.image_uris?.small || null,
      prices: c.prices || {},
      scryfall_uri: c.scryfall_uri,
    })) : [];
    return NextResponse.json({ ok: true, query: q, scryfall_query: sfQuery, results: cards });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "scryfall search failed", scryfall_query: sfQuery }, { status: 500 });
  }
}
