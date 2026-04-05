// app/api/cards/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

/** True if the query likely uses Scryfall search syntax (skip named-fuzzy fallback). */
function looksLikeScryfallSyntax(q: string): boolean {
  return /[:=!]/.test(q);
}

/**
 * Last-resort typo recovery when autocomplete + search return nothing.
 * Scryfall `named?fuzzy` only — returns `{ name }`, not a cache row or full Scryfall card.
 * Callers still run `/api/cards/fuzzy` (etc.) on add; we additionally require a `scryfall_cache`
 * row before surfacing this tier so the dropdown does not suggest uncached-only oracle titles.
 */
async function scryfallNamedFuzzyBest(q: string): Promise<{ name: string } | null> {
  const t = q.trim();
  if (t.length < 3 || looksLikeScryfallSyntax(t)) return null;
  try {
    const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(t)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => ({}))) as { object?: string; name?: string };
    if (j?.object === "error") return null;
    const name = typeof j?.name === "string" ? j.name.trim() : "";
    return name ? { name } : null;
  } catch {
    return null;
  }
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

  // Typo / near-miss: autocomplete + search often miss mispelled card titles — one-shot named fuzzy,
  // only if that oracle name exists in our cache (avoid phantom picks with no cache-backed metadata).
  if (cards.length === 0) {
    const fuzzyOne = await scryfallNamedFuzzyBest(q);
    if (fuzzyOne) {
      try {
        const supabase = await createClient();
        const { data: row } = await supabase
          .from("scryfall_cache")
          .select("name")
          .eq("name", fuzzyOne.name)
          .maybeSingle();
        if (row?.name) cards = [{ name: row.name }];
      } catch {
        /* keep cards empty — same as missing cache row */
      }
    }
  }

  const payload = { ok: true, cards };
  try {
    memoSet(key, payload, DAY);
  } catch { /* memoCache can fail on Edge */ }
  return NextResponse.json(payload, { status: 200 });
});