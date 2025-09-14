// app/api/cards/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { memoGet, memoSet } from "@/lib/utils/memoCache";

const DAY = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ ok: true, cards: [] }, { status: 200 });

  const key = `scryfall:${q.toLowerCase()}`;
  const cached = memoGet<any>(key);
  if (cached) return NextResponse.json(cached, { status: 200 });

  // Scryfall API: fuzzy search; unique cards; order by edhrec/popularity
  const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&unique=cards&order=edhrec`;
  const res = await fetch(url, { next: { revalidate: 60 * 60 } }); // revalidate hourly at the edge
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: "Scryfall error" }, { status: 502 });
  }
  const json = await res.json();
  // normalize minimal payload
  const cards = (json.data || []).map((c: any) => ({
    name: c.name,
    set: c.set,
    set_name: c.set_name,
    mana_cost: c.mana_cost,
    type_line: c.type_line,
  }));

  const payload = { ok: true, cards };
  memoSet(key, payload, DAY);
  return NextResponse.json(payload, { status: 200 });
}
