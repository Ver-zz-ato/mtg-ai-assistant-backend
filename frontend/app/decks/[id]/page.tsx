// app/decks/[id]/page.tsx
import { createClient } from "@/lib/supabase/server";
import ExportDeckCSV from "@/components/ExportDeckCSV";
import CopyDecklistButton from "@/components/CopyDecklistButton";
import LikeButton from "@/components/likes/LikeButton";
import DeckComments from "@/components/DeckComments";
import ExportToMoxfield from "@/components/ExportToMoxfield";
import ExportToTCGPlayer from "@/components/ExportToTCGPlayer";
import CloneDeckButton from "@/components/CloneDeckButton";

type Params = { id: string };
export const revalidate = 120; // short ISR window for public decks

export default async function Page({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const supabase = await createClient();
  
  // Check if user is authenticated (for showing deck ID)
  const { data: { user } } = await supabase.auth.getUser();

  function norm(name: string): string {
    return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  }

  async function scryfallBatch(names: string[]) {
    const uniqueNames = Array.from(new Set(names.filter(Boolean))).slice(0, 300);
    const out: Record<string, any> = {};
    if (!uniqueNames.length) return out;
    
    // First, check local cache
    try {
      const normalizedNames = uniqueNames.map(n => norm(n));
      const { data: cached } = await supabase
        .from('scryfall_cache')
        .select('name, type_line, oracle_text, small, normal, art_crop, cmc, color_identity, mana_cost')
        .in('name', normalizedNames);
      
      if (cached && cached.length > 0) {
        for (const c of cached) {
          out[c.name] = c;
        }
      }
    } catch (e) {
      console.error('Cache read failed:', e);
    }
    
    // Find missing cards that aren't in cache
    const missingNames = uniqueNames.filter(n => !out[norm(n)]);
    if (missingNames.length === 0) return out;
    
    // Fetch missing cards from Scryfall API
    try {
      const identifiers = missingNames.map((n) => ({ name: n }));
      const r = await fetch('https://api.scryfall.com/cards/collection', { 
        method:'POST', 
        headers:{'content-type':'application/json'}, 
        body: JSON.stringify({ identifiers }),
        next: { revalidate: 0 }
      });
      
      if (!r.ok) {
        console.error('Scryfall API error:', r.status);
        return out;
      }
      
      const j:any = await r.json().catch(()=>({}));
      const rows:any[] = Array.isArray(j?.data) ? j.data : [];
      
      for (const c of rows) {
        const normalized = norm(c?.name||'');
        out[normalized] = {
          name: normalized,
          type_line: c?.type_line || null,
          oracle_text: c?.oracle_text || (c?.card_faces?.[0]?.oracle_text || null),
          cmc: c?.cmc || c?.mana_value || null,
          color_identity: c?.color_identity || [],
          mana_cost: c?.mana_cost || (c?.card_faces?.[0]?.mana_cost || null),
          small: (c?.image_uris || c?.card_faces?.[0]?.image_uris || {}).small || null,
          normal: (c?.image_uris || c?.card_faces?.[0]?.image_uris || {}).normal || null,
          art_crop: (c?.image_uris || c?.card_faces?.[0]?.image_uris || {}).art_crop || null,
        };
      }
      
      // Cache the new data
      try {
        const up = rows.map((c:any)=>{
          const img = c?.image_uris || c?.card_faces?.[0]?.image_uris || {};
          return {
            name: norm(c?.name||''),
            small: img.small || null,
            normal: img.normal || null,
            art_crop: img.art_crop || null,
            type_line: c?.type_line || null,
            oracle_text: c?.oracle_text || (c?.card_faces?.[0]?.oracle_text || null),
            cmc: c?.cmc || c?.mana_value || null,
            color_identity: c?.color_identity || [],
            mana_cost: c?.mana_cost || (c?.card_faces?.[0]?.mana_cost || null),
            updated_at: new Date().toISOString(),
          };
        });
        if (up.length) await supabase.from('scryfall_cache').upsert(up, { onConflict: 'name' });
      } catch (e) {
        console.error('Cache write failed:', e);
      }
    } catch (e) {
      console.error('Scryfall fetch failed:', e);
    }
    
    return out;
  }

  // Fetch deck meta (public visibility enforced by RLS)
  const { data: deckRow } = await supabase.from("decks").select("title, is_public, meta, commander, format, user_id").eq("id", id).maybeSingle();
  const title = deckRow?.title ?? "Deck";
  const format = String(deckRow?.format || "Commander");
  const archeMeta: any = (deckRow as any)?.meta?.archetype || null;
  const isOwner = user?.id && (deckRow as any)?.user_id === user.id;

  // Fetch cards
    const { data: cards } = await supabase
    .from("deck_cards")
    .select("name, qty")
    .eq("deck_id", id)
    .order("name", { ascending: true });

  // Snapshot prices for per-card "each" (USD default)
  const names = Array.from(new Set(((cards||[]) as any[]).map(c=>String(c.name))));
  let priceMap = new Map<string, number>();
  try {
    if (names.length) {
      const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/price/snapshot`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ names, currency:'USD' }) });
      const j:any = await r.json().catch(()=>({}));
      if (r.ok && j?.ok) {
        const obj = j.prices || {};
        Object.entries(obj).forEach(([k,v]:any)=>{ priceMap.set(String(k).toLowerCase(), Number(v)); });
      }
    }
  } catch {}

  // Compute pie from all deck cards (count how many cards contain each color)
  const allCardNames = Array.from(new Set((cards||[]).map(c=>String(c.name))));
  const allCardsForPie = allCardNames.length ? await scryfallBatch(allCardNames) : {};
  const pieCounts: Record<string, number> = { W:0,U:0,B:0,R:0,G:0 };
  Object.values(allCardsForPie).forEach((card:any) => {
    const ci: string[] = Array.isArray(card?.color_identity) ? card.color_identity : [];
    ci.forEach(c => { pieCounts[c] = (pieCounts[c]||0) + 1; });
  });

  // Compute radar from deck_cards (use meta if present, else compute now)
  let arche = archeMeta as Record<string, number> | null;
  let detailsForRadar: Record<string, any> | null = null;
  if (!arche) {
    const names = Array.from(new Set((cards||[]).map(c=>String(c.name))));
    const details = await scryfallBatch(names);
    detailsForRadar = details;
    const w = { aggro:0, control:0, combo:0, midrange:0, stax:0 } as Record<string, number>;
    for (const { name, qty } of (cards||[])) {
      const card = details[norm(name)];
      const type = String(card?.type_line||'');
      const text = String(card?.oracle_text||'').toLowerCase();
      const cmc = Number(card?.cmc||0);
      const q = Math.min(Math.max(Number(qty||1),1),4);
      if (type.includes('Creature')) { w.aggro += 0.5*q; w.midrange += 0.2*q; }
      if (type.includes('Instant') || type.includes('Sorcery')) { w.control += 0.2*q; w.combo += 0.1*q; }
      if (/counter target/.test(text) || /destroy all/.test(text) || /board wipe/.test(text)) { w.control += 0.6*q; }
      if (/search your library/.test(text) || /tutor/.test(text)) { w.combo += 0.6*q; }
      if (/players can\'t|can’t|can’t cast|doesn\'t untap|skip your|skip their|each player|unless you pay|pay \{/.test(text) || /rule of law|winter orb|static orb|stasis|ghostly prison|sphere of resistance|archon of/.test(text)) { w.stax += 0.8*q; }
      if (cmc <= 2 && type.includes('Creature')) { w.aggro += 0.2*q; }
      if (cmc >= 5 && type.includes('Creature')) { w.midrange += 0.2*q; }
    }
    arche = w;
  }
  
  const hasPie = Object.values(pieCounts).some((n)=>n>0);

  // Derive details for deck cards (for curve/types/core)
  const cardNames = Array.from(new Set((cards||[]).map(c=>String(c.name))));
  const detailsAll: Record<string, any> = detailsForRadar || (cardNames.length ? await scryfallBatch(cardNames) : {});

  // Mana value helper
  function toManaValue(card:any): number {
    try {
      if (Number.isFinite(card?.mana_value)) return Number(card.mana_value);
      if (Number.isFinite(card?.cmc)) return Number(card.cmc);
      const f0:any = Array.isArray(card?.card_faces) ? card.card_faces[0] : null;
      if (Number.isFinite(f0?.mana_value)) return Number(f0.mana_value);
      if (Number.isFinite(f0?.cmc)) return Number(f0.cmc);
      const cost = String(f0?.mana_cost || card?.mana_cost || '');
      const m = cost.match(/\{[^}]+\}/g) || [];
      let total = 0; for (const sym of m){ const t=sym.slice(1,-1); if(/^\d+$/.test(t)) total+=parseInt(t,10); else if(t==='X') total+=0; else total+=1; }
      return total;
    } catch { return 0; }
  }
  // Curve buckets
  const curve: Record<string, number> = { '1':0,'2':0,'3':0,'4':0,'5':0,'6':0,'7+':0 };
  for (const { name, qty } of (cards||[])){
    const d = detailsAll[norm(name)] || {};
    const mv = Math.max(0, Math.round(Number(toManaValue(d)||0)));
    const bucket = mv>=7? '7+' : String(Math.max(1, Math.min(6, mv)));
    curve[bucket] = (curve[bucket]||0) + Math.max(1, Number(qty)||1);
  }
  // Type distribution
  const types: Record<string, number> = { Creature:0, Instant:0, Sorcery:0, Artifact:0, Enchantment:0, Planeswalker:0, Land:0 };
  for (const { name, qty } of (cards||[])){
    const d = detailsAll[norm(name)] || {};
    const tl = String(d?.type_line||'');
    const q = Math.max(1, Number(qty)||1);
    (Object.keys(types) as Array<keyof typeof types>).forEach(k => { if (tl.includes(k)) types[k] += q; });
  }
  // Core needs heuristic
  const core = { lands:0, ramp:0, draw:0, removal:0 } as Record<string, number>;
  for (const { name, qty } of (cards||[])){
    const d = detailsAll[norm(name)] || {};
    const tl = String(d?.type_line||'');
    const text = String(d?.oracle_text||'').toLowerCase();
    const q = Math.max(1, Number(qty)||1);
    if (tl.includes('Land')) core.lands += q;
    if (/add \{[wubrgc]/i.test(text) || /search your library.*land/i.test(text) || /rampant growth|cultivate|kodama's reach|signet|talisman|sol ring/i.test(text)) core.ramp += q;
    if (/draw .* card|investigate|impulse|cantrip|scry \d+/i.test(text)) core.draw += q;
    if (/destroy target|exile target|counter target|fight target|deal .* damage to any target/i.test(text)) core.removal += q;
  }

  function pieSvg(counts: Record<string, number>) {
    const total = Object.values(counts).reduce((a,b)=>a+b,0) || 1;
    let start = -Math.PI/2; const R=50, CX=60, CY=60;
    const colors: Record<string,string> = { W:'#f3f4f6', U:'#60a5fa', B:'#52525b', R:'#f87171', G:'#34d399' };
    const segs: any[] = [];
    (['W','U','B','R','G'] as const).forEach((k) => {
      const frac = (counts[k]||0)/total; const end = start + 2*Math.PI*frac;
      const x1 = CX + R*Math.cos(start), y1 = CY + R*Math.sin(start);
      const x2 = CX + R*Math.cos(end), y2 = CY + R*Math.sin(end);
      const large = (end-start) > Math.PI ? 1 : 0;
      const d = `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;
      segs.push(<path key={k} d={d} fill={colors[k]} stroke="#18181b" strokeWidth="1.5"/>);
      start = end;
    });
    return <svg viewBox="0 0 120 120" className="w-full max-w-[200px] h-auto drop-shadow-lg">{segs}</svg>;
  }

  function radarSvg(r: Record<string, number>) {
    const keys = ['aggro','control','combo','midrange','stax'] as const;
    const max = Math.max(1, ...keys.map(k=>r[k]||0));
    const R = 50, CX=70, CY=70; const pts: string[] = [];
    keys.forEach((k,i)=>{ const ang=-Math.PI/2+i*(2*Math.PI/keys.length); const val=((r[k]||0)/max)*R; const x=CX+val*Math.cos(ang); const y=CY+val*Math.sin(ang); pts.push(`${x},${y}`); });
    const axes = keys.map((k,i)=>{ const ang=-Math.PI/2+i*(2*Math.PI/keys.length); const x=CX+R*Math.cos(ang), y=CY+R*Math.sin(ang); return <line key={k} x1={CX} y1={CY} x2={x} y2={y} stroke="#404040" strokeWidth="1"/>; });
    const labels = keys.map((k,i)=>{ const ang=-Math.PI/2+i*(2*Math.PI/keys.length); const x=CX+(R+14)*Math.cos(ang), y=CY+(R+14)*Math.sin(ang); return <text key={`lbl-${k}`} x={x} y={y} fontSize="10" fontWeight="600" textAnchor="middle" fill="#a1a1aa">{k}</text>; });
    const circles = [0.33, 0.66, 1].map((f,i) => (
      <circle key={`ring-${i}`} cx={CX} cy={CY} r={R*f} fill="none" stroke="#262626" strokeWidth="0.5" opacity="0.4" />
    ));
    return (
      <svg viewBox="0 0 180 180" className="w-full max-w-[200px] h-auto drop-shadow-lg">
        <g transform="translate(10,10)">
          {circles}
          {axes}
          <polygon points={pts.join(' ')} fill="rgba(56,189,248,0.4)" stroke="#22d3ee" strokeWidth="2" />
          {labels}
        </g>
      </svg>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="grid grid-cols-12 gap-6">
        {/* Left sidebar - analysis stats */}
        <aside className="col-span-12 lg:col-span-3 space-y-4">
          <div className="rounded-xl border border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950 p-5 shadow-lg">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-1 w-1 rounded-full bg-cyan-400 animate-pulse shadow-lg shadow-cyan-400/50"></div>
              <h2 className="text-base font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                Deck Analysis
              </h2>
            </div>
            <div className="flex flex-col items-center gap-6">
              <div className="flex flex-col items-center w-full p-4 bg-neutral-800/30 rounded-lg border border-neutral-700/50">
                <div className="text-xs font-semibold text-cyan-400 mb-2 flex items-center gap-1">
                  <span>⚪</span>
                  <span title="Derived from commander and title; falls back to deck cards">Color Identity</span>
                </div>
                {hasPie ? (
                  <>
                    {pieSvg(pieCounts)}
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-neutral-200">
                      {['W','U','B','R','G'].map(k => (
                        <div key={`leg-${k}`} className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${k==='W'?'bg-gray-200':k==='U'?'bg-blue-400':k==='B'?'bg-gray-600':k==='R'?'bg-red-500':'bg-green-500'}`}></div>
                          <span className="font-medium">{k==='W'?'White':k==='U'?'Blue':k==='B'?'Black':k==='R'?'Red':'Green'}: {pieCounts[k]||0}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-xs opacity-60 text-center py-4">Not enough data to calculate.</div>
                )}
              </div>
              <div className="flex flex-col items-center w-full p-4 bg-neutral-800/30 rounded-lg border border-neutral-700/50">
                <div className="text-xs font-semibold text-purple-400 mb-2 flex items-center gap-1">
                  <span>📊</span>
                  <span title="Heuristic based on types/keywords/curve">Playstyle Profile</span>
                </div>
                {Object.values(arche||{}).some(v=>Number(v)>0) ? (
                  <>
                    {radarSvg(arche || { aggro:0, control:0, combo:0, midrange:0, stax:0 })}
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-neutral-200">
                      {['Aggro','Control','Combo','Midrange','Stax'].map((t)=> (
                        <div key={t} className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400"></div>
                          <span className="font-medium">{t}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-xs opacity-60 text-center py-4">Not enough data to calculate.</div>
                )}
              </div>
              <div className="text-xs text-neutral-400 text-center px-2 py-2 bg-neutral-800/20 rounded border border-neutral-700/30">
                💡 <strong>How we analyze:</strong> We examine card types, keywords, mana curve, tutors, board wipes, and tax effects to determine your deck&apos;s strategy.
              </div>
            </div>
          </div>
          {/* Mana curve */}
          <div className="rounded-xl border border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950 p-5 shadow-lg">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50"></div>
              <h2 className="text-base font-bold bg-gradient-to-r from-emerald-400 to-green-500 bg-clip-text text-transparent">
                Mana Curve
              </h2>
            </div>
            <div className="grid grid-cols-7 gap-2 items-end h-32 px-2">
              {(['1','2','3','4','5','6','7+'] as const).map(k => {
                const max = Math.max(1, ...(['1','2','3','4','5','6','7+'] as const).map(x=>curve[x]||0));
                const h = Math.round(((curve[k]||0)/max)*100);
                return (
                  <div key={`curve-${k}`} className="flex flex-col items-center gap-2 h-full justify-end group">
                    <div className="relative w-full bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-sm transition-all group-hover:from-emerald-500 group-hover:to-emerald-300" style={{ height: `${Math.max(10,h)}%` }}>
                      <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-semibold tabular-nums text-emerald-300">{curve[k]||0}</span>
                    </div>
                    <div className="text-xs font-medium text-neutral-300">{k}</div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 text-xs text-neutral-400 text-center px-2 py-2 bg-neutral-800/20 rounded border border-neutral-700/30">
              📈 Shows how many cards at each mana value
            </div>
          </div>
        </aside>

        {/* Main content */}
        <section className="col-span-12 lg:col-span-6">
          <header className="mb-6 p-6 rounded-xl border border-neutral-700 bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-950 shadow-lg">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">{title}</h1>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30">
                    {format}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {['Aggro','Control','Combo','Midrange','Stax'].map((t)=> (
                    <span 
                      key={`arch-${t}`} 
                      title={`Signals: ${t==='Aggro'?'creatures, low CMC attackers':' '}${t==='Control'?'counter/board wipes, instants/sorceries':''}${t==='Combo'?'tutors, search your library':''}${t==='Midrange'?'creatures at 5+ cmc':''}${t==='Stax'?'tax/lock pieces like Rule of Law, Winter Orb':''}`.trim()} 
                      className="px-3 py-1.5 rounded-lg border border-neutral-600 bg-neutral-800/60 hover:bg-neutral-700/60 transition-colors text-xs font-medium text-neutral-200 cursor-help"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                {/* Only show Deck ID for deck owner */}
                {isOwner && (
                  <p className="text-xs text-neutral-500 mt-2">Deck ID: {id}</p>
                )}
              </div>
            </div>
            
            {/* Action buttons */}
            <div className="mt-4 flex flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <LikeButton deckId={id} />
              </div>
              <div className="flex flex-wrap gap-2">
                <CloneDeckButton deckId={id} />
                <CopyDecklistButton 
                  deckId={id} 
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white text-sm font-medium transition-all shadow-md hover:shadow-lg border border-blue-500/50 disabled:opacity-50"
                />
                <ExportDeckCSV 
                  deckId={id} 
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-500 hover:to-teal-600 text-white text-sm font-medium transition-all shadow-md hover:shadow-lg border border-teal-500/50 disabled:opacity-50"
                />
                <ExportToMoxfield deckId={id} />
                <ExportToTCGPlayer deckId={id} />
              </div>
            </div>
          </header>

          <div className="rounded-xl border border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950 p-6 shadow-lg">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-1 w-1 rounded-full bg-violet-400 animate-pulse shadow-lg shadow-violet-400/50"></div>
              <h2 className="text-base font-bold bg-gradient-to-r from-violet-400 to-purple-500 bg-clip-text text-transparent">
                Decklist ({(cards || []).length} cards)
              </h2>
            </div>
            {(cards || []).length === 0 ? (
              <div className="text-sm text-neutral-400 text-center py-8">No cards yet.</div>
            ) : (
              <div className="max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                <ul className="space-y-2">
                  {(cards || []).map((c) => {
                    const unit = priceMap.get(String(c.name).toLowerCase());
                    const each = typeof unit === 'number' && unit>0 ? `$${unit.toFixed(2)}` : '';
                    return (
                      <li key={c.name} className="flex items-center gap-3 p-2.5 rounded-lg bg-neutral-800/40 hover:bg-neutral-800/70 transition-colors border border-neutral-700/50 hover:border-neutral-600/70 group">
                        <span className="w-10 text-center tabular-nums font-semibold text-emerald-400 bg-neutral-900/50 px-2 py-1 rounded">{c.qty}×</span>
                        <span className="flex-1 font-medium text-neutral-100">{c.name}</span>
                        {each && (
                          <span className="text-xs font-mono text-green-400 bg-green-950/40 px-2 py-1 rounded border border-green-900/50">
                            {each}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
          
          {/* Comments Section */}
          <div className="mt-8">
            <DeckComments 
              deckId={id} 
              isPublic={deckRow?.is_public === true} 
              deckOwnerId={deckRow?.user_id as string}
            />
          </div>
        </section>

        {/* Right sidebar - deck fundamentals */}
        <aside className="col-span-12 lg:col-span-3 space-y-4">
          {/* Types */}
          <div className="rounded-xl border border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950 p-5 shadow-lg">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-1 w-1 rounded-full bg-sky-400 animate-pulse shadow-lg shadow-sky-400/50"></div>
              <h2 className="text-base font-bold bg-gradient-to-r from-sky-400 to-blue-500 bg-clip-text text-transparent">
                Card Types
              </h2>
            </div>
            <div className="space-y-3 text-xs">
              {(Object.keys(types) as Array<keyof typeof types>).map((k) => {
                const total = Object.values(types).reduce((a,b)=>a+b,0) || 1;
                const pct = Math.round(((types[k]||0)/total)*100);
                return (
                  <div key={`type-${k}`} className="group">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-neutral-200">{k}</span>
                      <span className="font-mono font-semibold text-sky-400">{pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-neutral-800 overflow-hidden shadow-inner">
                      <div className="h-2 bg-gradient-to-r from-sky-500 to-blue-500 transition-all group-hover:from-sky-400 group-hover:to-blue-400" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 text-xs text-neutral-400 text-center px-2 py-2 bg-neutral-800/20 rounded border border-neutral-700/30">
              🃏 Breakdown of card types in your deck
            </div>
          </div>

          {/* Core needs */}
          <div className="rounded-xl border border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950 p-5 shadow-lg">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-1 w-1 rounded-full bg-amber-400 animate-pulse shadow-lg shadow-amber-400/50"></div>
              <h2 className="text-base font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
                Deck Fundamentals
              </h2>
            </div>
            <div className="space-y-3 text-xs">
              {([['Lands','lands',34,38],['Ramp','ramp',8,8],['Draw','draw',8,8],['Removal','removal',5,5]] as const).map(([label,key,minT,maxT])=>{
                const v = (core as any)[key] || 0; const target = maxT; const pct = Math.max(0, Math.min(100, Math.round((v/target)*100)));
                const ok = v>=minT && v<=maxT; const color = ok? 'from-emerald-500 to-green-500' : (v<minT? 'from-amber-500 to-orange-500':'from-red-500 to-rose-500');
                const icon = label==='Lands'?'🏔️':label==='Ramp'?'⚡':label==='Draw'?'📚':'💥';
                return (
                  <div key={String(key)} className="group">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-neutral-200 flex items-center gap-1.5">
                        <span>{icon}</span>
                        <span>{label}</span>
                      </span>
                      <span className="font-mono font-semibold text-amber-400">{v}/{maxT}</span>
                    </div>
                    <div className="h-2 rounded-full bg-neutral-800 overflow-hidden shadow-inner">
                      <div className={`h-2 bg-gradient-to-r ${color} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-xs opacity-70 mt-0.5 text-neutral-400">
                      {ok ? '✓ Good' : v<minT ? '⚠️ Need more' : '⚠️ Too many'} • Target: {minT===maxT? `${maxT}`:`${minT}–${maxT}`}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 text-xs text-neutral-400 text-center px-2 py-2 bg-neutral-800/20 rounded border border-neutral-700/30">
              🎯 Essential cards every deck needs
            </div>
          </div>

          {/* Pricing mini */}
          <div className="rounded-xl border border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950 p-5 shadow-lg">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-1 w-1 rounded-full bg-green-400 animate-pulse shadow-lg shadow-green-400/50"></div>
              <h2 className="text-base font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
                Deck Value
              </h2>
            </div>
            {(() => { const PriceMini = require('@/components/DeckPriceMini').default; return <PriceMini deckId={id} />; })()}
          </div>
        </aside>
      </div>
    </main>
  );
}
