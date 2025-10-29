"use client";
import React from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function DeckAnalyzerPanel({ deckId, proAuto, format }: { deckId: string; proAuto: boolean; format?: string }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [score, setScore] = React.useState<number | null>(null);
  const [bands, setBands] = React.useState<any | null>(null);

  async function fetchDeckText(): Promise<string> {
    try {
      const r = await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`, { cache: 'no-store' });
      const j = await r.json().catch(()=>({ ok:false }));
      if (!r.ok || j?.ok===false) throw new Error(j?.error || r.statusText);
      const rows = Array.isArray(j.cards) ? j.cards as Array<{ name: string; qty: number }> : [];
      return rows.map(it => `${it.qty} ${it.name}`).join('\n');
    } catch (e:any) { setError(e?.message || 'Failed to load deck'); return ''; }
  }

  const [rawCounts, setRawCounts] = React.useState<{ lands:number; ramp:number; draw:number; removal:number } | null>(null);
  const [illegal, setIllegal] = React.useState<{ banned?: string[]; ci?: string[] }>({});
  const [meta, setMeta] = React.useState<Array<{ card:string; inclusion_rate:string; commanders:string[] }> | null>(null);

  async function run() {
    try {
      setBusy(true); setError(null);
      const deckText = await fetchDeckText();
      if (!deckText) { setScore(null); setBands(null); setRawCounts(null); return; }
      // Try to get commander from DB for commander-aware includes
      let commander: string | undefined = undefined;
      try { const sb = createBrowserSupabaseClient(); const { data } = await sb.from('decks').select('commander').eq('id', deckId).maybeSingle(); commander = String((data as any)?.commander||'') || undefined; } catch {}
      const payload:any = { deckText, format:'Commander', useScryfall:true };
      if (commander) payload.commander = commander;
      const res = await fetch('/api/deck/analyze', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(payload) });
      const j = await res.json().catch(()=>({}));
      if (!res.ok || j?.error) throw new Error(j?.error || res.statusText);
      setScore(j?.score ?? null); setBands(j?.bands ?? null);
      if (j?.counts) setRawCounts(j.counts);
      setIllegal({ banned: j?.bannedExamples || [], ci: j?.illegalExamples || [] });
      setMeta(Array.isArray(j?.metaHints) ? j.metaHints.slice(0,12) : []);
    } catch (e:any) { setError(e?.message || 'Analyze failed'); }
    finally { setBusy(false); }
  }

  React.useEffect(() => { run(); /* one-time on load */ }, []);
  React.useEffect(() => {
    const h = () => run();
    window.addEventListener('analyzer:run', h);
    return () => window.removeEventListener('analyzer:run', h);
  }, []);

  React.useEffect(() => {
    if (!proAuto) return;
    let t:any=null;
    const h=()=>{ clearTimeout(t); t=setTimeout(run, 800); };
    window.addEventListener('deck:changed', h);
    return ()=>{ window.removeEventListener('deck:changed', h); clearTimeout(t); };
  }, [proAuto]);

  return (
    <section className="rounded-xl border border-neutral-800 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-violet-400 animate-pulse shadow-lg shadow-violet-400/50"></div>
          <h3 className="text-sm font-bold bg-gradient-to-r from-violet-400 to-purple-500 bg-clip-text text-transparent">
            Deck Analyzer
          </h3>
        </div>
        <button onClick={run} disabled={busy} className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs disabled:opacity-60">{busy?'Analyzing…':'Run'}</button>
      </div>
      {error && <div className="text-xs text-red-400">{error}</div>}
      {score!=null && (
        <div className="text-sm">Score: <span className="font-semibold">{score}</span></div>
      )}
      {bands && (
        <div className="space-y-2">
          {/* compact recommendations */}
          {rawCounts && (
            <div className="text-[11px] space-y-1">
              <div className="font-medium opacity-80">Recommendations</div>
              {(() => {
                const target = { lands: 35, ramp: 8, draw: 8, removal: 5 };
                const suggs: string[] = [];
                const samples = {
                  ramp: ['Arcane Signet','Fellwar Stone','Talisman of Dominance'],
                  draw: ['Read the Bones','Skullclamp','Inspiring Call'],
                  removal: ['Swords to Plowshares','Beast Within','Go for the Throat'],
                  lands: ['Command Tower','Path of Ancestry','Exotic Orchard'],
                } as any;
                const deficit = (k: keyof typeof target) => Math.max(0, target[k] - (rawCounts as any)[k]);
                if (deficit('lands')>0) suggs.push(`Add ${deficit('lands')} lands: ${samples.lands.slice(0,2).join(', ')}`);
                if (deficit('ramp')>0) suggs.push(`Add ${deficit('ramp')} ramp rocks: ${samples.ramp.slice(0,2).join(', ')}`);
                if (deficit('draw')>0) suggs.push(`Add ${deficit('draw')} draw spells: ${samples.draw.slice(0,2).join(', ')}`);
                if (deficit('removal')>0) suggs.push(`Add ${deficit('removal')} interaction: ${samples.removal.slice(0,2).join(', ')}`);
                if (suggs.length===0) suggs.push('Looks balanced. Consider meta tweaks or upgrades.');
                return (<ul className="list-disc pl-4">{suggs.map((s,i)=>(<li key={i}>{s}</li>))}</ul>);
              })()}
              {((illegal?.banned?.length||0)>0 || (illegal?.ci?.length||0)>0) && (
                <div className="mt-1 space-y-1">
                  {(illegal?.banned?.length||0)>0 && (<div className="text-red-300">Banned: {(illegal?.banned||[]).slice(0,5).join(', ')}</div>)}
                  {(illegal?.ci?.length||0)>0 && (<div className="text-amber-300">CI conflicts: {(illegal?.ci||[]).slice(0,5).join(', ')}</div>)}
                </div>
              )}
            </div>
          )}

          {Array.isArray(meta) && meta.length>0 && (
            <div className="text-[11px] space-y-1">
              <div className="font-medium opacity-80">Popular includes</div>
              <ul className="space-y-1">
                {meta!.map((m, i) => (
                  <li key={`${m.card}-${i}`} className="flex items-center justify-between gap-2">
                    <span className="truncate"><span className="font-medium">{m.card}</span> <span className="opacity-70">({m.inclusion_rate})</span></span>
                    <button onClick={async()=>{
                      try { 
                        const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, { 
                          method:'POST', 
                          headers:{'content-type':'application/json'}, 
                          body: JSON.stringify({ name: m.card, qty: 1 }) 
                        }); 
                        const j = await res.json().catch(()=>({})); 
                        if (!res.ok || j?.ok===false) throw new Error(j?.error||'Add failed'); 
                        window.dispatchEvent(new Event('deck:changed')); 
                        window.dispatchEvent(new CustomEvent("toast", { detail: `Added ${m.card}` }));
                      } catch(e:any){ 
                        alert(e?.message||'Add failed'); 
                      }
                    }} className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700">Add</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {([['Curve','curve'],['Ramp','ramp'],['Draw','draw'],['Removal','removal'],['Mana','mana']] as const).map(([label,key]) => {
            const pct = Math.round((bands?.[key] || 0) * 100);
            const titleMap: any = { Curve: 'Mana curve — distribution of mana values', Ramp: 'Mana acceleration sources (rocks/land ramp)', Draw: 'Card advantage over time', Removal: 'Interaction to answer threats', Mana: 'Color fixing and sources' };
            return (
              <div key={key} className="text-[11px]">
                <div className="flex items-center justify-between"><span title={titleMap[label]}>{label}</span><span className="font-mono">{pct}%</span></div>
                <div className="h-1.5 rounded bg-neutral-800 overflow-hidden"><div className="h-1.5 bg-emerald-600" style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
          <div className="text-[11px] opacity-70">
            {(() => {
              const fmt = (format || 'commander').toLowerCase();
              if (fmt === 'commander') {
                return <>Tips: aim 34–38 lands (EDH), ~8 <span title="Card advantage effects that draw extra cards">draw</span>, ~8 <span title="Mana acceleration: rocks or ramp">ramp</span>, at least 5 <span title="Spells to remove opposing threats">interaction</span> pieces.</>;
              } else if (fmt === 'standard') {
                return <>Tips: aim 23–26 lands, 4–6 <span title="Card advantage effects that draw extra cards">draw</span>, 0–2 <span title="Mana acceleration: rocks or ramp">ramp</span>, 6–8 <span title="Spells to remove opposing threats">interaction</span> pieces.</>;
              } else if (fmt === 'modern') {
                return <>Tips: aim 19–22 lands, 4–6 <span title="Card advantage effects that draw extra cards">draw</span>, 0–4 <span title="Mana acceleration: rocks or ramp">ramp</span>, 8–10 <span title="Spells to remove opposing threats">interaction</span> pieces.</>;
              }
              return <>Tips: aim for a balanced mana base, card draw, and interaction.</>;
            })()}
          </div>

          {/* Commander-aware includes */}
          {Array.isArray((bands as any)) && null}
          {(() => {
            try { /* nothing */ } catch {}
            return null;
          })()}
        </div>
      )}
      {!bands && !busy && (<div className="text-xs opacity-60">Run to evaluate curve, ramp/draw/removal density and mana base from card text.</div>)}
    </section>
  );
}
