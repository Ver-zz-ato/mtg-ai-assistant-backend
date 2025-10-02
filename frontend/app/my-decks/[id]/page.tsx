// app/my-decks/[id]/page.tsx
import { createClient } from "@/lib/supabase/server";
import Client from "./Client";
import ExportDeckCSV from "@/components/ExportDeckCSV";
import CopyDecklistButton from "@/components/CopyDecklistButton";
import DeckCsvUpload from "@/components/DeckCsvUpload";
import RecomputeButton from "./RecomputeButton";
import InlineDeckTitle from "@/components/InlineDeckTitle";
import DeckPublicToggle from "@/components/DeckPublicToggle";
import ProAutoToggle from "./ProAutoToggle";
import FunctionsPanel from "./FunctionsPanel";
import NextDynamic from "next/dynamic";
import DeckProbabilityPanel from "./DeckProbabilityPanel";

type Params = { id: string };
type Search = { r?: string };

export const dynamic = "force-dynamic";

function norm(name: string): string {
  return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

export default async function Page({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const { id } = await params;
  const { r } = await searchParams;
  const supabase = await createClient();
  const { data: ures } = await supabase.auth.getUser();
  const isPro = Boolean((ures?.user as any)?.user_metadata?.pro);
  const { data: deck } = await supabase.from("decks").select("title, is_public, commander, title").eq("id", id).maybeSingle();
  const title = deck?.title || "Untitled Deck";

  // Fetch cards
  const { data: cards } = await supabase.from("deck_cards").select("name, qty").eq("deck_id", id).limit(400);
  const arr = Array.isArray(cards) ? (cards as any[]).map(x=>({ name:String(x.name), qty:Number(x.qty||1) })) : [];

  // Scryfall helper and caching
  async function scryfallBatch(names: string[]) {
    const identifiers = Array.from(new Set(names.filter(Boolean))).slice(0, 400).map(n=>({ name:n }));
    const out: Record<string, any> = {};
    if (!identifiers.length) return out;
    try {
      const r = await fetch('https://api.scryfall.com/cards/collection', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ identifiers }) });
      const j:any = await r.json().catch(()=>({}));
      const rows:any[] = Array.isArray(j?.data) ? j.data : [];
      for (const c of rows) out[norm(c?.name||'')] = c;
      try {
        const up = rows.map((c:any)=>{
          const img = c?.image_uris || c?.card_faces?.[0]?.image_uris || {};
          return {
            name: norm(c?.name||''), small: img.small||null, normal: img.normal||null, art_crop: img.art_crop||null,
            type_line: c?.type_line || null, oracle_text: c?.oracle_text || (c?.card_faces?.[0]?.oracle_text || null),
            updated_at: new Date().toISOString(),
          };
        });
        if (up.length) await supabase.from('scryfall_cache').upsert(up, { onConflict: 'name' });
      } catch {}
    } catch {}
    return out;
  }

  // Build details from deck cards (for both pie and radar)
  const details = await scryfallBatch(arr.map(a=>a.name));
  // Pie from actual deck composition
  const pieCounts: Record<string, number> = { W:0,U:0,B:0,R:0,G:0 };
  for (const { name, qty } of arr) {
    const d = details[norm(name)];
    const ci: string[] = Array.isArray(d?.color_identity) ? d.color_identity : [];
    const q = Math.max(1, Number(qty)||1);
    for (const c of ci) pieCounts[c] = (pieCounts[c]||0) + q;
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
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="grid grid-cols-12 gap-6">
        <aside className="col-span-12 md:col-span-3">
          <div className="rounded-xl border border-neutral-800 p-4">
            <div className="text-sm font-semibold mb-2">Deck trends</div>
            <div className="flex flex-col items-center gap-4">
            <div className="flex flex-col items-center">
              <div className="text-xs opacity-80 mb-1"><span title="Derived from commander and title; falls back to deck cards">Color balance</span></div>
              {hasPie ? (
                <>
                  {pieSvg(pieCounts)}
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-neutral-300">
                    {(['W','U','B','R','G'] as const).map(k => (
                      <div key={`leg-${k}`}>{k==='W'?'White':k==='U'?'Blue':k==='B'?'Black':k==='R'?'Red':'Green'}: {(pieCounts as any)[k]||0}</div>
                    ))}
                  </div>
                  <div className="mt-1 text-[10px] opacity-70">Cards: <span className="font-mono">{totalCards}</span></div>
                </>
              ) : (
                <div className="text-[10px] opacity-60">Not enough data to calculate.</div>
              )}
            </div>
              <div className="flex flex-col items-center">
              <div className="text-xs opacity-80 mb-1"><span title="Heuristic based on types/keywords/curve">Playstyle radar</span></div>
                {Object.values(radar).some(v=>v>0) ? (
                  <>
                    {radarSvg(radar)}
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-neutral-300">
                      {['Aggro','Control','Combo','Midrange','Stax'].map((t)=> (<div key={t}>{t}</div>))}
                    </div>
                  </>
                ) : (<div className="text-[10px] opacity-60">Not enough data to calculate.</div>)}
              </div>
              <div className="text-[10px] text-neutral-400 text-center">Derived from this decklist: we analyze card types, keywords, and curve (creatures, instants/sorceries, tutors, wipes, stax/tax pieces).</div>
            </div>
          </div>
          {/* Analyzer under trends */}
<div className="mt-4">{(() => { const Lazy = require('./AnalyzerLazy').default; return <Lazy deckId={id} proAuto={isPro} />; })()}</div>
        </aside>

        <section className="col-span-12 md:col-span-9">
          <header className="mb-4 flex items-center justify-between gap-2">
            <div>
              <div className="text-xs opacity-70">Deck name:</div>
              <InlineDeckTitle deckId={id} initial={title} />
              <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                {['Aggro','Control','Combo','Midrange','Stax'].map((t)=> (
                  <span key={`arch-${t}`} title={`Signals: ${t==='Aggro'?'creatures, low CMC attackers':' '}${t==='Control'?'counter/board wipes, instants/sorceries':''}${t==='Combo'?'tutors, search your library':''}${t==='Midrange'?'creatures at 5+ cmc':''}${t==='Stax'?'tax/lock pieces like Rule of Law, Winter Orb':''}`.trim()} className="px-1.5 py-0.5 rounded border border-neutral-700 bg-neutral-900/60">
                    {t}
                  </span>
                ))}
              </div>
              {/* Deck ID removed per request */}
            </div>
            <DeckPublicToggle deckId={id} initialIsPublic={deck?.is_public === true} compact />
          </header>
          {/* key forces remount when ?r= changes */}
          {/* Right column: functions panel, then editor */}
          <FunctionsPanel deckId={id} isPublic={deck?.is_public===true} isPro={isPro} />
          <Client deckId={id} isPro={isPro} key={r || "_"} />
        </section>
      </div>
    </main>
  );
}
