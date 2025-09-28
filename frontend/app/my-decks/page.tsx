// app/my-decks/page.tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NewDeckInline from "@/components/NewDeckInline";
import DeckDeleteButton from "@/components/DeckDeleteButton";
import LikeButton from "@/components/likes/LikeButton";
import DeckRowActions from "@/components/DeckRowActions";
import { getImagesForNamesCached } from "@/lib/server/scryfallCache";

type DeckRow = {
  id: string;
  title: string | null;
  commander: string | null;
  created_at: string | null;
};

export default async function Page() {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-xl font-semibold mb-4">My Decks</h1>
        <p className="text-sm">Please sign in to see your decks.</p>
      </div>
    );
  }

  const { data, error } = await supabase
    .from("decks")
    .select("id, title, commander, created_at, is_public, deck_text")
    .eq("user_id", u.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-xl font-semibold mb-4">My Decks</h1>
        <p className="text-red-500">{error.message}</p>
      </div>
    );
  }

  const rows: any[] = (data || []) as any;

  // Prefetch art: commander/title/first card + top cards
  const nameSet = new Set<string>(rows.flatMap((d) => {
    const list: string[] = [];
    const clean = (s: string) => String(s||'').replace(/\s*\(.*?\)\s*$/, '').trim();
    if (d.commander) list.push(clean(String(d.commander)));
    if (d.title) list.push(clean(String(d.title)));
    const first = String(d.deck_text||'').split(/\r?\n/).find((l:string)=>!!l?.trim());
    if (first) { const m = first.match(/^(\d+)\s*[xX]?\s+(.+)$/); list.push(clean(m ? m[2] : first)); }
    return list;
  }).filter(Boolean));
  // pull top cards per deck
  const topByDeck = new Map<string,string[]>();
  try {
    const results = await Promise.all(rows.map(async (d) => {
      const { data } = await supabase.from('deck_cards').select('name, qty').eq('deck_id', d.id).order('qty', { ascending: false }).limit(5);
      return { id: d.id, names: Array.isArray(data) ? (data as any[]).map(x => String(x.name)) : [] };
    }));
    for (const r of results) topByDeck.set(r.id, r.names);
    for (const arr of topByDeck.values()) for (const n of arr) nameSet.add(n);
  } catch {}
  const imgMap = await getImagesForNamesCached(Array.from(nameSet));
  const norm = (s: string) => String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">My Decks</h1>
        <NewDeckInline />
      </div>
      <div className="mb-3 text-sm"><a className="underline underline-offset-4" href="/collections/cost-to-finish">Open Cost to Finish →</a></div>

      {rows.length === 0 && <div className="text-gray-400">No decks saved yet.</div>}

      <ul className="space-y-2">
        {rows.map((r) => {
          const title = r.title ?? "Untitled Deck";
          const created = r.created_at ? new Date(r.created_at).toLocaleString() : "";
          return (
            <li key={r.id} className="border rounded p-0 overflow-hidden group">
              <div className="flex items-center justify-between">
                <Link href={`/my-decks/${encodeURIComponent(r.id)}`} className="flex-1 min-w-0 p-0 block hover:bg-neutral-900/40">
                  <div className="flex items-center gap-3 p-3">
                    {(() => {
                      const candidates: string[] = [];
                      const clean = (s: string) => String(s||'').replace(/\s*\(.*?\)\s*$/, '').trim();
                      if (r.commander) candidates.push(clean(String(r.commander)));
                      if (r.title) candidates.push(clean(String(r.title)));
                      const first = String(r.deck_text||'').split(/\r?\n/).find((l:string)=>!!l?.trim());
                      if (first) { const m = first.match(/^(\d+)\s*[xX]?\s+(.+)$/); candidates.push(clean(m ? m[2] : first)); }
                      const tops = (topByDeck.get(r.id) || []);
                      candidates.push(...tops);
                      let art: string | undefined;
                      for (const c of candidates) { const img = imgMap.get(norm(c)); if (img?.art_crop || img?.normal || img?.small) { art = img.art_crop || img.normal || img.small; break; } }
                      return <div className="w-14 h-10 rounded overflow-hidden bg-neutral-900 bg-cover bg-center" style={art?{ backgroundImage:`url(${art})`}:{}} />;
                    })()}
                    <div className="min-w-0">
                      <div className="font-medium truncate">{title}</div>
                      <div className="text-xs text-gray-500">{created}</div>
                    </div>
                  </div>
                </Link>
                <div className="px-3 py-2 flex items-center gap-2">
                  <LikeButton deckId={r.id} />
                  <DeckRowActions id={r.id} title={r.title} is_public={r.is_public} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
