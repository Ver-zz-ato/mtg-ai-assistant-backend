// components/MostLikedPublicDecks.tsx
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(url, anon, { auth: { persistSession: false } });

const getMostLiked = unstable_cache(
  async (limit: number) => {
    const { data: decks } = await supabase
      .from('decks')
      .select('id, title')
      .eq('is_public', true)
      .limit(50);
    const rows = Array.isArray(decks) ? decks as any[] : [];
    const pairs: { id: string; title: string; count: number }[] = [];
    for (const d of rows) {
      const { count } = await supabase
        .from('deck_likes')
        .select('deck_id', { count: 'exact', head: true })
        .eq('deck_id', d.id);
      pairs.push({ id: d.id, title: d.title || 'Untitled', count: count || 0 });
    }
    pairs.sort((a, b) => b.count - a.count);
    return pairs.slice(0, Math.min(Math.max(limit||5,1), 10));
  },
  ["most_liked_public_decks"],
  { revalidate: 60 }
);

export default async function MostLikedPublicDecks({ limit = 5 }: { limit?: number }) {
  let top: { id: string; title: string; count: number }[] = [];
  try { top = await getMostLiked(limit); } catch {}
  if (!top.length) return null;
  return (
    <div className="rounded-xl border border-gray-800 p-4">
      <div className="text-sm font-semibold mb-2">Most liked decks</div>
      <ul className="space-y-1 text-sm">
        {top.map(p => (
          <li key={p.id} className="flex items-center justify-between">
            <Link href={`/decks/${p.id}`} className="hover:underline truncate">{p.title}</Link>
            <span className="opacity-80">❤ {p.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
