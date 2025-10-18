// app/profile/page.tsx
import FeedbackFab from "@/components/FeedbackFab";
import ProfileClient from "./Client";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function norm(s: string) { return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim(); }

async function scryfallBatch(names: string[]) {
  const identifiers = Array.from(new Set((names||[]).filter(Boolean))).slice(0, 400).map(n=>({ name: n }));
  const out: Record<string, any> = {};
  if (!identifiers.length) return out;
  try {
    const r = await fetch('https://api.scryfall.com/cards/collection', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ identifiers }) });
    const j:any = await r.json().catch(()=>({}));
    const rows:any[] = Array.isArray(j?.data) ? j.data : [];
    for (const c of rows) out[norm(c?.name||'')] = c;
  } catch {}
  return out;
}

async function getDeckArt(sb: any, deckId: string, dbg: { candidates: string[]; method?: 'collection'|'fuzzy'|null }) {
  try {
    const { data } = await sb.from('decks').select('title, commander, deck_text').eq('id', deckId).maybeSingle();
    const list: string[] = [];
    const clean = (s: string) => String(s||'').replace(/\s*\(.*?\)\s*$/, '').trim();
    if (data?.commander) list.push(clean(String(data.commander)));
    if (data?.title) list.push(clean(String(data.title)));
    const lines = String(data?.deck_text||'').split(/\r?\n/).map((l:string)=>l.trim()).filter(Boolean).slice(0,5);
    for (const line of lines) { const m = line.match(/^(\d+)\s*[xX]?\s+(.+)$/); list.push(clean(m ? m[2] : line)); }
    try {
      const { data: top } = await sb.from('deck_cards').select('name, qty').eq('deck_id', deckId).order('qty', { ascending: false }).limit(5);
      for (const r of (top as any[]) || []) list.push(clean(String(r.name)));
    } catch {}
    dbg.candidates = list.slice(0, 50);
    const imgMap = await scryfallBatch(list);
    for (const n of list) { const img = imgMap[norm(n)]; if (img?.art_crop || img?.normal || img?.small) { dbg.method = 'collection'; return img.art_crop || img.normal || img.small; } }
    for (const n of list.slice(0, 20)) {
      try {
        const fr = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(n)}`, { cache: 'no-store' });
        if (!fr.ok) continue;
        const card: any = await fr.json().catch(()=>({}));
        const img = card?.image_uris || card?.card_faces?.[0]?.image_uris || {};
        const url = img.art_crop || img.normal || img.small;
        if (url) { dbg.method = 'fuzzy'; return url; }
      } catch {}
    }
  } catch {}
  dbg.method = null;
  return undefined;
}

export default async function Page() {
  const sb = await createClient();
  const { data: ures } = await sb.auth.getUser();
  const u = ures?.user;
  let bannerArt: string | undefined;
  let bannerDebug: { source: string; method: 'collection'|'fuzzy'|null; candidates: string[]; art: string|null } = { source: 'none', method: null, candidates: [], art: null };
  if (u?.id) {
    try {
      const { data: prof } = await sb.from('profiles_public').select('signature_deck_id,favorite_commander').eq('id', u.id).maybeSingle();
      const sig = (prof as any)?.signature_deck_id || null;
      const fav = (prof as any)?.favorite_commander || '';
      if (sig) { const dbg={candidates:[],method:null as any}; bannerArt = await getDeckArt(sb, sig, dbg); bannerDebug={ source:'signature', method: dbg.method||null, candidates: dbg.candidates, art: bannerArt||null }; }
      if (!bannerArt && fav) {
        bannerDebug = { source:'favorite', method: null, candidates: [String(fav)], art: null };
        try { const fr = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(String(fav))}`, { cache: 'no-store' }); if (fr.ok) { const card:any = await fr.json().catch(()=>({})); const img = card?.image_uris || card?.card_faces?.[0]?.image_uris || {}; bannerArt = img.art_crop || img.normal || img.small || undefined; bannerDebug.method = 'fuzzy'; bannerDebug.art = bannerArt||null; } } catch {}
      }
      if (!bannerArt) {
        const { data: decks } = await sb.from('decks').select('id').eq('user_id', u.id).order('updated_at', { ascending: false }).limit(1);
        const first = Array.isArray(decks) && decks[0]?.id ? String(decks[0].id) : '';
        if (first) { const dbg={candidates:[],method:null as any}; bannerArt = await getDeckArt(sb, first, dbg); bannerDebug={ source:'recent', method: dbg.method||null, candidates: dbg.candidates, art: bannerArt||null }; }
      }
    } catch {}
  }
  return (
    <main className="max-w-none mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold text-center">My Profile</h1>
      <ProfileClient initialBannerArt={bannerArt||null} initialBannerDebug={bannerDebug} />
      <FeedbackFab />
    </main>
  );
}
