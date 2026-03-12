/**
 * GET /api/cards/search-commanders?q=...
 *
 * Search for cards that can be commanders only.
 * Uses commander-legality rules per .cursor/rules/commander-legality.mdc:
 * - Legendary Creature, or
 * - oracle_text contains "can be your commander", or
 * - Partner/Background/Friends forever/Doctor's companion
 *
 * Scryfall: is:commander = "cards that can be your commander"
 */
import { NextRequest, NextResponse } from "next/server";
import { memoGet, memoSet } from "@/lib/utils/memoCache";
import { withLogging } from "@/lib/api/withLogging";

export const runtime = "nodejs";
export const revalidate = 3600;

const DAY = 24 * 60 * 60 * 1000;

async function scryfallSearchCommanders(q: string): Promise<{ name: string }[]> {
  const fullQuery = `${q} is:commander`.trim();
  const res = await fetch(
    `https://api.scryfall.com/cards/search?q=${encodeURIComponent(fullQuery)}&unique=cards&order=edhrec`,
    { cache: "no-store" }
  );
  if (!res.ok) return [];
  const json = await res.json().catch(() => ({}));
  if (json?.object === "error") return [];
  const data = json?.data || [];
  return data.map((c: { name: string }) => ({ name: c.name }));
}

export const GET = withLogging(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ ok: true, cards: [] }, { status: 200 });

  const key = `scryfall-commanders:${q.toLowerCase()}`;
  try {
    const cached = memoGet<{ ok: boolean; cards: { name: string }[] }>(key);
    if (cached) return NextResponse.json(cached, { status: 200 });
  } catch {}

  const cards = await scryfallSearchCommanders(q);
  const payload = { ok: true, cards };

  try {
    memoSet(key, payload, DAY);
  } catch {}
  return NextResponse.json(payload, { status: 200 });
});
