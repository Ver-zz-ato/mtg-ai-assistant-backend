// app/decks/[id]/page.tsx
import { createClient } from "@/lib/supabase/server";
import ExportDeckCSV from "@/components/ExportDeckCSV";
import CopyDecklistButton from "@/components/CopyDecklistButton";
import LikeButton from "@/components/likes/LikeButton";

type Params = { id: string };
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const supabase = await createClient();

  function norm(name: string): string {
    return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  }

  async function scryfallBatch(names: string[]) {
    const identifiers = Array.from(new Set(names.filter(Boolean))).slice(0, 300).map((n) => ({ name: n }));
    const out: Record<string, any> = {};
    if (!identifiers.length) return out;
    try {
      const r = await fetch('https://api.scryfall.com/cards/collection', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ identifiers }) });
      const j:any = await r.json().catch(()=>({}));
      const rows:any[] = Array.isArray(j?.data) ? j.data : [];
      for (const c of rows) out[norm(c?.name||'')] = c;
      // cache into scryfall_cache (images + details)
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
            updated_at: new Date().toISOString(),
          };
        });
        if (up.length) await supabase.from('scryfall_cache').upsert(up, { onConflict: 'name' });
      } catch {}
    } catch {}
    return out;
  }

  // Fetch deck meta (public visibility enforced by RLS)
  const { data: deckRow } = await supabase.from("decks").select("title, is_public, meta, commander, title").eq("id", id).maybeSingle();
  const title = deckRow?.title ?? "Deck";
  const archeMeta: any = (deckRow as any)?.meta?.archetype || null;

  // Fetch cards
  const { data: cards } = await supabase
    .from("deck_cards")
    .select("name, qty")
    .eq("deck_id", id)
    .order("name", { ascending: true });

  // Compute pie from commander/title
  const pieNames = [String(deckRow?.commander||''), String(deckRow?.title||'')].filter(Boolean);
  const pieCards = await scryfallBatch(pieNames);
  const pieCounts: Record<string, number> = { W:0,U:0,B:0,R:0,G:0 };
  Object.values(pieCards).forEach((card:any) => {
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

  // Fallback pie from deck cards if commander/title didn’t resolve
  if (!Object.values(pieCounts).some(n=>n>0)) {
    const names = Array.from(new Set((cards||[]).map(c=>String(c.name))));
    const d = detailsForRadar || await scryfallBatch(names);
    Object.values(d).forEach((card:any) => {
      const ci: string[] = Array.isArray(card?.color_identity) ? card.color_identity : [];
      ci.forEach(c => { pieCounts[c] = (pieCounts[c]||0) + 1; });
    });
  }
  const hasPie = Object.values(pieCounts).some((n)=>n>0);

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

  function radarSvg(r: Record<string, number>) {
    const keys = ['aggro','control','combo','midrange','stax'] as const;
    const max = Math.max(1, ...keys.map(k=>r[k]||0));
    const R = 42, CX=60, CY=60; const pts: string[] = [];
    keys.forEach((k,i)=>{ const ang=-Math.PI/2+i*(2*Math.PI/keys.length); const val=((r[k]||0)/max)*R; const x=CX+val*Math.cos(ang); const y=CY+val*Math.sin(ang); pts.push(`${x},${y}`); });
    const axes = keys.map((k,i)=>{ const ang=-Math.PI/2+i*(2*Math.PI/keys.length); const x=CX+R*Math.cos(ang), y=CY+R*Math.sin(ang); return <line key={k} x1={CX} y1={CY} x2={x} y2={y} stroke="#333" strokeWidth="0.5"/>; });
    const labels = keys.map((k,i)=>{ const ang=-Math.PI/2+i*(2*Math.PI/keys.length); const x=CX+(R+10)*Math.cos(ang), y=CY+(R+10)*Math.sin(ang); return <text key={`lbl-${k}`} x={x} y={y} fontSize="8" textAnchor="middle" fill="#9ca3af">{k}</text>; });
    return (
      <svg viewBox="0 0 140 140" className="w-32 h-32">
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
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid grid-cols-12 gap-6">
        {/* Left trends panel */}
        <aside className="col-span-12 md:col-span-3">
          <div className="rounded-xl border border-neutral-800 p-4">
            <div className="text-sm font-semibold mb-2">Deck trends</div>
            <div className="flex flex-col items-center gap-4">
              <div className="flex flex-col items-center">
                <div className="text-xs opacity-80 mb-1">Color balance</div>
                {hasPie ? (
                  <>
                    {pieSvg(pieCounts)}
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-neutral-300">
                      {['W','U','B','R','G'].map(k => (
                        <div key={`leg-${k}`}>{k==='W'?'White':k==='U'?'Blue':k==='B'?'Black':k==='R'?'Red':'Green'}: {pieCounts[k]||0}</div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-[10px] opacity-60">Not enough data to calculate.</div>
                )}
              </div>
              <div className="flex flex-col items-center">
                <div className="text-xs opacity-80 mb-1">Playstyle radar</div>
                {Object.values(arche||{}).some(v=>Number(v)>0) ? (
                  <>
                    {radarSvg(arche || { aggro:0, control:0, combo:0, midrange:0, stax:0 })}
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-neutral-300">
                      {['Aggro','Control','Combo','Midrange','Stax'].map((t)=> (<div key={t}>{t}</div>))}
                    </div>
                  </>
                ) : (
                  <div className="text-[10px] opacity-60">Not enough data to calculate.</div>
                )}
              </div>
              <div className="text-[10px] text-neutral-400 text-center">Derived from this decklist: we analyze card types, keywords, and curve (creatures, instants/sorceries, tutors, wipes, stax/tax pieces).</div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <section className="col-span-12 md:col-span-9">
          <header className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h1 className="text-2xl font-semibold">{title}</h1>
              <p className="text-xs text-muted-foreground">Deck ID: {id}</p>
            </div>
            <div className="flex items-center gap-2">
              <LikeButton deckId={id} />
              <CopyDecklistButton deckId={id} small />
              <ExportDeckCSV deckId={id} small />
            </div>
          </header>

          <section className="space-y-1">
            {(cards || []).length === 0 ? (
              <div className="text-sm text-muted-foreground">No cards yet.</div>
            ) : (
              <ul className="text-sm">
                {(cards || []).map((c) => (
                  <li key={c.name} className="flex items-center gap-2">
                    <span className="w-8 text-right tabular-nums">{c.qty}×</span>
                    <span>{c.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
