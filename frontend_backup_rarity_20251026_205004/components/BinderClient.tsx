"use client";

import React from "react";

// Read-only binder client with search, filters, hover previews, and a right sidebar with basic stats
export default function BinderClient({ collectionId }: { collectionId: string }){
  const [items, setItems] = React.useState<Array<{ id?: string; name: string; qty: number }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string|undefined>(undefined);

  const [filterText, setFilterText] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  React.useEffect(()=>{ const t=setTimeout(()=>setDebounced(filterText.trim().toLowerCase()), 200); return ()=>clearTimeout(t); }, [filterText]);

  // Metadata via Scryfall: set, rarity, type_line, color_identity
  const metaRef = React.useRef<Map<string, { set?: string; rarity?: string; type_line?: string; colors?: string[] }>>(new Map());

  // Prices snapshot per unit
  const [currency, setCurrency] = React.useState<'USD'|'EUR'|'GBP'>('USD');
  React.useEffect(()=>{ try{ const saved = localStorage.getItem('price_currency') as any; if(saved && (saved==='USD'||saved==='EUR'||saved==='GBP')) setCurrency(saved); }catch{} }, []);
  React.useEffect(()=>{ try{ localStorage.setItem('price_currency', currency); }catch{} }, [currency]);
  const [priceMap, setPriceMap] = React.useState<Record<string, number>>({});

  // Hover preview via shared hook
  const { useHoverPreview } = require("@/components/shared/HoverPreview");
  const { preview, bind } = (useHoverPreview && typeof useHoverPreview === 'function') ? useHoverPreview() : { preview: null, bind: (_:string)=>({}) };
  const [imgMap, setImgMap] = React.useState<Record<string,{ small?: string; normal?: string }>>({});

  React.useEffect(()=>{ (async()=>{
    setLoading(true); setError(undefined);
    try{
      const r = await fetch(`/api/collections/cards?collectionId=${encodeURIComponent(collectionId)}`, { cache:'no-store' });
      const j = await r.json().catch(()=>({}));
      if(!r.ok || j?.ok===false) throw new Error(j?.error||'load failed');
      const arr = (j.items||[]).map((it:any)=>({ name: it.name, qty: Number(it.qty)||0 }));
      setItems(arr);
    }catch(e:any){ setError(e?.message||'load failed'); }
    finally{ setLoading(false); }
  })(); }, [collectionId]);

  React.useEffect(()=>{ (async()=>{
    try{
      const names = Array.from(new Set(items.map(i=>i.name)));
      if(!names.length){ setPriceMap({}); return; }
      const r = await fetch('/api/price/snapshot', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ names, currency }) });
      const j = await r.json().catch(()=>({}));
      if(!r.ok || j?.ok===false){ setPriceMap({}); return; }
      setPriceMap(j.prices||{});
    }catch{ setPriceMap({}); }
  })(); }, [items.map(i=>i.name).join('|'), currency]);

  React.useEffect(()=>{ (async()=>{
    try{
      const names = Array.from(new Set(items.map(i=>i.name)));
      if(!names.length) { setImgMap({}); return; }
      // Scryfall images
      const m = await (await import("@/lib/scryfall")).getImagesForNames(names);
      const obj: any = {}; m.forEach((v: any, k: string) => { obj[k] = { small: v.small, normal: v.normal||v.large }; });
      setImgMap(obj);
      // Scryfall metadata (set, rarity, type_line, color_identity) - use cached API route
      const chunked: string[][] = []; for(let i=0;i<names.length;i+=75) chunked.push(names.slice(i,i+75));
      for(const part of chunked){
        const rr = await fetch('/api/cards/batch-metadata', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ names: part }) });
        const jj:any = rr.ok? await rr.json().catch(()=>({})) : {};
        const data:any[] = Array.isArray(jj?.data)? jj.data : [];
        for(const c of data){
          const key = String(c?.name||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
          metaRef.current.set(key, { set: String(c?.set||'').toUpperCase(), rarity: String(c?.rarity||'').toLowerCase(), type_line: String(c?.type_line||''), colors: Array.isArray(c?.color_identity)? c.color_identity: [] });
        }
      }
    }catch{}
  })(); }, [items.map(i=>i.name).join('|')]);

  const norm=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();

  // Filters
  const [fColors, setFColors] = React.useState<string[]>([]); // W U B R G C
  const [fRarity, setFRarity] = React.useState<string[]>([]);
  const [fSets, setFSets] = React.useState<string[]>([]);
  const [fTypes, setFTypes] = React.useState<string[]>([]);
  const [fPrice, setFPrice] = React.useState<string>('');
  const [fQtyMin, setFQtyMin] = React.useState<number>(0);

  // Price slider (min/max) with presets fallback
  const [pMin, setPMin] = React.useState<number|''>('');
  const [pMax, setPMax] = React.useState<number|''>('');

  const filtered = React.useMemo(()=>{
    let arr = items.slice();
    if(debounced) arr = arr.filter(i=> i.name.toLowerCase().includes(debounced));
    if(fQtyMin>0) arr = arr.filter(i=> i.qty >= fQtyMin);
    if(fSets.length) arr = arr.filter(i=> fSets.includes((metaRef.current.get(norm(i.name))?.set||'').toUpperCase()));
    if(fRarity.length) arr = arr.filter(i=> fRarity.includes((metaRef.current.get(norm(i.name))?.rarity||'').toLowerCase()));
    if(fTypes.length) arr = arr.filter(i=> { const tl=(metaRef.current.get(norm(i.name))?.type_line||'').toLowerCase(); return fTypes.some(t=> tl.includes(t.toLowerCase())); });
    if(fColors.length){ arr = arr.filter(i=>{ const colors = (metaRef.current.get(norm(i.name))?.colors||[]) as string[]; if(fColors.includes('C')) return colors.length===0; return colors.some(c=> fColors.includes(c)); }); }
    if(fPrice){ arr = arr.filter(i=>{ const unit = priceMap[norm(i.name)]||0; switch(fPrice){ case '<1': return unit<1; case '1-5': return unit>=1 && unit<5; case '5-20': return unit>=5 && unit<20; case '20+': return unit>=20; default: return true; } }); }
    if(pMin!=='' || pMax!==''){ const lo = pMin===''? -Infinity : Number(pMin); const hi = pMax===''? Infinity : Number(pMax); arr = arr.filter(i=>{ const u=priceMap[norm(i.name)]||0; return u>=lo && u<=hi; }); }
    return arr;
  }, [items, debounced, fQtyMin, fSets.join('|'), fRarity.join('|'), fTypes.join('|'), fColors.join('|'), fPrice, pMin, pMax, priceMap]);

  const calcPos = (e: MouseEvent | any) => {
    try{ const vw=window.innerWidth, vh=window.innerHeight, margin=12, boxW=320, boxH=460, half=boxW/2; const rawX=e.clientX as number, rawY=e.clientY as number; const below = rawY - boxH - margin < 0; const x=Math.min(vw-margin-half, Math.max(margin+half, rawX)); const y = below ? Math.min(vh - margin, rawY + margin) : Math.max(margin + 1, rawY - margin); return { x, y, below }; } catch { return { x: (e as any).clientX||0, y: (e as any).clientY||0, below:false }; }
  };

  // Sidebar stats (basic)
  const totalCards = filtered.reduce((s,i)=>s+i.qty,0);
  const unique = filtered.length;
  const estTotal = filtered.reduce((acc,it)=> acc + (priceMap[norm(it.name)]||0)*it.qty, 0);

  // Sets and rarity breakdown from metaRef
  const setsTop = React.useMemo(()=>{ const m = new Map<string, number>(); for(const it of filtered){ const code=(metaRef.current.get(norm(it.name))?.set||''); if(!code) continue; m.set(code, (m.get(code)||0)+it.qty); } return Array.from(m.entries()).map(([set,count])=>({ set, count })).sort((a,b)=>b.count-a.count).slice(0,10); }, [filtered]);
  const rarityHist = React.useMemo(()=>{ const m = new Map<string, number>(); for(const it of filtered){ const r=(metaRef.current.get(norm(it.name))?.rarity||''); if(!r) continue; m.set(r, (m.get(r)||0)+it.qty); } return Array.from(m.entries()).map(([label,value])=>({ label, value })); }, [filtered]);
  const typeHist = React.useMemo(()=>{ const buckets=['creature','instant','sorcery','land','artifact','enchantment']; const m = new Map<string, number>(); for(const b of buckets) m.set(b,0); for(const it of filtered){ const tl=(metaRef.current.get(norm(it.name))?.type_line||'').toLowerCase(); for(const b of buckets){ if(tl.includes(b)) m.set(b, (m.get(b)||0)+it.qty); } } return Array.from(m.entries()).map(([label,value])=>({ label, value })); }, [filtered]);

  const sym = currency==='EUR'?'€':(currency==='GBP'?'£':'$');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-10 gap-6">
      <div className="lg:col-span-2 xl:col-span-7 flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">Search<input value={filterText} onChange={e=>setFilterText(e.target.value)} className="ml-2 w-64 bg-neutral-950 border border-neutral-700 rounded px-2 py-1"/></label>
          <div className="text-sm inline-flex items-center gap-2">
            <span className="opacity-70">Colors:</span>
            {['W','U','B','R','G','C'].map(k=> (
              <label key={k} className="inline-flex items-center gap-1"><input type="checkbox" checked={fColors.includes(k)} onChange={(e)=> setFColors(p=> e.target.checked? [...p,k] : p.filter(x=>x!==k))}/> {k}</label>
            ))}
          </div>
          <div className="text-sm inline-flex items-center gap-2">
            <span className="opacity-70">Rarity:</span>
            {['common','uncommon','rare','mythic'].map(k=> (
              <label key={k} className="inline-flex items-center gap-1"><input type="checkbox" checked={fRarity.includes(k)} onChange={(e)=> setFRarity(p=> e.target.checked? [...p,k] : p.filter(x=>x!==k))}/> {k}</label>
            ))}
          </div>
          <div className="text-sm inline-flex items-center gap-2">
            <span className="opacity-70">Price:</span>
            {['','<1','1-5','5-20','20+'].map(k=> (
              <label key={k} className="inline-flex items-center gap-1"><input type="radio" name="priceband" checked={fPrice===k} onChange={()=>setFPrice(k)} /> {k||'Any'}</label>
            ))}
            <span className="opacity-70 ml-2">Min</span>
            <input type="number" value={pMin as any} onChange={e=>setPMin(e.target.value===''? '': Number(e.target.value))} className="w-20 bg-neutral-950 border border-neutral-700 rounded px-2 py-1" />
            <span className="opacity-70">Max</span>
            <input type="number" value={pMax as any} onChange={e=>setPMax(e.target.value===''? '': Number(e.target.value))} className="w-20 bg-neutral-950 border border-neutral-700 rounded px-2 py-1" />
          </div>
          <label className="text-sm">Qty ≥<input type="number" min={0} value={fQtyMin} onChange={e=>setFQtyMin(Math.max(0, Number(e.target.value||0)))} className="ml-2 w-20 bg-neutral-950 border border-neutral-700 rounded px-2 py-1"/></label>
          <div className="ml-auto text-xs inline-flex items-center gap-2">
            <span>Currency</span>
            <select value={currency} onChange={e=>setCurrency(e.target.value as any)} className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1"><option>USD</option><option>EUR</option><option>GBP</option></select>
          </div>
        </div>

        {loading && <div className="text-xs opacity-70">Loading…</div>}
        {error && <div className="text-xs text-red-500">{String(error)}</div>}

        {!loading && !error && (
          <ul className="divide-y divide-neutral-900 rounded border border-neutral-800 overflow-hidden">
            {filtered.map((it, idx)=>{
              const k = norm(it.name); const img = imgMap[k]?.small; const unit = priceMap[k]||0;
              return (
                <li key={idx} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-10 text-right font-mono text-sm">{it.qty}</span>
                  {img ? (
                    <img src={img} alt={it.name} className="w-[24px] h-[34px] object-cover rounded" {...(bind(imgMap[k]?.normal || img) as any)} />
                  ) : <div className="w-[24px] h-[34px] bg-neutral-900 rounded" />}
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm">{it.name}</div>
                    <div className="text-[11px] opacity-70">
                      {(() => { const m = metaRef.current.get(k); return m? (<span>{m.set || '—'} • {m.rarity || '—'}</span>) : '—'; })()}
                    </div>
                  </div>
                  <div className="text-xs tabular-nums w-28 text-right">{unit>0? `${sym}${(unit*it.qty).toFixed(2)} • ${sym}${unit.toFixed(2)}` : '—'}</div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <aside className="lg:col-span-1 xl:col-span-3 space-y-3">
        <div className="rounded border border-neutral-800 p-3">
          <div className="font-medium mb-1">Overview</div>
          <div className="text-sm">Cards: <b className="font-mono">{totalCards}</b></div>
          <div className="text-sm">Unique: <b className="font-mono">{unique}</b></div>
          <div className="text-sm">Value: <b className="font-mono" suppressHydrationWarning>{new Intl.NumberFormat(undefined, { style:'currency', currency }).format(estTotal)}</b></div>
        </div>
        <div className="rounded border border-neutral-800 p-3">
          <div className="font-medium mb-1">Sets represented</div>
          <div className="flex flex-wrap gap-1 text-[11px]">{setsTop.length? setsTop.map(s=> (<span key={s.set} className="px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800">{s.set} • {s.count}</span>)) : <span className="text-xs opacity-70">—</span>}</div>
        </div>
        <div className="rounded border border-neutral-800 p-3">
          <div className="font-medium mb-1">Rarity breakdown</div>
          <div className="space-y-1 text-xs">{rarityHist.map(r=> (<div key={r.label} className="flex items-center justify-between"><span className="opacity-80">{r.label}</span><span className="font-mono">{r.value}</span></div>))}</div>
        </div>
        <div className="rounded border border-neutral-800 p-3">
          <div className="font-medium mb-1">Type histogram</div>
          <div className="space-y-1 text-xs">{typeHist.map(r=> (<div key={r.label} className="flex items-center justify-between"><span className="opacity-80">{r.label}</span><span className="font-mono">{r.value}</span></div>))}</div>
        </div>
      </aside>

      {preview}
    </div>
  );
}
