// app/my-decks/page.tsx
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
    .select("id, title, commander, created_at, updated_at, is_public, deck_text")
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

  // Load pinned decks
  let pinnedIds: string[] = [];
  try {
    const { data: pp } = await supabase.from('profiles_public').select('pinned_deck_ids').eq('id', u.user.id).maybeSingle();
    pinnedIds = Array.isArray((pp as any)?.pinned_deck_ids) ? (pp as any).pinned_deck_ids as string[] : [];
  } catch {}

  // Load top cards across all user's decks (fallback when deck_text is empty)
  // Sort: pinned first
  rows.sort((a:any,b:any)=>{
    const ap = pinnedIds.includes(a.id) ? 0 : 1;
    const bp = pinnedIds.includes(b.id) ? 0 : 1;
    if (ap!==bp) return ap-bp; return String(b.created_at||'').localeCompare(String(a.created_at||''));
  });

  const ids = rows.map(r => r.id);
  const topByDeck = new Map<string, string[]>();
  try {
    const { data: cards } = await supabase
      .from('deck_cards')
      .select('deck_id, name, qty')
      .in('deck_id', ids)
      .order('qty', { ascending: false });
    const grp = new Map<string, Array<{ name:string; qty:number }>>();
    for (const c of (cards || []) as any[]) {
      const arr = grp.get(c.deck_id) || []; arr.push({ name: String(c.name), qty: Number(c.qty||1) }); grp.set(c.deck_id, arr);
    }
    for (const [deckId, arr] of grp.entries()) {
      const names = arr.sort((a,b)=> (b.qty||0)-(a.qty||0)).slice(0, 8).map(x => String(x.name));
      topByDeck.set(deckId, names);
    }
  } catch {}

  // Prefetch art: commander/title/first card + top cards
  function cleanName(s: string): string {
    return String(s||'')
      .replace(/\s*\(.*?\)\s*$/, '') // strip parentheticals
      .replace(/^SB:\s*/i, '')         // sideboard prefix common in exports
      .replace(/^[-•]\s*/, '')         // dash/bullet prefix
      .replace(/^"|"$/g, '')          // outer quotes
      .replace(/\s+/g, ' ')
      .trim();
  }
  function extractNamesFromText(deckText: string): string[] {
    const out: string[] = [];
    const lines = String(deckText||'').split(/\r?\n/).map((l:string)=>l.trim()).filter(Boolean);
    const rxQtyPrefix = /^(\d+)\s*[xX]?\s+(.+)$/;           // "1 Sol Ring" or "2x Sol Ring"
    const rxCsv = /^(.+?),(?:\s*)"?\d+"?\s*$/;              // "Sol Ring,\"18\"" or "Sol Ring,18"
    const rxDash = /^[-•]\s*(.+)$/;                            // "- Sol Ring"
    for (const l of lines.slice(0, 50)) { // be generous but bounded
      let name = '';
      let m = l.match(rxQtyPrefix);
      if (m) name = m[2]; else {
        m = l.match(rxCsv);
        if (m) name = m[1]; else {
          m = l.match(rxDash);
          if (m) name = m[1];
        }
      }
      if (!name) {
        // If line has a comma but didn't match CSV (e.g., trailing comments), take left half conservatively
        if (/,/.test(l)) name = l.split(',')[0];
      }
      if (name) out.push(cleanName(name));
      if (out.length >= 20) break; // cap to avoid over-fetch
    }
    return out.filter(Boolean);
  }

  const nameSet = new Set<string>(rows.flatMap((d) => {
    const list: string[] = [];
    if (d.commander) list.push(cleanName(String(d.commander)));
    if (d.title) list.push(cleanName(String(d.title)));
    extractNamesFromText(String(d.deck_text||'')).forEach(n => list.push(n));
    const tops = topByDeck.get(d.id) || [];
    tops.forEach(n => list.push(cleanName(n)));
    return list;
  }).filter(Boolean));
  const imgMap = await getImagesForNamesCached(Array.from(nameSet));
  const norm = (s: string) => String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">My Decks</h1>
        {/* Create moved to FAB modal */}
      </div>
      <div className="mb-3 text-sm"><a className="underline underline-offset-4" href="/collections/cost-to-finish">Open Cost to Finish →</a></div>

      {rows.length === 0 && <div className="text-gray-400">No decks saved yet.</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {rows.map((r) => {
          const title = r.title ?? "Untitled Deck";
          const created = r.created_at ? new Date(r.created_at).toLocaleString() : "";
          // Build candidate art list similar to public profile fallbacks
          const candidates: string[] = [];
          if (r.commander) candidates.push(cleanName(String(r.commander)));
          if (r.title) candidates.push(cleanName(String(r.title)));
          extractNamesFromText(String(r.deck_text||''))?.forEach(n => candidates.push(n));
          const tops = topByDeck.get(r.id) || [];
          for (const n of tops) candidates.push(cleanName(n));
          let art: string | undefined;
          for (const c of candidates) { const img = imgMap.get(norm(c)); if (img?.art_crop || img?.normal || img?.small) { art = img.art_crop || img.normal || img.small; break; } }
          return (
            <div key={r.id} className="relative border rounded overflow-hidden group bg-neutral-950 min-h-[96px]">
              {/* Banner background with gradient overlay */}
              <div className="absolute inset-0 bg-center bg-cover opacity-60" style={art ? { backgroundImage: `url(${art})` } : undefined} />
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
              <div className="relative flex items-center justify-between">
                <a href={`/my-decks?deckId=${encodeURIComponent(r.id)}`} className="flex-1 min-w-0 p-0 block" title="Quick view">
                  <div className="flex items-center gap-3 p-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate flex items-center gap-2">{title}</div>
                      {/* timeline tiny at bottom */}
                      <div className="text-[10px] opacity-70 mt-1">{r.updated_at? `Updated ${new Date(r.updated_at).toLocaleDateString()}`: ''}{r.created_at? ` · Created ${new Date(r.created_at).toLocaleDateString()}`:''}</div>
                    </div>
                  </div>
                </a>
                <div className="px-3 py-2 flex items-center gap-2">
                  <LikeButton deckId={r.id} />
                  {/* Pin button */}
                  {(()=>{ const Pin = require('@/components/PinDeckButton').default; return (<Pin deckId={r.id} pinned={pinnedIds.includes(r.id)} currentPinned={pinnedIds} />); })()}
                  <a href={`/my-decks/${encodeURIComponent(r.id)}`} className="text-xs px-2 py-1 rounded border border-neutral-700">Edit</a>
                  {(()=>{ const Menu = require('@/components/DeckCardMenu').default; return (<Menu id={r.id} title={r.title} is_public={r.is_public} />); })()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Right drawer */}
      {(()=>{ const MyDecksClient = require('@/components/MyDecksClient').default; const decks = rows.map((r:any)=>({ id:r.id, title: (r.title||'Untitled Deck'), is_public: !!r.is_public, updated_at: r.updated_at, created_at: r.created_at, art: (()=>{ const candidates:string[]=[]; if(r.commander) candidates.push(cleanName(String(r.commander))); if(r.title) candidates.push(cleanName(String(r.title))); extractNamesFromText(String(r.deck_text||''))?.forEach(n=>candidates.push(n)); const tops=topByDeck.get(r.id)||[]; for(const n of tops) candidates.push(cleanName(n)); for(const c of candidates){ const img=imgMap.get(norm(c)); if(img?.art_crop||img?.normal||img?.small) return img.art_crop||img.normal||img.small; } return undefined; })() })); const CreateFAB = require('@/components/CreateDeckFAB').default; return (<><MyDecksClient decks={decks} /><CreateFAB /></>); })()}
    </div>
  );
}
