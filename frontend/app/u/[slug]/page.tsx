// app/u/[slug]/page.tsx
import { createClient } from "@/lib/supabase/server";

export const revalidate = 180; // short ISR for public profile pages
export const runtime = "nodejs";

type Params = { slug: string };

import LikeButton from "@/components/likes/LikeButton";
import { getImagesForNamesCached } from "@/lib/server/scryfallCache";

export default async function Page({ params }: { params: Promise<Params> }) {
  // Utilities for Scryfall data (server-side)
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

  function pieSvg(counts: Record<string, number>) {
    const total = Object.values(counts).reduce((a,b)=>a+b,0) || 1;
    let start = -Math.PI/2; const R=42, CX=50, CY=50;
    const colors: Record<string,string> = { W:'#e5e7eb', U:'#60a5fa', B:'#64748b', R:'#f87171', G:'#34d399' };
    const segs: any[] = [];
    (['W','U','B','R','G'] as const).forEach((k) => {
      const frac = (counts[k]||0)/total; const end = start + 2*Math.PI*frac;
      const x1 = CX + R*Math.cos(start), y1 = CY + R*Math.sin(start);
      const x2 = CX + R*Math.cos(end), y2 = CY + R*Math.sin(end);
      const large = (end-start) > Math.PI ? 1 : 0;
      const d = `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;
      segs.push(<path key={k} d={d} fill={colors[k]} stroke="#111" strokeWidth="0.5"/>);
      start = end;
    });
    return <svg viewBox="0 0 100 100" className="w-28 h-28">{segs}</svg>;
  }

  function radarSvg(radar: Record<string, number>) {
    const keys = ['aggro','control','combo','midrange','stax'] as const;
    const max = Math.max(1, ...keys.map(k=>radar[k]||0));
    const R = 42, CX=60, CY=60;
    const points: string[] = [];
    keys.forEach((k, i) => {
      const ang = -Math.PI/2 + i*(2*Math.PI/keys.length);
      const val = ((radar[k]||0)/max) * R;
      const x = CX + val*Math.cos(ang); const y = CY + val*Math.sin(ang);
      points.push(`${x},${y}`);
    });
    const axes = keys.map((k,i)=>{
      const ang = -Math.PI/2 + i*(2*Math.PI/keys.length);
      const x = CX + R*Math.cos(ang), y = CY + R*Math.sin(ang);
      return <line key={k} x1={CX} y1={CY} x2={x} y2={y} stroke="#333" strokeWidth="0.5"/>;
    });
    const labels = keys.map((k,i)=>{
      const ang = -Math.PI/2 + i*(2*Math.PI/keys.length);
      const x = CX + (R+10)*Math.cos(ang), y = CY + (R+10)*Math.sin(ang);
      return <text key={`lbl-${k}`} x={x} y={y} fontSize="8" textAnchor="middle" fill="#9ca3af">{k}</text>;
    });
    return (
      <svg viewBox="0 0 140 140" className="w-36 h-36">
        <g transform="translate(10,10)">
          <circle cx={60} cy={60} r={42} fill="none" stroke="#333" strokeWidth="0.5" />
          {axes}
          <polygon points={points.join(' ')} fill="rgba(56,189,248,0.35)" stroke="#22d3ee" strokeWidth="1" />
          {labels}
        </g>
      </svg>
    );
  }
  // Inline helpers
  function norm(s: string) { return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim(); }

  async function getDeckArt(deckId: string) {
    try {
      const { data } = await supabase.from('decks').select('title, commander, deck_text').eq('id', deckId).maybeSingle();
      const list: string[] = [];
      const clean = (s: string) => String(s||'').replace(/\s*\(.*?\)\s*$/, '').trim();
      if (data?.commander) list.push(clean(String(data.commander)));
      if (data?.title) list.push(clean(String(data.title)));
      // Take first up to 5 non-empty lines as candidates too
      const lines = String(data?.deck_text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,5);
      for (const line of lines) { const m = line.match(/^(\d+)\s*[xX]?\s+(.+)$/); list.push(clean(m ? m[2] : line)); }
      // Fallback: fetch top few deck_cards for this deck to seed art candidates
      try {
        const { data: top } = await supabase.from('deck_cards').select('name, qty').eq('deck_id', deckId).order('qty', { ascending: false }).limit(5);
        for (const r of (top as any[]) || []) list.push(clean(String(r.name)));
      } catch {}
      const candidates = Array.from(new Set(list));
      console.log(JSON.stringify({ tag: 'public_profile_banner_candidates', deckId, candidates_count: candidates.length }));
      const imgMap = await getImagesForNamesCached(candidates);
      for (const n of candidates) { const img = imgMap.get(norm(n)); if (img?.art_crop || img?.normal || img?.small) return img.art_crop || img.normal || img.small; }
      // Fuzzy fallback (gentle; cap a few requests)
      for (const n of candidates.slice(0, 20)) {
        try {
          const fr = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(n)}`, { cache: 'no-store' });
          if (!fr.ok) continue;
          const card: any = await fr.json().catch(()=>({}));
          const img = card?.image_uris || card?.card_faces?.[0]?.image_uris || {};
          const url = img.art_crop || img.normal || img.small;
          if (url) return url;
        } catch {}
      }
    } catch {}
    return undefined;
  }

  async function SignatureDeckArt({ deckId }: { deckId: string }) {
    const art = await getDeckArt(deckId);
    if (!art) return null as any;
    return (
      <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-cover bg-center opacity-35" style={{ backgroundImage: `url(${art})` }} />
        <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />
      </div>
    );
  }

  async function TopCommanders({ userId }: { userId: string }) {
    let cmds: Record<string, number> = {};
    try {
      const { data } = await supabase
        .from('decks')
        .select('commander')
        .eq('user_id', userId)
        .eq('is_public', true);
      const rows = Array.isArray(data) ? data : [];
      for (const r of rows) { const n = String(r?.commander||'').trim(); if (n) cmds[n] = (cmds[n]||0)+1; }
    } catch {}
    const list = Object.entries(cmds).sort((a,b)=>b[1]-a[1]).slice(0,10);
    if (!list.length) return null as any;

    // Fetch thumbnails for commanders
    const imgMap = await getImagesForNamesCached(list.map(([n])=>n));

    return (
      <section className="rounded-xl border border-neutral-800 p-4 space-y-2">
        <div className="text-lg font-semibold">Top commanders</div>
        <ul className="space-y-2 text-sm">
          {list.map(([n,c]) => {
            const img = imgMap.get(norm(n));
            const art = img?.art_crop || img?.normal || img?.small || '';
            return (
              <li key={n} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded overflow-hidden bg-neutral-900 bg-cover bg-center" style={art?{ backgroundImage:`url(${art})`}:{}} />
                  <span className="truncate">{n}</span>
                </div>
                <span className="opacity-80">{c}</span>
              </li>
            );
          })}
        </ul>
      </section>
    ) as any;
  }

  async function MostLikedDecks({ userId }: { userId: string }) {
    let decks: any[] = [];
    try {
      const { data } = await supabase.from('decks').select('id, title').eq('user_id', userId).eq('is_public', true).limit(12);
      decks = Array.isArray(data) ? data : [];
    } catch {}
    const pairs: { id: string; title: string; count: number }[] = [];
    for (const d of decks) {
      try {
        const { count } = await supabase.from('deck_likes').select('deck_id', { count: 'exact', head: true }).eq('deck_id', d.id);
        pairs.push({ id: d.id, title: d.title || 'Untitled', count: count || 0 });
      } catch { pairs.push({ id: d.id, title: d.title || 'Untitled', count: 0 }); }
    }
    pairs.sort((a,b)=>b.count-a.count);
    const top = pairs.slice(0,3);
    if (!top.length) return null as any;
    return (
      <section className="rounded-xl border border-neutral-800 p-4 space-y-2">
        <div className="text-lg font-semibold">Most liked decks</div>
        <ul className="space-y-1 text-sm">
          {top.map(p => (<li key={p.id} className="flex items-center justify-between"><a href={`/decks/${p.id}`} className="hover:underline truncate">{p.title}</a><span className="opacity-80">❤ {p.count}</span></li>))}
        </ul>
      </section>
    ) as any;
  }

  async function PinnedDecks({ userId, deckIds }: { userId: string; deckIds: string[] }) {
    const ids = Array.isArray(deckIds) ? deckIds.slice(0,3) : [];
    if (!ids.length) return null as any;
    let rows: any[] = [];
    try {
      const { data } = await supabase.from('decks').select('id, title').in('id', ids).eq('user_id', userId).eq('is_public', true);
      rows = Array.isArray(data) ? data : [];
    } catch {}
    if (!rows.length) return null as any;
    return (
      <section className="rounded-xl border border-neutral-800 p-4 space-y-2">
        <div className="text-lg font-semibold">Pinned decks</div>
        <ul className="space-y-1 text-sm">
          {rows.map(r => (<li key={r.id} className="flex items-center justify-between"><a href={`/decks/${r.id}`} className="hover:underline truncate">{r.title || 'Untitled'}</a><span className="opacity-50">📌</span></li>))}
        </ul>
      </section>
    ) as any;
  }
  const { slug } = await params;
  const supabase = await createClient();

  // Try by username first, then by id
  let prof: any = null;
  try {
    const { data } = await supabase.from('profiles_public').select('*').eq('username', slug).maybeSingle();
    prof = data || null;
  } catch {}
  if (!prof) {
    try {
      const { data } = await supabase.from('profiles_public').select('*').eq('id', slug).maybeSingle();
      prof = data || null;
    } catch {}
  }

  if (!prof || prof.is_public === false) {
    return (
      <main className="max-w-3xl mx-auto p-6">
        <h1 className="text-xl font-semibold">Profile</h1>
        <p className="text-sm opacity-70">Profile not found or private.</p>
      </main>
    );
  }

  const colors: string[] = Array.isArray(prof.colors) ? prof.colors : [];
  const map: Record<string,string> = { W: '#e5e7eb', U: '#60a5fa', B: '#64748b', R: '#f87171', G: '#34d399' };
  const gradient = `linear-gradient(90deg, ${(colors.length?colors:['U','B']).map((c:string)=>map[c]||'#888').join(', ')})`;


  // Recent public decks for this user
  let decks: any[] = [];
  try {
    const { data } = await supabase
      .from('decks')
      .select('id, title, updated_at, deck_text, commander')
      .eq('user_id', prof.id)
      .eq('is_public', true)
      .order('updated_at', { ascending: false })
      .limit(12);
    decks = Array.isArray(data) ? data : [];
  } catch {}

  // Prefetch art using same logic as homepage
  const nameSet = new Set<string>(decks.flatMap(d => {
    const list: string[] = [];
    const clean = (s: string) => String(s||'').replace(/\s*\(.*?\)\s*$/, '').trim();
    if (d.commander) list.push(clean(String(d.commander)));
    if (d.title) list.push(clean(String(d.title)));
    const lines = String(d.deck_text||'').split(/\r?\n/).map((l:string)=>l.trim()).filter(Boolean).slice(0,3);
    for (const line of lines) { const m = line.match(/^(\d+)\s*[xX]?\s+(.+)$/); list.push(clean(m ? m[2] : line)); }
    return list;
  }).filter(Boolean));

  let topCardsByDeck = new Map<string, string[]>();
  try {
    const results = await Promise.all(decks.map(async d => {
      const { data } = await supabase
        .from('deck_cards')
        .select('name, qty')
        .eq('deck_id', d.id)
        .order('qty', { ascending: false })
        .limit(5);
      const names = Array.isArray(data) ? data.map((x:any)=>String(x.name)) : [];
      return { id: d.id, names };
    }));
    for (const r of results) topCardsByDeck.set(r.id, r.names);
    for (const arr of topCardsByDeck.values()) for (const n of arr) nameSet.add(n);
  } catch {}

  let imgMap = new Map<string, { small?: string; normal?: string; art_crop?: string }>();
  try {
    imgMap = await getImagesForNamesCached(Array.from(nameSet));
  } catch {}

  // Helper: pick first available art from precomputed imgMap and candidates (nameSet + top cards)
  function pickAnyArt(): string | undefined {
    const candidates = Array.from(nameSet);
    for (const n of candidates) {
      const img = imgMap.get(norm(n));
      if (img?.art_crop || img?.normal || img?.small) return img.art_crop || img.normal || img.small;
    }
    return undefined;
  }

  // Compute a robust bannerArt with multiple fallbacks (signature deck -> first deck -> favorite commander -> any art)
  let bannerArt: string | undefined = undefined;
  try { if (prof.signature_deck_id) bannerArt = await getDeckArt(prof.signature_deck_id); } catch {}
  if (!bannerArt && decks?.[0]?.id) { try { bannerArt = await getDeckArt(decks[0].id); } catch {} }
  if (!bannerArt && prof.favorite_commander) {
    try {
      const m = await getImagesForNamesCached([String(prof.favorite_commander)]);
      const v = m.get(norm(String(prof.favorite_commander)));
      bannerArt = v?.art_crop || v?.normal || v?.small || undefined;
    } catch {}
  }
  if (!bannerArt) {
    // Try to mirror the exact tile art logic using the first recent deck and the same imgMap order (art_crop -> normal -> small)
    try {
      const d = decks?.[0];
      if (d) {
        const clean = (s: string) => String(s||'').replace(/\s*\(.*?\)\s*$/, '').trim().toLowerCase();
        const candidates: string[] = [];
        if (d.commander) candidates.push(clean(String(d.commander)));
        if (d.title) candidates.push(clean(String(d.title)));
        const first = String(d.deck_text||'').split(/\r?\n/).find((l:string)=>!!l?.trim());
        if (first) { const m = first.match(/^(\d+)\s*[xX]?\s+(.+)$/); candidates.push(clean(m ? m[2] : first)); }
        const tops = (topCardsByDeck.get(d.id) || []).map(s=>s.toLowerCase());
        candidates.push(...tops);
        for (const c of candidates) {
          const img = imgMap.get(norm(c));
          if (img?.art_crop || img?.normal || img?.small) { bannerArt = img.art_crop || img.normal || img.small; break; }
        }
      }
    } catch {}
  }
  if (!bannerArt) bannerArt = pickAnyArt();

  // Build color pie (public decks: commander/title)
  const namePool = decks.flatMap(d => [String(d.commander||''), String(d.title||'')]).filter(Boolean);
  const pieCards = await scryfallBatch(namePool);
  const pieCounts: Record<string, number> = { W:0,U:0,B:0,R:0,G:0 };
  Object.values(pieCards).forEach((card:any) => {
    const ci: string[] = Array.isArray(card?.color_identity) ? card.color_identity : [];
    ci.forEach(c => { pieCounts[c] = (pieCounts[c]||0) + 1; });
  });

  // Build radar (aggregate over deck_cards per public deck)
  const cardsByDeck: Map<string, { name: string; qty: number }[]> = new Map();
  const radarNames = new Set<string>();
  await Promise.all(decks.map(async d => {
    try {
      const { data } = await supabase.from('deck_cards').select('name, qty').eq('deck_id', d.id).limit(200);
      const rows = Array.isArray(data) ? (data as any[]) : [];
      const arr = rows.map(x => ({ name: String(x.name), qty: Number(x.qty||1) }));
      cardsByDeck.set(d.id, arr);
      arr.forEach(r => radarNames.add(r.name));
    } catch {}
  }));
  const radarCards = await scryfallBatch(Array.from(radarNames));
  function cardInfo(n: string) { return radarCards[norm(n)] || null; }
  const radarAgg: Record<string, number> = { aggro:0, control:0, combo:0, midrange:0, stax:0 };
  for (const arr of cardsByDeck.values()) {
    const w = { aggro:0, control:0, combo:0, midrange:0, stax:0 } as Record<string, number>;
    for (const { name, qty } of arr) {
      const card = cardInfo(name);
      const type = String(card?.type_line||'');
      const text = String(card?.oracle_text||'').toLowerCase();
      const cmc = Number(card?.cmc||0);
      const q = Math.min(Math.max(qty||1,1),4);
      if (type.includes('Creature')) { w.aggro += 0.5*q; w.midrange += 0.2*q; }
      if (type.includes('Instant') || type.includes('Sorcery')) { w.control += 0.2*q; w.combo += 0.1*q; }
      if (/counter target/.test(text) || /destroy all/.test(text) || /board wipe/.test(text)) { w.control += 0.6*q; }
      if (/search your library/.test(text) || /tutor/.test(text)) { w.combo += 0.6*q; }
      if (/players can\'t|can’t|can’t cast|doesn\'t untap|skip your|skip their|each player|unless you pay|pay \{/.test(text)
         || /rule of law|winter orb|static orb|stasis|ghostly prison|sphere of resistance|archon of/.test(text)) { w.stax += 0.8*q; }
      if (cmc <= 2 && type.includes('Creature')) { w.aggro += 0.2*q; }
      if (cmc >= 5 && type.includes('Creature')) { w.midrange += 0.2*q; }
    }
    radarAgg.aggro += w.aggro; radarAgg.control += w.control; radarAgg.combo += w.combo; radarAgg.midrange += w.midrange; radarAgg.stax += w.stax;
  }

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="rounded-xl border border-neutral-800">
        <div className="relative">
          {bannerArt ? (
            <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
              <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${bannerArt})` }} />
            </div>
          ) : null}
          <div className="relative z-10 rounded-xl p-4 flex items-center gap-4">
            {/* Custom card (if present) */}
            {prof?.custom_card?.art && prof?.custom_card?.show_on_banner && (
              <div className="relative group">
                <img src={prof.custom_card.art} alt={prof.custom_card.name||'custom'} className="w-16 h-12 rounded object-cover border border-neutral-700" />
                <div className="hidden group-hover:block absolute left-0 top-full mt-2 z-50 bg-black/90 border border-neutral-700 rounded p-2 shadow-xl w-[320px]">
                  {require('react').createElement(require('@/components/ProfileCardEditor').default, { mode:'view', value: { nameParts: (String(prof.custom_card.name||'Custom Card').split(' ').slice(0,3) as any).concat(['','','']).slice(0,3) as [string,string,string], subtext: String(prof.custom_card.sub||''), artUrl: String(prof.custom_card.art||''), artist: String(prof.custom_card.artist||''), scryUri: String(prof.custom_card.scryfall||''), colorHint: (String(prof.custom_card.color||'U') as any), typeText: '—', pt: { p: 1, t: 1 }, mana: 0 } })}
                </div>
              </div>
            )}
            <img src={prof.avatar || '/next.svg'} alt="avatar" className="w-16 h-16 rounded-full object-cover bg-neutral-800" />
            <div className="flex-1 min-w-0">
              <div className="text-xl font-semibold truncate">{prof.display_name || prof.username || 'Mage'}</div>
              <div className="text-xs opacity-80">{(Array.isArray(prof.favorite_formats)? prof.favorite_formats : []).join(', ')}</div>
            </div>
            {Array.isArray(prof.badges) && prof.badges.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {prof.badges.map((b: string, i: number) => (
                  <span key={`${b}-${i}`} className="px-2 py-1 rounded bg-neutral-800 text-xs border border-neutral-700">{b}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Trends (public decks only) */}
      {(() => {
        // Build color pie (public decks: commander/title)
        const namePool = decks.flatMap(d => [String(d.commander||''), String(d.title||'')]).filter(Boolean);
        const pieCards = Object.values(namePool).length ? undefined : undefined; // placeholder to satisfy TS
        return null;
      })()}
      <section className="rounded-xl border border-neutral-800 p-4">
        <div className="text-lg font-semibold mb-2">Deck trends</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div className="flex flex-col items-center">
            <div className="text-xs opacity-80 mb-1">Color balance</div>
            {pieSvg(pieCounts)}
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-neutral-300">
              {['W','U','B','R','G'].map(k => (
                <div key={`leg-${k}`}>{k==='W'?'White':k==='U'?'Blue':k==='B'?'Black':k==='R'?'Red':'Green'}: {pieCounts[k]||0}</div>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-center">
            <div className="text-xs opacity-80 mb-1">Playstyle radar</div>
            <div className="w-full flex justify-center">{radarSvg(radarAgg)}</div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-neutral-300">
              {['Aggro','Control','Combo','Midrange','Stax'].map((t)=> (<div key={t}>{t}</div>))}
            </div>
          </div>
        </div>
        <div className="mt-2 text-[10px] text-neutral-400">Derived from public decklists: we analyze card types, keywords, and curve (creatures, instants/sorceries, tutors, wipes, stax/tax pieces).</div>
      </section>

      {/* Top commanders panel */}
      <TopCommanders userId={prof.id} />
      {Array.isArray(prof.pinned_deck_ids) && prof.pinned_deck_ids.length > 0 && (
        <PinnedDecks userId={prof.id} deckIds={prof.pinned_deck_ids} />
      )}

      {decks.length > 0 && (
        <section className="rounded-xl border border-neutral-800 p-4 space-y-2">
          <div className="text-lg font-semibold">Recent decks</div>
          <ul className="space-y-2">
            {decks.map((d) => {
              const clean = (s: string) => String(s||'').replace(/\s*\(.*?\)\s*$/, '').trim().toLowerCase();
              const candidates: string[] = [];
              if (d.commander) candidates.push(clean(String(d.commander)));
              if (d.title) candidates.push(clean(String(d.title)));
              const first = String(d.deck_text||'').split(/\r?\n/).find((l:string)=>!!l?.trim());
              if (first) { const m = first.match(/^(\d+)\s*[xX]?\s+(.+)$/); candidates.push(clean(m ? m[2] : first)); }
              const tops = (topCardsByDeck.get(d.id) || []).map(s=>s.toLowerCase());
              candidates.push(...tops);
              let art: string | undefined;
              for (const c of candidates) {
                const img = imgMap.get(norm(c));
                if (img?.art_crop || img?.normal || img?.small) { art = img.art_crop || img.normal || img.small; break; }
              }
              return (
                <li key={d.id} className="relative overflow-hidden border rounded-md hover:border-gray-600">
                  {art && (<div className="absolute inset-0 bg-cover bg-center opacity-30" style={{ backgroundImage: `url(${art})` }} />)}
                  {!art && (<div className="absolute inset-0 bg-neutral-900 skeleton-shimmer" />)}
                  <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-transparent" />
                  <div className="relative p-3 flex items-center justify-between gap-3">
                    <div className="text-base font-semibold line-clamp-1">{d.title || 'Untitled'}</div>
                    <LikeButton deckId={d.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <MostLikedDecks userId={prof.id} />

      <section className="rounded-xl border border-neutral-800 p-4 space-y-2">
        <div className="text-lg font-semibold">Favorite Commander</div>
        <div className="text-sm">{prof.favorite_commander || '—'}</div>
      </section>
    </main>
  );
}
