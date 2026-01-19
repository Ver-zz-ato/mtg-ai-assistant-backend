"use client";

import React from "react";
import ExportCollectionCSV from "@/components/ExportCollectionCSV";
import { capture } from "@/lib/ph";

export default function CollectionSnapshotDrawer({ collectionId }: { collectionId: string }){
  const [cards, setCards] = React.useState<Array<{ name:string; qty:number }>>([]);
  const [value, setValue] = React.useState<number|null>(null);
  const [currency, setCurrency] = React.useState<'USD'|'EUR'|'GBP'>(():any=>{ try{ return (localStorage.getItem('price_currency') as any)||'USD'; }catch{return 'USD'; } });
  const [colors, setColors] = React.useState<Record<string, number>>({ W:0, U:0, B:0, R:0, G:0 });

  React.useEffect(()=>{ try{ capture('mounted: CollectionSnapshotDrawer', { id: collectionId }); } catch{} }, [collectionId]);

  React.useEffect(()=>{ (async()=>{
    try{
      const r = await fetch(`/api/collections/cards?collectionId=${encodeURIComponent(collectionId)}`, { cache:'no-store' });
      const j = await r.json().catch(()=>({}));
      if(r.ok && j?.ok){ setCards((j.items||[]).map((it:any)=>({ name: it.name, qty: Number(it.qty)||0 }))); }
    } catch{}
  })(); }, [collectionId]);

  const refreshValue = React.useCallback(async ()=>{
    try{
      const names = Array.from(new Set(cards.map(c=>c.name)));
      if(!names.length){ setValue(0); return; }
      // Clear value when currency changes to avoid stale data
      setValue(null);
      // Use cache: no-store to ensure fresh price data
      const r = await fetch('/api/price/snapshot', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ names, currency }), cache: 'no-store' });
      const j = await r.json().catch(()=>({}));
      if(!r.ok || j?.ok===false){ 
        console.warn('Price snapshot failed:', j?.error || 'Unknown error');
        setValue(null); 
        return; 
      }
      const prices: Record<string, number> = j.prices||{};
      const norm=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
      const total = cards.reduce((acc,it)=> acc + (prices[norm(it.name)]||0)*it.qty, 0);
      setValue(total);
    }catch(e:any){ 
      console.error('Refresh value error:', e);
      setValue(null); 
    }
  }, [cards, currency]);

  React.useEffect(()=>{ 
    if(cards.length > 0) {
      refreshValue(); 
    } else {
      setValue(0);
    }
  }, [cards, currency, refreshValue]);

  React.useEffect(()=>{ (async()=>{
    try{
      const names = Array.from(new Set(cards.map(c=>c.name))).slice(0, 200);
      if(!names.length){ setColors({W:0,U:0,B:0,R:0,G:0}); return; }
      const chunks: string[][] = []; for(let i=0;i<names.length;i+=75) chunks.push(names.slice(i,i+75));
      const counts = { W:0,U:0,B:0,R:0,G:0 } as Record<string, number>;
      for(const part of chunks){
        const body = { identifiers: part.map(n=>({ name:n })) };
        const r = await fetch('https://api.scryfall.com/cards/collection', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
        const j:any = r.ok? await r.json().catch(()=>({})) : {};
        const data:any[] = Array.isArray(j?.data)? j.data : [];
        for(const c of data){ const ci: string[] = Array.isArray(c?.color_identity)? c.color_identity: []; if(!ci.length){ counts['C' as any] = (counts['C' as any]||0)+1; } else { const share = 1/ci.length; for(const k of ci){ if(k in counts) counts[k]+=share; } } }
      }
      setColors(counts);
    }catch{ setColors({W:0,U:0,B:0,R:0,G:0}); }
  })(); }, [cards]);

  const totalQty = cards.reduce((s,c)=>s+c.qty,0);
  const unique = cards.length;

  return (
    <div className="space-y-3">
      <div className="rounded border border-neutral-800 p-3 space-y-1 text-sm">
        <div className="flex gap-2 flex-wrap">
          <span className="px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800">Cards: <b className="font-mono">{totalQty}</b></span>
          <span className="px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800">Unique: <b className="font-mono">{unique}</b></span>
          <span className="px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800">Value: <b className="font-mono">{value!=null? new Intl.NumberFormat(undefined, { style:'currency', currency }).format(value): '—'}</b></span>
          <button onClick={refreshValue} className="ml-auto text-xs px-2 py-0.5 rounded border border-neutral-700">Refresh</button>
        </div>
      </div>
      <div className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Color pie</div>
        <div className="flex items-center gap-2">
          <div className="w-16 h-16 rounded-full border border-neutral-700" style={{ background: (()=>{ const order:[string,string][] = [['W','#f3f2e1'],['U','#70a0d0'],['B','#6a5c6a'],['R','#d2756a'],['G','#6db07b']]; const sum = Object.values(colors).reduce((a,b)=>a+b,0)||1; let acc=0, stops: string[] = []; order.forEach(([k,col])=>{ const pct = (colors[k as keyof typeof colors]||0)/sum*100; const start=acc; acc+=pct; stops.push(`${col} ${start}% ${acc}%`);}); return `conic-gradient(${stops.join(',')})`; })() }} />
          <div className="text-xs space-y-0.5">
            {(['W','U','B','R','G'] as const).map(k=> { const sum = Object.values(colors).reduce((a,b)=>a+b,0)||1; const pct = Math.round(((colors[k]||0)/sum)*100); return (<div key={k} className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded" style={{ background: {W:'#f3f2e1',U:'#70a0d0',B:'#6a5c6a',R:'#d2756a',G:'#6db07b'}[k] }}></span>{k}: {pct}%</div>); })}
          </div>
        </div>
      </div>
      <div className="rounded border border-neutral-800 p-3">
        <div className="font-medium mb-2">Export CSV</div>
        <ExportCollectionCSV collectionId={collectionId} />
      </div>
    </div>
  );
}
