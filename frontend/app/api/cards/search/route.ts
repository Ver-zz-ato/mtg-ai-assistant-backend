// app/api/cards/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { memoGet, memoSet } from "@/lib/utils/memoCache";
import { withLogging } from "@/lib/api/withLogging";

export const runtime = 'nodejs';
export const revalidate = 3600; // 1 hour

const DAY = 24 * 60 * 60 * 1000;

/** Scryfall autocomplete is best for typeahead (partial names like "sol r" -> Sol Ring) */
async function scryfallAutocomplete(q: string): Promise<{ name: string }[]> {
  const res = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
  if (!res.ok) return [];
  const json = await res.json().catch(() => ({}));
  const names = Array.isArray(json?.data) ? json.data : [];
  return names.map((name: string) => ({ name }));
}

/** Scryfall search for complex queries (syntax, filters) */
async function scryfallSearch(q: string): Promise<{ name: string; set?: string; set_name?: string; mana_cost?: string; type_line?: string }[]> {
  const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&unique=cards&order=edhrec`, { cache: 'no-store' });
  if (!res.ok) return [];
  const json = await res.json().catch(() => ({}));
  if (json?.object === 'error') return [];
  const data = json?.data || [];
  return data.map((c: any) => ({
    name: c.name,
    set: c.set,
    set_name: c.set_name,
    mana_cost: c.mana_cost,
    type_line: c.type_line,
  }));
}

export const GET = withLogging(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ ok: true, cards: [] }, { status: 200 });

  const key = `scryfall:${q.toLowerCase()}`;
  try {
    const cached = memoGet<any>(key);
    if (cached) return NextResponse.json(cached, { status: 200 });
  } catch { /* memoCache can fail on Edge */ }

  // Use autocomplete FIRST for typeahead - it handles "sol r", "sol ring" etc. reliably
  let cards = await scryfallAutocomplete(q);

  // Fallback to search for complex queries (e.g. "t:creature cmc:3") or when autocomplete returns nothing
  if (cards.length === 0) {
    cards = await scryfallSearch(q);
  }

  const payload = { ok: true, cards };
  try {
    memoSet(key, payload, DAY);
  } catch { /* memoCache can fail on Edge */ }
  return NextResponse.json(payload, { status: 200 });
});