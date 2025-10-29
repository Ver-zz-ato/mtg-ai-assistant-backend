// components/RecentPublicDecks.tsx
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";

type Row = {
  id: string;
  title?: string | null;
  updated_at?: string | null;
  deck_text?: string | null;
  commander?: string | null;
};

// Cookie-free Supabase client for public data (safe to run at build/prerender)
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(url, anon, { auth: { persistSession: false } });

const getRecent = unstable_cache(
  async (limit: number) => {
    const { data, error } = await supabase
      .from("decks")
      .select("id, title, updated_at, deck_text, commander")
      .eq("is_public", true)
      .order("updated_at", { ascending: false })
      .limit(Math.min(Math.max(limit || 10, 1), 24));
    if (error) throw new Error(error.message);
    return (data ?? []) as Row[];
  },
  ["recent_public_decks"],
  { revalidate: 30 }
);

import LikeButton from "./likes/LikeButton";

export default async function RecentPublicDecks({ limit = 10 }: { limit?: number }) {
  let decks: Row[] = [];
  try {
    decks = await getRecent(limit);
  } catch (e) {
    return <div className="text-sm text-red-500">Failed to load recent decks.</div>;
  }

  // Helper function to count cards in deck_text
  const countCards = (deckText: string | null | undefined): number => {
    if (!deckText) return 0;
    const lines = String(deckText).split(/\r?\n/).filter(l => l.trim());
    let total = 0;
    for (const line of lines) {
      const m = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
      if (m) {
        total += parseInt(m[1], 10) || 1;
      } else if (line.trim() && !line.match(/^(Commander|Sideboard|Deck|Maybeboard):/i)) {
        total += 1;
      }
    }
    return total;
  };

  // Filter decks with at least 10 cards
  decks = decks.filter(d => countCards(d.deck_text) >= 10);

  if (!decks.length) {
    return (
      <div className="rounded-xl border border-gray-800 p-4">
        <div className="text-2xl font-semibold mb-2">Recent Public Decks</div>
        <div className="text-xs text-muted-foreground">No public decks yet.</div>
      </div>
    );
  }

  // Derive candidate names for prefetching images across all decks
  const names = Array.from(new Set(decks.flatMap(d => {
    const list: string[] = [];
    const clean = (s: string) => s.replace(/\s*\(.*?\)\s*$/, '').trim();
    if (d.commander) list.push(clean(String(d.commander)));
    if (d.title) list.push(clean(String(d.title)));
    const firstLine = String(d.deck_text || '').split(/\r?\n/).find(l => !!l?.trim());
    if (firstLine) {
      const m = firstLine.match(/^(\d+)\s*[xX]?\s+(.+)$/);
      list.push(clean(m ? m[2] : firstLine));
    }
    return list;
  }).filter(Boolean)));

  // Fallback: if deck_text missing, try to read first card name from deck_cards (public decks allowed via RLS)
  // Fetch top few deck_cards for all decks to use as ultimate fallback art candidates
  let topCardsByDeck = new Map<string, string[]>();
  try {
    const results = await Promise.all(decks.map(async d => {
      const { data } = await supabase
        .from('deck_cards')
        .select('name, qty')
        .eq('deck_id', d.id)
        .order('qty', { ascending: false })
        .limit(5);
      const names = Array.isArray(data) ? data.map(x => String(x.name)) : [];
      return { id: d.id, names };
    }));
    for (const r of results) topCardsByDeck.set(r.id, r.names);

    // For any deck missing deck_text, synthesize a minimal one to aid prefetch
    decks = decks.map(d => {
      if (!(d.deck_text||'').trim()) {
        const names = topCardsByDeck.get(d.id) || [];
        if (names.length) {
          const lines = names.slice(0, 3).map((n) => `1 ${n}`).join('\n');
          return { ...d, deck_text: lines } as Row;
        }
      }
      return d;
    });
  } catch {}

  let imgMap = new Map<string, { small?: string; normal?: string; art_crop?: string }>();
  try {
    const { getImagesForNames } = await import("@/lib/scryfall");
    // include top card names into prefetch set
    const extra = Array.from(topCardsByDeck.values()).flat().filter(Boolean);
    imgMap = await getImagesForNames([...names, ...extra]);
  } catch {}

  return (
    <div className="rounded-xl border border-gray-800 p-4">
      <div className="text-2xl font-semibold mb-2">Recent Public Decks</div>
      <ul className="space-y-2 max-h-[600px] overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#6b7280 #1f2937' }}>
        {decks.slice(0, 10).map((d) => {
          const clean = (s: string) => s.replace(/\s*\(.*?\)\s*$/, '').trim().toLowerCase();
          const candidates: string[] = [];
          if (d.commander) candidates.push(clean(String(d.commander)));
          if (d.title) candidates.push(clean(String(d.title)));
          const firstLine = String(d.deck_text || '').split(/\r?\n/).find(l => !!l?.trim());
          if (firstLine) {
            const m = firstLine.match(/^(\d+)\s*[xX]?\s+(.+)$/);
            candidates.push(clean(m ? m[2] : firstLine));
          }
          // If nothing yet, append top deck cards as ultimate fallback
          if (!Array.isArray(candidates) || candidates.length === 0) candidates.push(...(topCardsByDeck.get(d.id) || []).map(s=>s.toLowerCase()));
          else candidates.push(...(topCardsByDeck.get(d.id) || []).map(s=>s.toLowerCase()));
          // Prefer first available art among candidates
          let art: string | undefined;
          const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g,' ').trim();
          for (const c of candidates) {
            const key = norm(c);
            const img = imgMap.get(key);
            if (img?.art_crop || img?.normal || img?.small) { art = img.art_crop || img.normal || img.small; break; }
          }
          return (
            <li key={d.id} className="relative border rounded-md hover:border-gray-600">
              {art && (<div className="absolute inset-0 bg-cover bg-center opacity-30" style={{ backgroundImage: `url(${art})` }} />)}
              {!art && (<div className="absolute inset-0 bg-neutral-900 skeleton-shimmer" />)}
              <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-transparent" />
              <Link href={`/decks/${d.id}`} prefetch className="block relative p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-base font-semibold line-clamp-1">
                    {d.title ?? "Untitled deck"}
                  </div>
                  <LikeButton deckId={d.id} />
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(d.updated_at ?? Date.now()).toLocaleString()}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
