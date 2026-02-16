"use client";
import React from "react";

export default function LegalityMini({ deckId, format = 'Commander' }: { deckId: string; format?: 'Commander'|'Modern'|'Pioneer'|'Standard'|'Pauper' }){
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string|null>(null);
  const [illegalByCI, setIllegalByCI] = React.useState<number>(0);
  const [illegalExamples, setIllegalExamples] = React.useState<string[]>([]);
  const [bannedCount, setBannedCount] = React.useState<number>(0);
  const [bannedExamples, setBannedExamples] = React.useState<string[]>([]);

  async function run(){
    try{
      setBusy(true); setError(null);
      // Fetch deck text and run analyze
      const r = await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`, { cache:'no-store' });
      const j = await r.json().catch(()=>({}));
      const rows: Array<{ name:string; qty:number }> = Array.isArray(j?.cards)? j.cards : [];
      const deckText = rows.map(x=> `${x.qty} ${x.name}`).join('\n');
      const ar = await fetch('/api/deck/analyze', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ deckText, format, useScryfall: true, sourcePage: 'deck_page_legality' }) });
      const aj = await ar.json().catch(()=>({}));
      if (!ar.ok || aj?.error) throw new Error(aj?.error || ar.statusText);
      setIllegalByCI(Number(aj?.illegalByCI||0));
      setIllegalExamples(Array.isArray(aj?.illegalExamples)? aj.illegalExamples : []);
      setBannedCount(Number(aj?.bannedCount||0));
      setBannedExamples(Array.isArray(aj?.bannedExamples)? aj.bannedExamples : []);
    } catch(e:any){ setError(e?.message||'Failed'); }
    finally{ setBusy(false); }
  }

  React.useEffect(()=>{ run(); }, [deckId, format]);

  return (
    <div className="rounded-xl border border-neutral-800 p-3 text-sm">
      <div className="flex items-center justify-between">
        <div className="font-medium">Legality</div>
        <button onClick={run} disabled={busy} className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs disabled:opacity-60">{busy? 'Checking…':'Recheck'}</button>
      </div>
      {error && (<div className="text-xs text-red-400 mt-1">{error}</div>)}
      <ul className="mt-2 space-y-1 text-xs">
        <li><span className="opacity-80">Banned cards:</span> <b className="font-mono">{bannedCount}</b>{bannedExamples.length? <span className="opacity-70"> — {bannedExamples.slice(0,5).join(', ')}</span>: null}</li>
        <li><span className="opacity-80">CI conflicts:</span> <b className="font-mono">{illegalByCI}</b>{illegalExamples.length? <span className="opacity-70"> — {illegalExamples.slice(0,5).join(', ')}</span>: null}</li>
      </ul>
      <div className="mt-2 text-[11px] opacity-60">Format: {format}. Targets and checks will adapt by format in upcoming updates.</div>
    </div>
  );
}
