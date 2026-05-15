// components/MostLikedPublicDecks.tsx
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { getMainboardCardCount, isPublicBrowseDeckCompliant, mainDeckTextCardCount } from "@/lib/deck/formatCompliance";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(url, anon, { auth: { persistSession: false } });

const getMostLiked = unstable_cache(
  async (limit: number) => {
    // Use a more efficient approach: get all public decks with their like counts
    // First, get all public deck IDs
    const { data: allDecks } = await supabase
      .from('decks')
      .select('id, title, format, deck_text')
      .eq('is_public', true);
    
    if (!allDecks || allDecks.length === 0) return [];
    
    const deckIds = allDecks.map(d => d.id);
    
    // Get like counts for all decks in one query using RPC or by grouping
    // Since Supabase doesn't have a direct group by, we'll fetch all likes and count in memory
    // This is more efficient than N+1 queries
    const { data: allLikes } = await supabase
      .from('deck_likes')
      .select('deck_id')
      .in('deck_id', deckIds);
    
    // Count likes per deck
    const likeCounts = new Map<string, number>();
    if (allLikes) {
      for (const like of allLikes) {
        likeCounts.set(like.deck_id, (likeCounts.get(like.deck_id) || 0) + 1);
      }
    }
    
    // Build pairs with like counts
    const pairs: { id: string; title: string; count: number }[] = [];
    
    // Check card counts in batches to avoid too many queries
    const batchSize = 50;
    for (let i = 0; i < allDecks.length; i += batchSize) {
      const batch = allDecks.slice(i, i + batchSize);
      const batchIds = batch.map(d => d.id);
      
      // Check card counts for this batch
      const { data: cardCounts } = await supabase
        .from('deck_cards')
        .select('deck_id, qty, zone')
        .in('deck_id', batchIds);
      
      const rowsPerDeck = new Map<string, Array<{ qty: number; zone?: string | null }>>();
      if (cardCounts) {
        for (const card of cardCounts) {
          const deckId = String(card.deck_id);
          const bucket = rowsPerDeck.get(deckId) ?? [];
          bucket.push({ qty: Number(card.qty ?? 0), zone: card.zone ?? null });
          rowsPerDeck.set(deckId, bucket);
        }
      }
      
      // Add to pairs only if the public deck is format-complete.
      for (const deck of batch) {
        const mainCount =
          getMainboardCardCount(rowsPerDeck.get(deck.id) ?? []) ||
          mainDeckTextCardCount(String((deck as { deck_text?: string | null }).deck_text ?? ""), (deck as { format?: string | null }).format ?? null);
        if (isPublicBrowseDeckCompliant((deck as { format?: string | null }).format ?? null, mainCount)) {
          pairs.push({
            id: deck.id,
            title: deck.title || 'Untitled',
            count: likeCounts.get(deck.id) || 0
          });
        }
      }
    }
    
    // Sort by like count descending
    pairs.sort((a, b) => b.count - a.count);
    return pairs.slice(0, Math.min(Math.max(limit||5,1), 10));
  },
  ["most_liked_public_decks"],
  { revalidate: 30 } // Reduced cache time to 30 seconds to show updates faster
);

export default async function MostLikedPublicDecks({ limit = 5 }: { limit?: number }) {
  let top: { id: string; title: string; count: number }[] = [];
  try { top = await getMostLiked(limit); } catch {}
  if (!top.length) return null;
  return (
    <div className="rounded-xl border border-gray-800 p-4 bg-neutral-950/50 hover:border-gray-700 transition-all duration-200">
      <div className="text-2xl font-semibold mb-3">Most liked decks</div>
      <ul className="space-y-1 text-sm">
        {top.map((p, i) => {
          const medal = i===0 ? '🥇' : i===1 ? '🥈' : i===2 ? '🥉' : '';
          const rowClass = i===0 ? 'bg-amber-900/20 border-amber-700' : i===1 ? 'bg-slate-900/20 border-slate-600' : i===2 ? 'bg-orange-900/20 border-orange-700' : 'bg-transparent border-transparent';
          return (
            <li key={p.id} className={`flex items-center justify-between rounded px-2 py-1 border ${rowClass} transition-all duration-200 hover:shadow-md hover:scale-[1.02] cursor-pointer`}>
              <div className="flex items-center gap-2 min-w-0">
                {medal && <span aria-hidden>{medal}</span>}
                <Link href={`/decks/${p.id}`} className="hover:underline truncate transition-colors hover:text-blue-400">{p.title}</Link>
              </div>
              <span className="opacity-80 shrink-0">❤ {p.count}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
