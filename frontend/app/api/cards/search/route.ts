// app/api/cards/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { memoGet, memoSet } from "@/lib/utils/memoCache";
import { withLogging } from "@/lib/api/withLogging";
import { SearchQuery } from "@/lib/validation";

export const runtime = 'edge';
export const revalidate = 3600; // 1 hour

const DAY = 24 * 60 * 60 * 1000;

export const GET = withLogging(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ ok: true, cards: [] }, { status: 200 });

  const key = `scryfall:${q.toLowerCase()}`;
  const cached = memoGet<any>(key);
  if (cached) return NextResponse.json(cached, { status: 200 });

  // Scryfall: try search first, fallback to autocomplete (better for short queries like "sol" -> Sol Ring)
  const searchUrl = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&unique=cards&order=edhrec`;
  const res = await fetch(searchUrl, { next: { revalidate: 60 * 60 } });
  let cards: { name: string; set?: string; set_name?: string; mana_cost?: string; type_line?: string }[] = [];

  if (res.ok) {
    const json = await res.json();
    cards = (json.data || []).map((c: any) => ({
      name: c.name,
      set: c.set,
      set_name: c.set_name,
      mana_cost: c.mana_cost,
      type_line: c.type_line,
    }));
  }

  // Fallback: autocomplete for prefix/short queries (e.g. "sol" -> Sol Ring)
  if (cards.length === 0) {
    const autoRes = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q)}`);
    if (autoRes.ok) {
      const autoJson = await autoRes.json();
      const names = Array.isArray(autoJson.data) ? autoJson.data : [];
      cards = names.map((name: string) => ({ name }));
    }
  }

  const payload = { ok: true, cards };
  memoSet(key, payload, DAY);
  return NextResponse.json(payload, { status: 200 });
});