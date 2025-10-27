// app/my-decks/[id]/page.tsx
import { createClient } from "@/lib/supabase/server";
import Client from "./Client";
import ExportDeckCSV from "@/components/ExportDeckCSV";
import CopyDecklistButton from "@/components/CopyDecklistButton";
import DeckCsvUpload from "@/components/DeckCsvUpload";
import RecomputeButton from "./RecomputeButton";
import InlineDeckTitle from "@/components/InlineDeckTitle";
import DeckPublicToggle from "@/components/DeckPublicToggle";
import FunctionsPanel from "./FunctionsPanel";
import NextDynamic from "next/dynamic";
import DeckProbabilityPanel from "./DeckProbabilityPanel";
import HandTestingWidget from "@/components/HandTestingWidget";
import Link from "next/link";

type Params = { id: string };
type Search = { r?: string };

export const dynamic = "force-dynamic";

function norm(name: string): string {
  return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

export default async function Page({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search & { i?: string }> }) {
  const { id } = await params;
  const { r, i } = await searchParams;
  const supabase = await createClient();
  const { data: ures } = await supabase.auth.getUser();
  const isPro = Boolean((ures?.user as any)?.user_metadata?.pro);
  const { data: deck } = await supabase.from("decks").select("title, is_public, commander, title").eq("id", id).maybeSingle();
  const title = deck?.title || "Untitled Deck";

  // Fetch cards
  const { data: cards } = await supabase.from("deck_cards").select("name, qty").eq("deck_id", id).limit(400);
  const arr = Array.isArray(cards) ? (cards as any[]).map(x=>({ name:String(x.name), qty:Number(x.qty||1) })) : [];

  // Use cached Scryfall data via our cache system instead of live API
  async function scryfallBatch(names: string[]) {
    const uniqueNames = Array.from(new Set(names.filter(Boolean))).slice(0, 400);
    const out: Record<string, any> = {};
    if (!uniqueNames.length) return out;
    
    try {
      // Use the cached getCardDataForProfileTrends function
      const { getCardDataForProfileTrends } = await import('@/lib/server/scryfallCache');
      const cardData = await getCardDataForProfileTrends(uniqueNames);
      
      // Convert to expected format (keyed by normalized name)
      for (const [normalizedKey, value] of cardData.entries()) {
        out[normalizedKey] = {
          name: normalizedKey, // This will be the normalized name
          type_line: value.type_line,
          oracle_text: value.oracle_text,
          color_identity: value.color_identity,
          cmc: value.cmc,
          mana_cost: value.mana_cost
        };
      }
    } catch (error) {
      console.warn('Failed to load cached card data:', error);
    }
    return out;
  }

  // Build details from deck cards (for both pie and radar)
  const details = await scryfallBatch(arr.map(a=>a.name));
  // Pie from actual deck composition - count each CARD once per color identity
  const pieCounts: Record<string, number> = { W:0,U:0,B:0,R:0,G:0 };
  for (const { name, qty } of arr) {
    const d = details[norm(name)];
    const ci: string[] = Array.isArray(d?.color_identity) ? d.color_identity : [];
    const q = Math.max(1, Number(qty)||1);
    // Each card contributes its full quantity to each of its colors
    // This means multicolored cards will be counted multiple times
    // which is correct for showing color distribution in the deck
    for (const c of ci) {
      if (pieCounts.hasOwnProperty(c)) {
        pieCounts[c] = (pieCounts[c]||0) + q;
      }
    }
  }

  // Radar
  const radar = { aggro:0, control:0, combo:0, midrange:0, stax:0 } as Record<string, number>;
  const totalCards = arr.reduce((s,a)=>s + (Number(a.qty)||0), 0);
  for (const { name, qty } of arr) {
    const card = details[norm(name)];
    const type = String(card?.type_line||'');
    const text = String(card?.oracle_text||'').toLowerCase();
    const cmc = Number(card?.cmc||0);
    const q = Math.min(Math.max(Number(qty||1),1),4);
    if (type.includes('Creature')) { radar.aggro += 0.5*q; radar.midrange += 0.2*q; }
    if (type.includes('Instant') || type.includes('Sorcery')) { radar.control += 0.2*q; radar.combo += 0.1*q; }
    if (/counter target/.test(text) || /destroy all/.test(text) || /board wipe/.test(text)) { radar.control += 0.6*q; }
    if (/search your library/.test(text) || /tutor/.test(text)) { radar.combo += 0.6*q; }
    if (/players can\'t|can’t|can’t cast|doesn\'t untap|skip your|skip their|each player|unless you pay|pay \{/.test(text) || /rule of law|winter orb|static orb|stasis|ghostly prison|sphere of resistance|archon of/.test(text)) { radar.stax += 0.8*q; }
    if (cmc <= 2 && type.includes('Creature')) { radar.aggro += 0.2*q; }
    if (cmc >= 5 && type.includes('Creature')) { radar.midrange += 0.2*q; }
  }

  // Ensure color pie has a robust fallback using deck card details
  let hasPie = Object.values(pieCounts).some(n=>n>0);
  if (!hasPie) {
    Object.values(details).forEach((card:any)=>{
      const ci: string[] = Array.isArray(card?.color_identity) ? card.color_identity : [];
      ci.forEach(c => { pieCounts[c] = (pieCounts[c]||0) + 1; });
    });
  }
  hasPie = Object.values(pieCounts).some(n=>n>0);

  // Mana curve (1–7+)
  function toManaValue(card:any): number {
    try {
      // Prefer modern field
      if (Number.isFinite(card?.mana_value)) return Number(card.mana_value);
      if (Number.isFinite(card?.cmc)) return Number(card.cmc);
      if (Array.isArray(card?.card_faces)) {
        const f0:any = card.card_faces?.[0] || {};
        if (Number.isFinite(f0?.mana_value)) return Number(f0.mana_value);
        if (Number.isFinite(f0?.cmc)) return Number(f0.cmc);
        if (typeof f0?.mana_cost === 'string' && f0.mana_cost) {
          return parseManaCost(f0.mana_cost);
        }
      }
      const cost = String(card?.mana_cost || '');
      return parseManaCost(cost);
    } catch { return 0; }
  }
  function parseManaCost(cost: string): number {
    const m = cost.match(/\{[^}]+\}/g) || [];
    let total = 0;
    for (const sym of m) {
      const t = sym.slice(1, -1); // strip {}
      if (/^\d+$/.test(t)) total += parseInt(t, 10);
      else if (t === 'X') total += 0; // treat X as 0 for curve
      else total += 1; // colored/hybrid/phyrexian as 1 pip
    }
    return total;
  }
  const curve: Record<string, number> = { '1':0,'2':0,'3':0,'4':0,'5':0,'6':0,'7+':0 };
  const debugSamples: Array<{ name:string; mv:number }> = []; // retained (unused) for future diagnostics
  for (const { name, qty } of arr) {
    const d = details[norm(name)] || {};
    const mvRaw = toManaValue(d);
    const mv = Number.isFinite(mvRaw) ? Math.max(0, Math.round(Number(mvRaw))) : 0;
    if (debugSamples.length < 12) debugSamples.push({ name, mv });
    const bucket = mv>=7? '7+' : String(Math.max(0, Math.min(6, Math.max(0, mv)))) as any;
    const key = bucket === '0' ? '1' : bucket; // Shift 0 MV to 1 bucket in UI
    curve[key] = (curve[key]||0) + Math.max(1, Number(qty)||1);
  }

  // Type distribution
  const types: Record<string, number> = { Creature:0, Instant:0, Sorcery:0, Artifact:0, Enchantment:0, Planeswalker:0, Land:0 };
  for (const { name, qty } of arr) {
    const d = details[norm(name)];
    const tl = String(d?.type_line||'');
    const q = Math.max(1, Number(qty)||1);
    (Object.keys(types) as Array<keyof typeof types>).forEach(k => { if (tl.includes(k)) types[k] += q; });
  }

  // Core meters: lands/ramp/draw/removal heuristic counts
  const core = { lands:0, ramp:0, draw:0, removal:0 } as Record<string, number>;
  for (const { name, qty } of arr) {
    const d = details[norm(name)];
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
    let start = -Math.PI/2; const R=42, CX=50, CY=50; const colors: Record<string,string> = { W:'#e5e7eb', U:'#60a5fa', B:'#64748b', R:'#f87171', G:'#34d399' };
    const segs: any[] = [];
    (['W','U','B','R','G'] as const).forEach((k)=>{ const frac=(counts[k]||0)/total; const end=start+2*Math.PI*frac; const x1=CX+R*Math.cos(start), y1=CY+R*Math.sin(start); const x2=CX+R*Math.cos(end), y2=CY+R*Math.sin(end); const large=(end-start)>Math.PI?1:0; const d=`M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`; segs.push(<path key={k} d={d} fill={colors[k]} stroke="#111" strokeWidth="0.5"/>); start=end; });
    return <svg viewBox="0 0 120 120" className="w-full max-w-[240px] h-auto">{segs}</svg>;
  }

  function radarSvg(r: Record<string, number>) {
    const keys=['aggro','control','combo','midrange','stax'] as const;
    const max=Math.max(1,...keys.map(k=>r[k]||0));
    const R=42, CX=60, CY=60;
    const pts:string[]=[];
    keys.forEach((k,i)=>{
      const ang=-Math.PI/2+i*(2*Math.PI/keys.length);
      const val=((r[k]||0)/max)*R;
      const x=CX+val*Math.cos(ang);
      const y=CY+val*Math.sin(ang);
      pts.push(`${x},${y}`);
    });
    const axes=keys.map((k,i)=>{
      const ang=-Math.PI/2+i*(2*Math.PI/keys.length);
      const x=CX+R*Math.cos(ang), y=CY+R*Math.sin(ang);
      return <line key={k} x1={CX} y1={CY} x2={x} y2={y} stroke="#333" strokeWidth="0.5"/>;
    });
    const labels = keys.map((k,i)=>{
      const ang=-Math.PI/2+i*(2*Math.PI/keys.length);
      const x=CX+(R+10)*Math.cos(ang), y=CY+(R+10)*Math.sin(ang);
      return <text key={`lbl-${k}`} x={x} y={y} fontSize="8" textAnchor="middle" fill="#9ca3af">{k}</text>;
    });
    return (
      <svg viewBox="0 0 160 160" className="w-full max-w-[260px] h-auto">
        <g transform="translate(10,10)">
          <circle cx={60} cy={60} r={42} fill="none" stroke="#333" strokeWidth="0.5" />
          {axes}
          <polygon points={pts.join(' ')} fill="rgba(56,189,248,0.35)" stroke="#22d3ee" strokeWidth="1" />
          {labels}
        </g>
      </svg>
    );
  }

  return (
    <main className="w-full max-w-none px-4 sm:px-6 lg:px-8 2xl:px-10 py-8">
      <div className="max-w-[1600px] mx-auto">
        <div className="grid grid-cols-12 gap-6">
        <aside className="col-span-12 md:col-span-3 space-y-4">
          <div className="rounded-xl border border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950 p-5 shadow-lg">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-1 w-1 rounded-full bg-cyan-400 animate-pulse shadow-lg shadow-cyan-400/50"></div>
              <h3 className="text-base font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                Deck Trends
              </h3>
            </div>
            <div className="flex flex-col items-center gap-6">
            <div className="flex flex-col items-center w-full p-4 bg-neutral-800/30 rounded-lg border border-neutral-700/50">
              <div className="text-xs font-semibold text-cyan-400 mb-2 flex items-center gap-1">
                <span>⚪</span>
                <span title="Derived from commander and title; falls back to deck cards">Color Balance</span>
              </div>
              {hasPie ? (
                <>
                  {pieSvg(pieCounts)}
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-neutral-200">
                    {(['W','U','B','R','G'] as const).map(k => {
                      const count = (pieCounts as any)[k] || 0;
                      const colorTotal = Object.values(pieCounts).reduce((a,b)=>a+b,0) || 1;
                      const percentage = colorTotal > 0 ? Math.round((count / colorTotal) * 100) : 0;
                      const colorName = k==='W'?'White':k==='U'?'Blue':k==='B'?'Black':k==='R'?'Red':'Green';
                      const colorBg = k==='W'?'bg-gray-200':k==='U'?'bg-blue-400':k==='B'?'bg-gray-600':k==='R'?'bg-red-500':'bg-green-500';
                      return (
                        <div key={`leg-${k}`} className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${colorBg}`}></div>
                          <span className="font-medium">{colorName}: {count} ({percentage}%)</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 text-[10px] text-neutral-400 text-center">
                    Cards: <span className="font-mono font-semibold text-neutral-300">{totalCards}</span>
                    {Object.values(pieCounts).reduce((a,b)=>a+b,0) !== totalCards && (
                      <span className="ml-2" title="Multicolored cards contribute to multiple colors">
                        • Color instances: <span className="font-mono font-semibold text-neutral-300">{Object.values(pieCounts).reduce((a,b)=>a+b,0)}</span>
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-xs text-neutral-400 text-center py-4">Not enough data to calculate.</div>
              )}
            </div>
              <div className="flex flex-col items-center w-full p-4 bg-neutral-800/30 rounded-lg border border-neutral-700/50">
              <div className="text-xs font-semibold text-purple-400 mb-2 flex items-center gap-1">
                <span>📊</span>
                <span title="Heuristic based on types/keywords/curve">Playstyle Radar</span>
              </div>
                {Object.values(radar).some(v=>v>0) ? (
                  <>
                    {radarSvg(radar)}
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-neutral-200">
                      {['Aggro','Control','Combo','Midrange','Stax'].map((t) => {
                        const key = t.toLowerCase() as keyof typeof radar;
                        const value = radar[key] || 0;
                        return (<div key={t} className="font-medium">{t}: <span className="text-purple-400 font-semibold">{value.toFixed(1)}</span></div>);
                      })}
                    </div>
                  </>
                ) : (<div className="text-xs text-neutral-400 text-center py-4">Not enough data to calculate.</div>)}
              </div>
              <div className="text-[10px] text-neutral-400 text-center leading-relaxed px-2">
                <span className="opacity-70">Derived from this decklist: we analyze card types, keywords, and curve (creatures, instants/sorceries, tutors, wipes, stax/tax pieces).</span>
              </div>
            </div>
          </div>

          {/* Mana curve */}
          <div className="rounded-xl border border-neutral-800 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50"></div>
              <h3 className="text-sm font-bold bg-gradient-to-r from-emerald-400 to-green-500 bg-clip-text text-transparent">
                Mana Curve
              </h3>
            </div>
            <div className="grid grid-cols-7 gap-1 items-end h-24">
              {(['1','2','3','4','5','6','7+'] as const).map(k => {
                const max = Math.max(1, ...(['1','2','3','4','5','6','7+'] as const).map(x=>curve[x]||0));
                const h = Math.round(((curve[k]||0)/max)*100);
                return (
                  <div key={`curve-${k}`} className="flex flex-col items-center gap-1 h-full justify-end">
                    <div className="relative w-6 bg-emerald-600/80" style={{ height: `${Math.max(6,h)}%` }}>
                      <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] tabular-nums">{curve[k]||0}</span>
                    </div>
                    <div className="text-[10px] opacity-70">{k}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Type distribution */}
          <div className="rounded-xl border border-neutral-800 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-1 w-1 rounded-full bg-sky-400 animate-pulse shadow-lg shadow-sky-400/50"></div>
              <h3 className="text-sm font-bold bg-gradient-to-r from-sky-400 to-blue-500 bg-clip-text text-transparent">
                Card Types
              </h3>
            </div>
            <div className="space-y-1 text-[11px]">
              {(Object.keys(types) as Array<keyof typeof types>).map((k) => {
                const total = Object.values(types).reduce((a,b)=>a+b,0) || 1;
                const pct = Math.round(((types[k]||0)/total)*100);
                return (
                  <div key={`type-${k}`}> 
                    <div className="flex items-center justify-between"><span>{k}</span><span className="font-mono">{pct}%</span></div>
                    <div className="h-1.5 rounded bg-neutral-800 overflow-hidden"><div className="h-1.5 bg-sky-500" style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Core needs meters */}
          <div className="rounded-xl border border-neutral-800 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-1 w-1 rounded-full bg-amber-400 animate-pulse shadow-lg shadow-amber-400/50"></div>
              <h3 className="text-sm font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
                Deck Fundamentals
              </h3>
            </div>
            <div className="space-y-2 text-[11px]">
              {([['Lands','lands',34,38],['Ramp','ramp',8,8],['Draw','draw',8,8],['Removal','removal',5,5]] as const).map(([label,key,minT,maxT])=>{
                const v = (core as any)[key] || 0; const target = maxT; const pct = Math.max(0, Math.min(100, Math.round((v/target)*100)));
                const ok = v>=minT && v<=maxT; const color = ok? 'bg-emerald-600' : (v<minT? 'bg-amber-500':'bg-red-500');
                return (
                  <div key={String(key)}>
                    <div className="flex items-center justify-between"><span>{label}</span><span className="font-mono">{v}{maxT?`/${maxT}`:''}</span></div>
                    <div className="h-1.5 rounded bg-neutral-800 overflow-hidden"><div className={`h-1.5 ${color}`} style={{ width: `${pct}%` }} /></div>
                    <div className="text-[10px] opacity-60">Target: {minT===maxT? `${maxT}`:`${minT}–${maxT}`}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pricing mini */}
          <div className="rounded-xl border border-neutral-800 p-3">
            {(() => { const PriceMini = require('@/components/DeckPriceMini').default; return <PriceMini deckId={id} />; })()}
          </div>
        </aside>

        <section className="col-span-12 md:col-span-9">
          <header className="mb-4 flex items-center justify-between gap-2">
            <div>
              <div className="text-xs opacity-70">Deck name:</div>
              <InlineDeckTitle deckId={id} initial={title} />
              <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                {['Aggro','Control','Combo','Midrange','Stax'].map((t)=> (
                  <span key={`arch-${t}`} title={`Signals: ${t==='Aggro'?'creatures, low CMC attackers':t==='Control'?'counter/board wipes, instants/sorceries':t==='Combo'?'tutors, search your library':t==='Midrange'?'creatures at 5+ cmc':t==='Stax'?'tax/lock pieces like Rule of Law, Winter Orb':''}`} className="px-1.5 py-0.5 rounded border border-neutral-700 bg-neutral-900/60">
                    {t}
                  </span>
                ))}
              </div>
              {/* Deck ID removed per request */}
            </div>
            <div className="flex items-center gap-2">
              <DeckPublicToggle deckId={id} initialIsPublic={deck?.is_public === true} compact />
              {(() => { const Del = require('@/components/DeckDeleteButton').default; return <Del deckId={id} deckName={title} small redirectTo="/my-decks" />; })()}
            </div>
          </header>
          {/* Build Assistant (sticky) */}
          {(() => { const BA = require('./BuildAssistantSticky').default; return <BA deckId={id} encodedIntent={i} isPro={isPro} />; })()}
          {/* key forces remount when ?r= changes */}
          {/* Right column: functions panel, then editor */}
          <FunctionsPanel deckId={id} isPublic={deck?.is_public===true} isPro={isPro} />
          <Client deckId={id} isPro={isPro} key={r || "_"} />
        </section>
        </div>
      </div>
    </main>
  );
}
