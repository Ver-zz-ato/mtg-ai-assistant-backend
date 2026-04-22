// app/u/[slug]/page.tsx
import { createClient } from "@/lib/supabase/server";
import { loadProfilesPublicBySlug } from "@/lib/server/publicProfile";

export const revalidate = 0;
export const dynamic = 'force-dynamic';
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
  const prof: any = await loadProfilesPublicBySlug(slug);

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

  // Build color pie from actual deck cards (not just commanders/titles)
  let pieCounts: Record<string, number> = { W:0,U:0,B:0,R:0,G:0 };
  
  // Get unique card names from ALL user decks (not just public ones) for stats
  // This ensures public profile shows full deck-building style
  let allUserDecks: any[] = [];
  try {
    const { data } = await supabase
      .from('decks')
      .select('id')
      .eq('user_id', prof.id)
      .limit(30); // Same limit as private profile
    allUserDecks = Array.isArray(data) ? data : [];
  } catch {}
  
  const uniquePieCardNames = new Set<string>();
  await Promise.all(allUserDecks.map(async d => {
    try {
      const { data } = await supabase.from('deck_cards').select('name').eq('deck_id', d.id).limit(100); // Limit per deck
      const rows = Array.isArray(data) ? (data as any[]) : [];
      rows.forEach(x => uniquePieCardNames.add(String(x.name)));
    } catch {}
  }));
  const namePool = Array.from(uniquePieCardNames).slice(0, 500); // Use actual card names
  
  // Try to use cached data first, fallback to direct API if necessary
  try {
    const { getCardDataForProfileTrends } = await import('@/lib/server/scryfallCache');
    const cardData = await getCardDataForProfileTrends(namePool);
    // Deduplicate to avoid double counting (same fix as private profile)
    const processedNames = new Set<string>();
    for (const [name, data] of cardData.entries()) {
      const normalizedName = norm(name);
      if (processedNames.has(normalizedName)) continue;
      processedNames.add(normalizedName);
      
      const ci: string[] = Array.isArray(data?.color_identity) ? data.color_identity : [];
      ci.forEach(c => { pieCounts[c] = (pieCounts[c]||0) + 1; });
    }
  } catch {
    // Fallback to direct Scryfall call if cache fails (though this may hit rate limits)
    const pieCards = await scryfallBatch(namePool);
    Object.values(pieCards).forEach((card:any) => {
      const ci: string[] = Array.isArray(card?.color_identity) ? card.color_identity : [];
      ci.forEach(c => { pieCounts[c] = (pieCounts[c]||0) + 1; });
    });
  }

  // Build radar (aggregate over deck_cards per ALL user decks, not just public)
  const cardsByDeck: Map<string, { name: string; qty: number }[]> = new Map();
  const radarNames = new Set<string>();
  await Promise.all(allUserDecks.map(async d => {
    try {
      const { data } = await supabase.from('deck_cards').select('name, qty').eq('deck_id', d.id).limit(200);
      const rows = Array.isArray(data) ? (data as any[]) : [];
      const arr = rows.map(x => ({ name: String(x.name), qty: Number(x.qty||1) }));
      cardsByDeck.set(d.id, arr);
      arr.forEach(r => radarNames.add(r.name));
    } catch {}
  }));
  // Use cached data for radar computation to avoid rate limits
  let cardInfoMap: Record<string, any> = {};
  try {
    const { getCardDataForProfileTrends } = await import('@/lib/server/scryfallCache');
    const cardData = await getCardDataForProfileTrends(Array.from(radarNames));
    for (const [key, value] of cardData.entries()) {
      cardInfoMap[key] = value;
    }
  } catch {
    // Fallback to direct Scryfall if cache fails
    const radarCards = await scryfallBatch(Array.from(radarNames));
    cardInfoMap = radarCards;
  }
  function cardInfo(n: string) { return cardInfoMap[norm(n)] || null; }
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

  const profileMonogram = (() => {
    const n = String(prof.display_name || prof.username || 'MT').trim();
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  })();

  /** Public hero: official card art only (favorite → top public commander → first deck list art). */
  const publicHeroArt = (() => {
    if (prof.favorite_commander) {
      const v = imgMap.get(norm(String(prof.favorite_commander)));
      const u = v?.art_crop || v?.normal || v?.small;
      if (u) return u;
    }
    const cmdCounts: Record<string, number> = {};
    for (const d of decks) {
      const n = String(d.commander || '').trim();
      if (n) cmdCounts[n] = (cmdCounts[n] || 0) + 1;
    }
    const topName = Object.entries(cmdCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (topName) {
      const v = imgMap.get(norm(topName));
      const u = v?.art_crop || v?.normal || v?.small;
      if (u) return u;
    }
    for (const d of decks) {
      const clean = (s: string) => String(s || '').replace(/\s*\(.*?\)\s*$/, '').trim().toLowerCase();
      const candidates: string[] = [];
      if (d.commander) candidates.push(clean(String(d.commander)));
      if (d.title) candidates.push(clean(String(d.title)));
      const first = String(d.deck_text || '')
        .split(/\r?\n/)
        .find((l: string) => !!l?.trim());
      if (first) {
        const m = first.match(/^(\d+)\s*[xX]?\s+(.+)$/);
        candidates.push(clean(m ? m[2] : first));
      }
      const tops = (topCardsByDeck.get(d.id) || []).map((s) => s.toLowerCase());
      candidates.push(...tops);
      for (const c of candidates) {
        const img = imgMap.get(norm(c));
        if (img?.art_crop || img?.normal || img?.small) {
          return img.art_crop || img.normal || img.small;
        }
      }
    }
    return undefined;
  })();

  return (
<main className="max-w-5xl mx-auto p-6">
      {/* Enhanced profile header with dramatic banner */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-purple-500/30 shadow-2xl mb-6">
        {/* Banner: safe official art + gradients (no user-uploaded media). */}
        <div className="relative h-48 sm:h-56">
          {publicHeroArt ? (
            <div
              className="absolute inset-0 bg-cover bg-center scale-105"
              style={{ backgroundImage: `url(${publicHeroArt})` }}
              aria-hidden
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-purple-900/40 via-blue-900/30 to-pink-900/40" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/45 to-black/88" />
          <div className="absolute inset-0 bg-gradient-to-r from-purple-900/35 via-transparent to-indigo-900/35" />
          <div
            className="absolute inset-0 rounded-2xl"
            style={{ background: gradient, opacity: 0.12, filter: 'blur(40px)' }}
          />
        </div>

        {/* Profile info overlay */}
        <div className="relative z-10 -mt-20 px-6 pb-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4">
            {/* Monogram: identity seal (not the main hero focal when art is present). */}
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 blur-lg opacity-50 scale-90" />
              <div
                className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-neutral-900 shadow-2xl ring-2 ring-purple-500/45 bg-gradient-to-br from-indigo-900 to-slate-900 flex items-center justify-center"
                aria-hidden
              >
                <span className="text-2xl sm:text-3xl font-black text-indigo-100 tracking-tight select-none">
                  {profileMonogram}
                </span>
              </div>
              {prof.is_pro && (
                <div className="absolute -bottom-1 -right-1 w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center border-4 border-neutral-900 shadow-lg">
                  <span className="text-lg">⭐</span>
                </div>
              )}
            </div>

            {/* User info */}
            <div className="flex-1 text-center sm:text-left min-w-0">
              <h1 className="text-3xl sm:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 mb-2">
                {prof.display_name || prof.username || 'Mage'}
              </h1>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-sm text-neutral-300 mb-2">
                {Array.isArray(prof.favorite_formats) && prof.favorite_formats.length > 0 && (
                  <>
                    {prof.favorite_formats.map((format: string) => (
                      <span key={format} className="px-3 py-1 rounded-full bg-purple-900/40 border border-purple-500/30 text-purple-300 font-medium">
                        {format}
                      </span>
                    ))}
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-neutral-400">
                {prof.deck_count > 0 && (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                    <span className="font-semibold text-neutral-200">{prof.deck_count}</span> Decks
                  </div>
                )}
                {prof.collection_count > 0 && (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                    <span className="font-semibold text-neutral-200">{prof.collection_count}</span> Collections
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-12 md:col-span-8 space-y-4">
          {prof.favorite_commander ? (() => {
            const fav = String(prof.favorite_commander);
            const favImg = imgMap.get(norm(fav));
            const favArt = favImg?.art_crop || favImg?.normal || favImg?.small || '';
            return (
              <section className="relative overflow-hidden rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-950/50 to-violet-950/35 p-5 shadow-lg">
                {favArt ? (
                  <div
                    className="absolute -right-4 -top-4 h-40 w-40 rounded-full opacity-30 blur-sm bg-cover bg-center"
                    style={{ backgroundImage: `url(${favArt})` }}
                    aria-hidden
                  />
                ) : null}
                <div className="relative z-[1]">
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-200/90 mb-1">
                    Featured commander
                  </div>
                  <div className="text-xl font-bold text-neutral-100 pr-4">{fav}</div>
                </div>
              </section>
            );
          })() : null}
          <MostLikedDecks userId={prof.id} />
          {/* Deck trends section with enhanced styling */}
          <section className="rounded-xl border-2 border-neutral-800 bg-gradient-to-br from-neutral-900/50 to-neutral-950/50 p-6 hover:border-blue-500/30 transition-colors shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              <div className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">Deck Trends</div>
            </div>
            {(() => {
              const hasColorData = Object.values(pieCounts).some(v => v > 0);
              const hasRadarData = Object.values(radarAgg).some(v => v > 0);
              const hasAnyData = hasColorData || hasRadarData;
              
              if (!hasAnyData) {
                return (
                  <div className="text-center py-8 text-sm opacity-70">
                    <div className="mb-2">📊 No public deck trends data available</div>
                    <div className="text-xs">
                      {decks.length === 0 ? (
                        'This user has no public decks.'
                      ) : (
                        'Public decks found but no analyzable data yet.'
                      )}
                    </div>
                  </div>
                );
              }
              
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  <div className="flex flex-col items-center">
                    <div className="text-xs opacity-80 mb-1">Color balance</div>
                    {hasColorData ? (
                      <>
                        {pieSvg(pieCounts)}
                        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-neutral-300">
                          {['W','U','B','R','G'].map(k => {
                            const count = pieCounts[k as keyof typeof pieCounts] || 0;
                            const total = Object.values(pieCounts).reduce((a,b)=>a+b,0) || 1;
                            const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                            const colorName = k==='W'?'White':k==='U'?'Blue':k==='B'?'Black':k==='R'?'Red':'Green';
                            return (
                              <div key={`leg-${k}`}>{colorName}: {count} ({percentage}%)</div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="text-[10px] opacity-60 text-center py-4">No color data available.<br/>Need commanders or card data.</div>
                    )}
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="text-xs opacity-80 mb-1">Playstyle radar</div>
                    {hasRadarData ? (
                      <>
                        <div className="w-full flex justify-center">{radarSvg(radarAgg)}</div>
                        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-neutral-300">
                          {['Aggro','Control','Combo','Midrange','Stax'].map((t)=> {
                            const key = t.toLowerCase() as keyof typeof radarAgg;
                            const value = radarAgg[key] || 0;
                            return (<div key={t}>{t}: {value.toFixed(1)}</div>);
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="text-[10px] opacity-60 text-center py-4">No playstyle data available.<br/>Need detailed card lists.</div>
                    )}
                  </div>
                </div>
              );
            })()}
            <div className="mt-2 text-[10px] text-neutral-400">Derived from public decklists: we analyze card types, keywords, and curve (creatures, instants/sorceries, tutors, wipes, stax/tax pieces).</div>
          </section>

          <TopCommanders userId={prof.id} />
          {Array.isArray(prof.pinned_deck_ids) && prof.pinned_deck_ids.length > 0 && (
            <PinnedDecks userId={prof.id} deckIds={prof.pinned_deck_ids} />
          )}

          {decks.length > 0 && (
            <section className="rounded-xl border-2 border-neutral-800 bg-gradient-to-br from-neutral-900/50 to-neutral-950/50 p-6 hover:border-purple-500/30 transition-colors shadow-xl">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                <div className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Recent Decks</div>
              </div>
              <ul className="space-y-3">
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
                    <li key={d.id} className="group relative overflow-hidden border-2 border-neutral-800 rounded-xl hover:border-purple-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/20 hover:scale-[1.02]">
                      {art && (<div className="absolute inset-0 bg-cover bg-center opacity-40 group-hover:opacity-60 transition-opacity duration-300" style={{ backgroundImage: `url(${art})` }} />)}
                      {!art && (<div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900" />)}
                      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
                      <div className="absolute inset-0 bg-gradient-to-t from-purple-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      <div className="relative p-4 flex items-center justify-between gap-3">
                        <a href={`/decks/${d.id}`} className="flex-1 min-w-0">
                          <div className="text-lg font-bold line-clamp-1 group-hover:text-purple-300 transition-colors">{d.title || 'Untitled'}</div>
                          {d.commander && (
                            <div className="text-xs text-neutral-400 mt-1 line-clamp-1">Commander: {d.commander}</div>
                          )}
                        </a>
                        <LikeButton deckId={d.id} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

        </section>
        <aside className="col-span-12 md:col-span-4 space-y-4">
          {Array.isArray(prof.pinned_badges) && prof.pinned_badges.length > 0 && (
            <section className="rounded-xl border-2 border-neutral-800 bg-gradient-to-br from-neutral-900/50 to-neutral-950/50 p-4 hover:border-amber-500/30 transition-colors shadow-xl">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                <div className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">Achievements</div>
              </div>
              <div className="space-y-3">
                {prof.pinned_badges.slice(0,3).map((b: string, i: number) => {
                  // Badge descriptions mapping
                  const badgeDescriptions: Record<string, {emoji: string, desc: string, color: string}> = {
                    'First Deck': {emoji: '🏆', desc: 'Created your first deck', color: 'from-blue-500/20 to-blue-600/10'},
                    'Brewer I': {emoji: '⚗️', desc: 'Built 5+ decks', color: 'from-purple-500/20 to-purple-600/10'},
                    'Brewer II': {emoji: '⚗️', desc: 'Built 15+ decks', color: 'from-purple-500/20 to-purple-600/10'},
                    'Brewer III': {emoji: '⚗️', desc: 'Built 30+ decks', color: 'from-purple-500/20 to-purple-600/10'},
                    'Curator I': {emoji: '📚', desc: 'Maintain 3+ collections', color: 'from-emerald-500/20 to-emerald-600/10'},
                    'Curator II': {emoji: '📚', desc: 'Maintain 10+ collections', color: 'from-emerald-500/20 to-emerald-600/10'},
                    'Curator III': {emoji: '📚', desc: 'Maintain 25+ collections', color: 'from-emerald-500/20 to-emerald-600/10'},
                    'Chatterbox': {emoji: '💬', desc: '50+ messages in 30d', color: 'from-pink-500/20 to-pink-600/10'},
                    'Mathlete': {emoji: '∑', desc: 'Run Probability tool 10 times', color: 'from-cyan-500/20 to-cyan-600/10'},
                    'Scenario Collector': {emoji: '💾', desc: 'Save 5 probability scenarios', color: 'from-indigo-500/20 to-indigo-600/10'},
                    'Mulligan Master': {emoji: '♻️', desc: 'Run 25k+ mulligan iterations', color: 'from-green-500/20 to-green-600/10'},
                    'On-Curve 90': {emoji: '📈', desc: '≥90% to hit land drops T1–T4', color: 'from-amber-500/20 to-amber-600/10'},
                    'Mana Maestro': {emoji: '💧', desc: 'High color odds by T3', color: 'from-sky-500/20 to-sky-600/10'},
                    'Combomancer': {emoji: '✨', desc: 'Includes at least one detected combo', color: 'from-violet-500/20 to-violet-600/10'},
                    'Apprentice Teacher': {emoji: '🥇', desc: '10 likes on a deck', color: 'from-yellow-500/20 to-yellow-600/10'},
                    'Master Teacher': {emoji: '🎖️', desc: '25 likes on a deck', color: 'from-orange-500/20 to-orange-600/10'}
                  };
                  const badge = badgeDescriptions[b] || {emoji: '🏆', desc: 'Achievement unlocked', color: 'from-neutral-700/20 to-neutral-800/10'};
                  return (
                    <div key={`badge-${b}-${i}`} className={`group relative overflow-hidden rounded-xl bg-gradient-to-br ${badge.color} border-2 border-neutral-700 p-4 hover:border-amber-400/50 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-amber-500/20`}>
                      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="relative flex items-start gap-3">
                        <span className="text-2xl">{badge.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm text-neutral-100 mb-0.5">{b}</div>
                          <div className="text-xs text-neutral-400">{badge.desc}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
