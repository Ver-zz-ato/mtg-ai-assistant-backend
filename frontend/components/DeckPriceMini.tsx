"use client";
import React from "react";

export default function DeckPriceMini({ deckId, initialCurrency = 'USD' }: { deckId: string; initialCurrency?: 'USD'|'EUR'|'GBP' }){
  const [currency, setCurrency] = React.useState<'USD'|'EUR'|'GBP'>(initialCurrency);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string|null>(null);
  const [total, setTotal] = React.useState<number|null>(null);

  async function refresh(){
    try{
      setBusy(true); setError(null);
      const r = await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`, { cache:'no-store' });
      const j = await r.json().catch(()=>({}));
      if(!r.ok || j?.ok===false) throw new Error(j?.error||'load failed');
      const items: Array<{ name:string; qty:number }> = Array.isArray(j?.cards)? j.cards : [];
      const names = Array.from(new Set(items.map(i=>i.name)));
      if(!names.length){ setTotal(0); return; }
      const pr = await fetch('/api/price/snapshot', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ names, currency }) });
      const pj = await pr.json().catch(()=>({}));
      if(!pr.ok || pj?.ok===false) throw new Error(pj?.error||'price failed');
      const prices: Record<string, number> = pj.prices||{};
      const norm=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
      const sum = items.reduce((acc,it)=> acc + (prices[norm(it.name)]||0)*Math.max(0, Number(it.qty||0)), 0);
      setTotal(sum);
    } catch(e:any){ setError(e?.message||'failed'); }
    finally{ setBusy(false); }
  }

  React.useEffect(()=>{ refresh(); }, [deckId]);
  React.useEffect(()=>{ if(total!=null) refresh(); }, [currency]);

  return (
    <div className="rounded-xl border border-neutral-800 p-3 text-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-green-400 animate-pulse shadow-lg shadow-green-400/50"></div>
          <h3 className="text-sm font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
            Deck Value
          </h3>
        </div>
        <select value={currency} onChange={e=> setCurrency(e.currentTarget.value as any)} className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs">
          <option>USD</option>
          <option>EUR</option>
          <option>GBP</option>
        </select>
      </div>
      {error && (<div className="text-xs text-red-400 mt-1">{error}</div>)}
      <div className="mt-2 text-lg font-mono">
        {total==null? (busy? '…' : '—') : new Intl.NumberFormat(undefined, { style:'currency', currency }).format(total)}
      </div>
      <div className="text-[11px] opacity-60 mt-1">Uses snapshot prices per card in the selected currency.</div>
    </div>
  );
}
