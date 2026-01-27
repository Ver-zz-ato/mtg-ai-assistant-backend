"use client";

import React from "react";
import CollectionPriceHistory from "@/components/CollectionPriceHistory";
import CardRowPreviewLeft from "@/components/shared/CardRowPreview";
import { DualRange } from "@/components/shared/DualRange";

// Read-only binder client matching owner view styling and layout
export default function BinderClient({ collectionId }: { collectionId: string }){
  const [items, setItems] = React.useState<Array<{ id?: string; name: string; qty: number }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string|undefined>(undefined);

  const [filterText, setFilterText] = React.useState("");
  const [debouncedFilter, setDebouncedFilter] = React.useState("");
  React.useEffect(()=>{ const t=setTimeout(()=>setDebouncedFilter(filterText.trim().toLowerCase()), 200); return ()=>clearTimeout(t); }, [filterText]);

  // Metadata via Scryfall: set, rarity, type_line, color_identity
  const metaRef = React.useRef<Map<string, { set?: string; rarity?: string; type_line?: string; colors?: string[] }>>(new Map());
  const imagesRef = React.useRef<Record<string, { small?: string; normal?: string }>>({});

  // Prices - use cache first
  const [currency, setCurrency] = React.useState<'USD'|'EUR'|'GBP'>('USD');
  React.useEffect(()=>{ try{ const saved = localStorage.getItem('price_currency') as any; if(saved && (saved==='USD'||saved==='EUR'||saved==='GBP')) setCurrency(saved); }catch{} }, []);
  React.useEffect(()=>{ try{ localStorage.setItem('price_currency', currency); }catch{} }, [currency]);
  const [priceMap, setPriceMap] = React.useState<Record<string, number>>({});
  const [valueUSD, setValueUSD] = React.useState<number | null>(null);

  // Hover preview
  const [pv, setPv] = React.useState<{ src: string; x: number; y: number; shown: boolean; below: boolean }>({ 
    src: "", x: 0, y: 0, shown: false, below: false 
  });

  const norm=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
  const n = norm;

  React.useEffect(()=>{ (async()=>{
    setLoading(true); setError(undefined);
    try{
      const r = await fetch(`/api/collections/cards?collectionId=${encodeURIComponent(collectionId)}`, { cache:'no-store' });
      const j = await r.json().catch(()=>({}));
      if(!r.ok || j?.ok===false) throw new Error(j?.error||'load failed');
      const arr = (j.items||[]).map((it:any)=>({ id: it.id, name: it.name, qty: Number(it.qty)||0 }));
      setItems(arr);
    }catch(e:any){ setError(e?.message||'load failed'); }
    finally{ setLoading(false); }
  })(); }, [collectionId]);

  // Price fetching - use cache first
  React.useEffect(()=>{ (async()=>{
    try{
      const names = Array.from(new Set(items.map(i=>i.name)));
      if(!names.length){ setPriceMap({}); setValueUSD(0); return; }
      
      // Step 1: Try cache first (via /api/price which uses price_cache table)
      const r1 = await fetch('/api/price', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ names, currency }), cache: 'no-store' });
      const j1 = await r1.json().catch(()=>({ ok:false }));
      let prices: Record<string, number> = (r1.ok && j1?.ok && j1.prices) ? j1.prices : {};
      
      // Log cache statistics
      const cachedCount = Object.keys(prices).filter(k => prices[k] > 0).length;
      const missingNames = names.filter(name => !prices[norm(name)] || prices[norm(name)] === 0);
      if (missingNames.length > 0 || cachedCount > 0) {
        console.log(`Price loading: Found ${cachedCount}/${names.length} prices from cache`);
      }
      
      // Step 2: Find missing cards and fetch from Scryfall (only if cache didn't have them)
      if (missingNames.length > 0) {
        try {
          // Process in batches of 75 (Scryfall's limit)
          for (let i = 0; i < missingNames.length; i += 75) {
            const batch = missingNames.slice(i, i + 75);
            const identifiers = batch.map(n=>({ name: n }));
            const r2 = await fetch('https://api.scryfall.com/cards/collection', {
              method:'POST',
              headers:{'content-type':'application/json'},
              body: JSON.stringify({ identifiers })
            });
            const j2:any = await r2.json().catch(()=>({}));
            const arr:any[] = Array.isArray(j2?.data)? j2.data: [];
            
            for (const c of arr) {
              const nm = norm(c?.name||'');
              const cardPrices = c?.prices || {};
              const key = currency==='EUR' ? 'eur' : currency==='GBP' ? 'gbp' : 'usd';
              
              let v = cardPrices?.[key];
              
              // For GBP, convert from USD if needed
              if ((!v || v === null || v === 0) && currency === 'GBP' && cardPrices?.usd) {
                try {
                  const { getRates } = await import('@/lib/currency/rates');
                  const rates = await getRates();
                  const usdValue = Number(cardPrices.usd);
                  if (usdValue > 0) {
                    v = Number((usdValue * rates.usd_gbp).toFixed(2));
                  }
                } catch (fxError) {
                  const usdValue = Number(cardPrices.usd);
                  if (usdValue > 0) {
                    v = Number((usdValue * 0.78).toFixed(2));
                  }
                }
              }
              
              if (v!=null && v > 0 && !isNaN(Number(v))) {
                prices[nm] = Number(v);
              }
            }
          }
        } catch (scryfallError) {
          // Continue with whatever prices we have from cache
          console.warn('[BinderClient] Scryfall price fetch failed:', scryfallError);
        }
      }
      
      const total = items.reduce((acc,it)=> acc + (prices[norm(it.name)]||0)*it.qty, 0);
      setPriceMap(prices);
      setValueUSD(total);
    }catch(err){ 
      console.error('[BinderClient] Price loading error:', err);
      setPriceMap({}); 
      setValueUSD(0); 
    }
  })(); }, [items.map(i=>i.name).join('|'), currency]);

  React.useEffect(()=>{ (async()=>{
    try{
      const names = Array.from(new Set(items.map(i=>i.name))).slice(0, 400);
      if(!names.length) { imagesRef.current = {}; return; }
      
      // Use cached image API instead of direct Scryfall calls
      const chunked: string[][] = []; 
      for(let i=0;i<names.length;i+=100) chunked.push(names.slice(i,i+100));
      
      const obj: any = {}; 
      for(const part of chunked){
        try {
          // Use batch-images API which uses scryfall_cache database
          const rr = await fetch('/api/cards/batch-images', { 
            method:'POST', 
            headers:{'content-type':'application/json'}, 
            body: JSON.stringify({ names: part }),
            cache: 'no-store'
          });
          const jj:any = rr.ok? await rr.json().catch(()=>({})) : {};
          const data:any[] = Array.isArray(jj?.data)? jj.data : [];
          
          for(const c of data){
            const key = norm(c?.name||'');
            if(c?.image_uris){
              obj[key] = { 
                small: c.image_uris.small, 
                normal: c.image_uris.normal,
                art_crop: c.image_uris.art_crop
              };
            }
          }
        } catch (err) {
          console.warn('[BinderClient] Image fetch error for batch:', err);
        }
      }
      
      imagesRef.current = obj;
      
      // Also fetch metadata
      for(const part of chunked){
        try {
          const rr = await fetch('/api/cards/batch-metadata', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ names: part }) });
          const jj:any = rr.ok? await rr.json().catch(()=>({})) : {};
          const data:any[] = Array.isArray(jj?.data)? jj.data : [];
          for(const c of data){
            const key = norm(c?.name||'');
            metaRef.current.set(key, { set: String(c?.set||'').toUpperCase(), rarity: String(c?.rarity||'').toLowerCase(), type_line: String(c?.type_line||''), colors: Array.isArray(c?.color_identity)? c.color_identity: [] });
          }
        } catch (err) {
          console.warn('[BinderClient] Metadata fetch error for batch:', err);
        }
      }
    }catch(err){ 
      console.error('[BinderClient] Image loading error:', err);
      imagesRef.current = {}; 
    }
  })(); }, [items.map(i=>i.name).join('|')]);

  // Color pie
  const [colorCounts, setColorCounts] = React.useState<Record<string, number>>({ W:0, U:0, B:0, R:0, G:0 });
  React.useEffect(()=>{ (async()=>{
    try{
      const names = Array.from(new Set(items.map(i=>i.name))).slice(0, 300);
      if(!names.length) { setColorCounts({W:0,U:0,B:0,R:0,G:0}); return; }
      const chunks: string[][] = [];
      for(let i=0;i<names.length;i+=75) chunks.push(names.slice(i,i+75));
      const counts = { W:0,U:0,B:0,R:0,G:0 } as Record<string, number>;
      for(const part of chunks){
        const body = { identifiers: part.map(n=>({ name:n })) };
        const r = await fetch('https://api.scryfall.com/cards/collection', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
        const j:any = r.ok ? await r.json().catch(()=>({})) : {};
        const data:any[] = Array.isArray(j?.data)? j.data : [];
        for(const c of data){
          const ci: string[] = Array.isArray(c?.color_identity)? c.color_identity : [];
          if(ci.length){ const share = 1/ci.length; for(const k of ci){ if(counts[k]!=null) counts[k]+=share; } }
        }
      }
      setColorCounts(counts);
    }catch{ setColorCounts({W:0,U:0,B:0,R:0,G:0}); }
  })(); }, [items]);

  // Sets and rarity
  const [allSets, setAllSets] = React.useState<Array<{ set: string; count: number }>>([]);
  React.useEffect(()=>{ (async()=>{
    try{
      const names = Array.from(new Set(items.map(i=>i.name))).slice(0, 300);
      if(!names.length){ setAllSets([]); return; }
      const chunks: string[][] = []; for(let i=0;i<names.length;i+=75) chunks.push(names.slice(i,i+75));
      const counts = new Map<string, number>();
      for(const part of chunks){
        const body = { identifiers: part.map(n=>({ name:n })) };
        const r = await fetch('https://api.scryfall.com/cards/collection', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
        const j:any = r.ok? await r.json().catch(()=>({})) : {};
        const data:any[] = Array.isArray(j?.data)? j.data : [];
        for(const c of data){
          const code = String(c?.set||'').toUpperCase(); if(code) counts.set(code, (counts.get(code)||0)+1);
        }
      }
      const all = Array.from(counts.entries()).map(([set,count])=>({ set, count })).sort((a,b)=>b.count-a.count);
      setAllSets(all);
    }catch{ setAllSets([]); }
  })(); }, [items]);

  // Filters
  const [fColors, setFColors] = React.useState<string[]>([]);
  const [fRarity, setFRarity] = React.useState<string[]>([]);
  const [fSets, setFSets] = React.useState<string[]>([]);
  const [fTypes, setFTypes] = React.useState<string[]>([]);
  const [fPrice, setFPrice] = React.useState<string>('');
  const [fQtyMin, setFQtyMin] = React.useState<number>(0);
  const [pMin, setPMin] = React.useState<number|''>('');
  const [pMax, setPMax] = React.useState<number|''>('');
  const [filtersExpanded, setFiltersExpanded] = React.useState(false);
  
  // Calculate active filter count
  const activeFilterCount = React.useMemo(() => {
    return fColors.length + fRarity.length + fSets.length + fTypes.length + 
           (fPrice ? 1 : 0) + (fQtyMin > 0 ? 1 : 0) + (pMin !== '' || pMax !== '' ? 1 : 0);
  }, [fColors, fRarity, fSets, fTypes, fPrice, fQtyMin, pMin, pMax]);

  const filtered = React.useMemo(()=>{
    let arr = items.slice();
    if(debouncedFilter) arr = arr.filter(i=> i.name.toLowerCase().includes(debouncedFilter));
    if(fQtyMin>0) arr = arr.filter(i=> i.qty >= fQtyMin);
    if(fSets.length) arr = arr.filter(i=> fSets.includes((metaRef.current.get(norm(i.name))?.set||'').toUpperCase()));
    if(fRarity.length) arr = arr.filter(i=> fRarity.includes((metaRef.current.get(norm(i.name))?.rarity||'').toLowerCase()));
    if(fTypes.length) arr = arr.filter(i=> { const tl=(metaRef.current.get(norm(i.name))?.type_line||'').toLowerCase(); return fTypes.some(t=> tl.includes(t.toLowerCase())); });
    if(fColors.length){ arr = arr.filter(i=>{ const colors = (metaRef.current.get(norm(i.name))?.colors||[]) as string[]; if(fColors.includes('C')) return colors.length===0; return colors.some(c=> fColors.includes(c)); }); }
    if(fPrice){ arr = arr.filter(i=>{ const unit = priceMap[norm(i.name)]||0; switch(fPrice){ case '<1': return unit<1; case '1-5': return unit>=1 && unit<5; case '5-20': return unit>=5 && unit<20; case '20+': return unit>=20; default: return true; } }); }
    if(pMin!=='' || pMax!==''){ const lo = pMin===''? -Infinity : Number(pMin); const hi = pMax===''? Infinity : Number(pMax); arr = arr.filter(i=>{ const u=priceMap[norm(i.name)]||0; return u>=lo && u<=hi; }); }
    return arr;
  }, [items, debouncedFilter, fQtyMin, fSets.join('|'), fRarity.join('|'), fTypes.join('|'), fColors.join('|'), fPrice, pMin, pMax, priceMap]);

  const calcPos = (e: MouseEvent | any) => {
    try{ const vw=window.innerWidth, vh=window.innerHeight, margin=12, boxW=320, boxH=460, half=boxW/2; const rawX=e.clientX as number, rawY=e.clientY as number; const below = rawY - boxH - margin < 0; const x=Math.min(vw-margin-half, Math.max(margin+half, rawX)); const y = below ? Math.min(vh - margin, rawY + margin) : Math.max(margin + 1, rawY - margin); return { x, y, below }; } catch { return { x: (e as any).clientX||0, y: (e as any).clientY||0, below:false }; }
  };

  const totalCards = filtered.reduce((s,i)=>s+i.qty,0);
  const unique = filtered.length;
  const estTotal = valueUSD !== null ? valueUSD : filtered.reduce((acc,it)=> acc + (priceMap[norm(it.name)]||0)*it.qty, 0);

  // Sets and rarity breakdown
  const setsTop = React.useMemo(()=>{ const m = new Map<string, number>(); for(const it of filtered){ const code=(metaRef.current.get(norm(it.name))?.set||''); if(!code) continue; m.set(code, (m.get(code)||0)+it.qty); } return Array.from(m.entries()).map(([set,count])=>({ set, count })).sort((a,b)=>b.count-a.count).slice(0,10); }, [filtered]);
  const rarityHist = React.useMemo(()=>{ const m = new Map<string, number>(); for(const it of filtered){ const r=(metaRef.current.get(norm(it.name))?.rarity||''); if(!r) continue; m.set(r, (m.get(r)||0)+it.qty); } return Array.from(m.entries()).map(([label,value])=>({ label, value })); }, [filtered]);
  const typeHist = React.useMemo(()=>{ const buckets=['creature','instant','sorcery','land','artifact','enchantment']; const m = new Map<string, number>(); for(const b of buckets) m.set(b,0); for(const it of filtered){ const tl=(metaRef.current.get(norm(it.name))?.type_line||'').toLowerCase(); for(const b of buckets){ if(tl.includes(b)) m.set(b, (m.get(b)||0)+it.qty); } } return Array.from(m.entries()).map(([label,value])=>({ label, value })); }, [filtered]);

  // Price buckets
  const [buckets, setBuckets] = React.useState<Array<{ label:string; value:number }>>([]);
  React.useEffect(()=>{ (async()=>{
    try{
      const r = await fetch(`/api/collections/${encodeURIComponent(collectionId)}/price-buckets?currency=${encodeURIComponent(currency)}`, { cache:'no-store' });
      const j = await r.json().catch(()=>({ ok:false }));
      if(j?.ok !== false){ setBuckets((j.buckets||[]).map((b:any)=>({ label:b.bucket, value:Number(b.count||0) }))); }
    }catch{}
  })(); }, [collectionId, currency]);

  function ColorPie(){
    const order:[keyof typeof colorCounts, string][] = [['W','#f3f2e1'],['U','#70a0d0'],['B','#6a5c6a'],['R','#d2756a'],['G','#6db07b']];
    const sum = Object.values(colorCounts).reduce((a,b)=>a+b,0) || 1;
    const segs = order.map(([k,col])=> ({ k, col, pct: (colorCounts[k]/sum)*100 }));
    let grad = "conic-gradient(";
    let acc = 0;
    segs.forEach((s,i)=>{ const start = acc; acc += s.pct; grad += `${s.col} ${start}% ${acc}%${i<segs.length-1?',':''}`; });
    grad += ")";
    return (
      <div className="flex items-center gap-2">
        <div className="w-16 h-16 rounded-full border border-neutral-700" style={{ background: grad }} aria-label="color pie" />
        <div className="text-xs space-y-0.5">
          {order.map(([k,col])=> { const sum = Object.values(colorCounts).reduce((a,b)=>a+b,0)||1; const pct = Math.round(((colorCounts[k]||0)/sum)*100); return (<div key={k} className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded" style={{ background: col }}></span>{k}: {pct}%</div>); })}
        </div>
      </div>
    );
  }

  function BarList({ data, total }: { data: Array<{ label:string; value:number }>; total?: number }){
    const sum = (total ?? data.reduce((s,d)=>s+d.value,0)) || 1;
    return (
      <div className="space-y-1">
        {data.map((d)=> (
          <div key={d.label} className="text-xs">
            <div className="flex items-center justify-between"><span className="opacity-80">{d.label}</span><span className="font-mono">{d.value}</span></div>
            <div className="h-2 rounded bg-neutral-900 overflow-hidden"><div className="h-2" style={{ width: `${Math.max(2, (d.value/sum)*100)}%`, background: '#4ade80' }} /></div>
          </div>
        ))}
      </div>
    );
  }

  const sym = currency==='EUR'?'€':(currency==='GBP'?'£':'$');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-10 gap-6">
      <div className="lg:col-span-2 xl:col-span-7 flex flex-col gap-3">
        {/* Sticky Search + Currency */}
        <div className="sticky top-0 z-10 bg-neutral-950/95 backdrop-blur px-0 pt-0 pb-2 border-b border-neutral-900">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm font-medium">🔍 Search<input value={filterText} onChange={e=>setFilterText(e.target.value)} className="ml-2 w-64 bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"/></label>
            <div className="ml-auto flex items-center gap-2">
              <label className="text-sm font-medium">💰 Currency<select value={currency} onChange={e=>setCurrency(e.target.value as any)} className="ml-2 bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"><option>USD</option><option>EUR</option><option>GBP</option></select></label>
            </div>
          </div>
          {/* Filters Row - Collapsible */}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {/* Filters pill/button - shows when collapsed */}
            {!filtersExpanded && (
              <button 
                onClick={() => setFiltersExpanded(true)}
                className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                  activeFilterCount > 0
                    ? 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700'
                    : 'bg-neutral-900/50 border-neutral-700/50 hover:bg-neutral-800 text-neutral-400'
                }`}
              >
                {activeFilterCount > 0 ? `Filters active (${activeFilterCount})` : 'Filters'}
              </button>
            )}
            
            {filtersExpanded && (
              <>
                {/* Active chips */}
                <div className="w-full flex flex-wrap gap-1">
                  {fColors.map(c=> (<button key={'c-'+c} onClick={()=>setFColors(p=>p.filter(x=>x!==c))} className="px-1.5 py-0.5 rounded-full bg-neutral-900 border border-neutral-700 text-xs">Color: {c} ✕</button>))}
                  {fTypes.map(t=> (<button key={'t-'+t} onClick={()=>setFTypes(p=>p.filter(x=>x!==t))} className="px-1.5 py-0.5 rounded-full bg-neutral-900 border border-neutral-700 text-xs">Type: {t} ✕</button>))}
                  {!!fPrice && (<button onClick={()=>setFPrice('')} className="px-1.5 py-0.5 rounded-full bg-neutral-900 border border-neutral-700 text-xs">Price: {fPrice} ✕</button>)}
                  {fQtyMin>0 && (<button onClick={()=>setFQtyMin(0)} className="px-1.5 py-0.5 rounded-full bg-neutral-900 border border-neutral-700 text-xs">Qty ≥ {fQtyMin} ✕</button>)}
                  {fRarity.map(r=> (<button key={'r-'+r} onClick={()=>setFRarity(p=>p.filter(x=>x!==r))} className="px-1.5 py-0.5 rounded-full bg-neutral-900 border border-neutral-700 text-xs">Rarity: {r} ✕</button>))}
                  {fSets.map(s=> (<button key={'s-'+s} onClick={()=>setFSets(p=>p.filter(x=>x!==s))} className="px-1.5 py-0.5 rounded-full bg-neutral-900 border border-neutral-700 text-xs">Set: {s} ✕</button>))}
                  {(fColors.length||fTypes.length||fPrice||fQtyMin>0||fRarity.length||fSets.length)? (
                    <button onClick={()=>{ setFColors([]); setFRarity([]); setFTypes([]); setFPrice(''); setFSets([]); setFQtyMin(0); setPMin(''); setPMax(''); }} className="ml-2 px-2 py-0.5 rounded-full border border-neutral-700 text-xs">Clear all</button>
                  ) : null}
                </div>
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-neutral-900/50 to-neutral-800/50 border border-neutral-700/50">
              <span className="font-semibold text-sm bg-gradient-to-r from-pink-400 to-purple-500 bg-clip-text text-transparent">🎨 Colors:</span>
              {[
                {k:'W', color:'bg-gray-100', border:'border-gray-300', text:'text-gray-900', name:'White'},
                {k:'U', color:'bg-blue-500', border:'border-blue-400', text:'text-white', name:'Blue'},
                {k:'B', color:'bg-gray-900', border:'border-gray-700', text:'text-white', name:'Black'},
                {k:'R', color:'bg-red-600', border:'border-red-500', text:'text-white', name:'Red'},
                {k:'G', color:'bg-green-600', border:'border-green-500', text:'text-white', name:'Green'},
                {k:'C', color:'bg-neutral-500', border:'border-neutral-400', text:'text-white', name:'Colorless'}
              ].map(({k, color, border, text, name})=> (
                <label key={k} className={`inline-flex items-center gap-1.5 cursor-pointer px-3 py-1.5 rounded-lg transition-all ${fColors.includes(k) ? `${color} ${border} border-2 shadow-md` : 'bg-neutral-800/50 border border-neutral-700 hover:bg-neutral-700/50'}`} title={name}>
                  <input type="checkbox" checked={fColors.includes(k)} onChange={(e)=> setFColors(p=> e.target.checked? [...p,k] : p.filter(x=>x!==k))} className="hidden"/>
                  <span className={`font-bold text-sm ${fColors.includes(k) ? text : 'text-neutral-300'}`}>{k}</span>
                </label>
              ))}
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-neutral-900/50 to-neutral-800/50 border border-neutral-700/50">
              <span className="font-semibold text-sm bg-gradient-to-r from-blue-400 to-cyan-500 bg-clip-text text-transparent">🃏 Type:</span>
              {['creature','instant','sorcery','land','artifact','enchantment'].map(k=> (
                <label key={k} className="inline-flex items-center gap-1.5 cursor-pointer hover:bg-neutral-800/50 px-2 py-1 rounded transition-colors">
                  <input type="checkbox" checked={fTypes.includes(k)} onChange={(e)=> setFTypes(p=> e.target.checked? [...p,k] : p.filter(x=>x!==k))} className="w-4 h-4 rounded border-neutral-600 bg-neutral-950 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"/>
                  <span className="font-medium capitalize">{k}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-col gap-2 px-4 py-3 rounded-lg bg-gradient-to-r from-neutral-900/50 to-neutral-800/50 border border-neutral-700/50">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">💲 Price Range</span>
                <span className="text-xs text-emerald-400 font-mono">{currency} {pMin || 0} - {pMax || 500}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-400 min-w-[40px]">{sym}{pMin || 0}</span>
                <div className="flex-1">
                  <DualRange min={0} max={500} valueMin={pMin} valueMax={pMax} onChange={(lo,hi)=>{ setPMin(lo); setPMax(hi); setFPrice(''); }} />
                </div>
                <span className="text-xs text-neutral-400 min-w-[40px] text-right">{sym}{pMax || 500}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  {label:'Any', min:0, max:500},
                  {label:`< ${sym}1`, min:0, max:1},
                  {label:`${sym}1-5`, min:1, max:5},
                  {label:`${sym}5-20`, min:5, max:20},
                  {label:`${sym}20-50`, min:20, max:50},
                  {label:`${sym}50-100`, min:50, max:100},
                  {label:`${sym}100+`, min:100, max:500}
                ].map(({label, min, max})=> {
                  const isActive = pMin === min && pMax === max;
                  return (
                    <button 
                      key={label} 
                      onClick={()=>{ setPMin(min); setPMax(max); setFPrice(''); }}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                        isActive 
                          ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-md' 
                          : 'bg-neutral-800/50 text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-200'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <details className="ml-auto px-3 py-2 rounded-lg bg-gradient-to-r from-neutral-900/50 to-neutral-800/50 border border-neutral-700/50">
              <summary className="cursor-pointer select-none text-xs font-semibold bg-gradient-to-r from-violet-400 to-indigo-500 bg-clip-text text-transparent">⚙️ Advanced filters</summary>
              <div className="mt-3 flex flex-wrap items-center gap-3 p-2 rounded-lg bg-neutral-950/50 border border-neutral-700/30">
                <label className="text-sm font-medium">Qty ≥<input type="number" min={0} value={fQtyMin} onChange={e=>setFQtyMin(Math.max(0, Number(e.target.value||0)))} className="ml-2 w-20 bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"/></label>
                <label className="text-sm font-medium">Sets<select multiple value={fSets} onChange={(e)=>{ const opts=Array.from(e.currentTarget.selectedOptions).map(o=>o.value); setFSets(opts); }} className="ml-2 bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 min-w-40 max-h-24 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all">{allSets.map(s=> (<option key={s.set} value={s.set}>{s.set} ({s.count})</option>))}</select></label>
                <div className="inline-flex items-center gap-2">
                  <span className="text-sm font-medium">💎 Rarity:</span>
                  {['common','uncommon','rare','mythic'].map(k=> (
                    <label key={k} className="inline-flex items-center gap-1.5 cursor-pointer hover:bg-neutral-800/50 px-2 py-1 rounded transition-colors">
                      <input type="checkbox" checked={fRarity.includes(k)} onChange={(e)=> setFRarity(p=> e.target.checked? [...p,k] : p.filter(x=>x!==k))} className="w-4 h-4 rounded border-neutral-600 bg-neutral-950 text-amber-500 focus:ring-amber-500 focus:ring-offset-0 cursor-pointer"/>
                      <span className="font-medium capitalize">{k}</span>
                    </label>
                  ))}
                </div>
                <button onClick={()=>{ setFColors([]); setFRarity([]); setFTypes([]); setFPrice(''); setFSets([]); setFQtyMin(0); setFilterText(''); }} className="ml-auto px-3 py-1.5 rounded-lg bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-xs font-medium transition-all shadow-md hover:shadow-lg">🗑️ Clear All</button>
              </div>
            </details>
              </>
            )}
          </div>
        </div>

        {loading && <div className="text-xs opacity-70">Loading…</div>}
        {error && <div className="text-xs text-red-500">{String(error)}</div>}

        {!loading && !error && (
          <ul className="divide-y divide-neutral-900 rounded border border-neutral-800 overflow-hidden">
            {filtered.map((it, idx)=>{
              const k = norm(it.name); const img = imagesRef.current[k]?.small; const unit = priceMap[k]||0;
              return (
                <li key={idx} className="flex items-center gap-3 px-3 py-2 hover:bg-neutral-900/30 transition-colors">
                  <span className="w-10 text-right font-mono text-sm">{it.qty}</span>
                  {img ? (
                    <img src={img} alt={it.name} className="w-[24px] h-[34px] object-cover rounded cursor-pointer" 
                      onMouseEnter={(e) => { 
                        const { x, y, below } = calcPos(e as any); 
                        setPv({ src: imagesRef.current[k]?.normal || img, x, y, shown: true, below }); 
                      }}
                      onMouseMove={(e) => { 
                        const { x, y, below } = calcPos(e as any); 
                        setPv(p => p.shown ? { ...p, x, y, below } : p); 
                      }}
                      onMouseLeave={() => setPv(p => ({ ...p, shown: false }))}
                    />
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
        {/* Overview */}
        <div className="rounded-xl border-2 border-neutral-600 bg-gradient-to-b from-neutral-900/95 to-neutral-950 shadow-xl">
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse shadow-lg shadow-cyan-400/50"></div>
              <span className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">Overview</span>
            </div>
            <div className="text-base font-semibold">Cards: <b className="font-mono text-cyan-400">{totalCards}</b></div>
            <div className="text-base font-semibold">Unique: <b className="font-mono text-cyan-400">{unique}</b></div>
            <div className="text-base font-semibold flex items-center gap-2">Value: <b className="font-mono text-cyan-400">{estTotal!=null? new Intl.NumberFormat(undefined, { style:'currency', currency }).format(estTotal): '—'}</b>
              <select value={currency} onChange={e=>setCurrency(e.target.value as any)} className="ml-auto bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs"><option>USD</option><option>EUR</option><option>GBP</option></select>
            </div>
          </div>
        </div>
        
        {/* Color pie */}
        <details open className="rounded-xl border border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950 shadow-lg">
          <summary className="cursor-pointer select-none px-4 py-3 list-none">
            <div className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-purple-400 animate-pulse shadow-lg shadow-purple-400/50"></div>
              <span className="text-base font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">Color pie</span>
            </div>
          </summary>
          <div className="p-3 space-y-2">
            <ColorPie />
            {(() => {
              const sum = Object.values(colorCounts).reduce((a,b)=>a+b,0) || 1;
              const order:[keyof typeof colorCounts, string][] = [['W','White'],['U','Blue'],['B','Black'],['R','Red'],['G','Green']];
              const topColors = order
                .map(([k]) => ({ k, val: (colorCounts[k]||0)/sum }))
                .filter(({val}) => val > 0)
                .sort((a,b) => b.val - a.val)
                .slice(0, 2);
              
              if (topColors.length >= 2 && topColors[0].val > 0.25 && topColors[1].val > 0.25) {
                const colorNames: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
                return (
                  <p className="text-xs text-neutral-400 italic mt-2">
                    {colorNames[topColors[0].k]} and {colorNames[topColors[1].k]} dominate this collection
                  </p>
                );
              } else if (topColors.length > 0 && topColors[0].val > 0.4) {
                const colorNames: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
                return (
                  <p className="text-xs text-neutral-400 italic mt-2">
                    Heavily skewed toward {colorNames[topColors[0].k]}
                  </p>
                );
              }
              return null;
            })()}
          </div>
        </details>
        
        {/* Price history */}
        <details open className="rounded-xl border border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950 shadow-lg">
          <summary className="cursor-pointer select-none px-4 py-3 list-none">
            <div className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-amber-400 animate-pulse shadow-lg shadow-amber-400/50"></div>
              <span className="text-base font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">Price history</span>
            </div>
          </summary>
          <div className="p-3 space-y-2">
            <CollectionPriceHistory collectionId={collectionId} currency={currency} />
          </div>
        </details>
        
        {/* Type histogram */}
        <details className="rounded-xl border border-neutral-700/60 bg-gradient-to-b from-neutral-900/80 to-neutral-950/80 shadow-md">
          <summary className="cursor-pointer select-none px-4 py-2.5 list-none">
            <div className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-sky-400/70 animate-pulse shadow-sm shadow-sky-400/30"></div>
              <span className="text-sm font-semibold text-neutral-300">Type histogram</span>
            </div>
          </summary>
          <div className="p-3"><BarList data={typeHist} /></div>
        </details>
        
        {/* Price distribution */}
        <details className="rounded-xl border border-neutral-700/60 bg-gradient-to-b from-neutral-900/80 to-neutral-950/80 shadow-md">
          <summary className="cursor-pointer select-none px-4 py-2.5 list-none">
            <div className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-green-400/70 animate-pulse shadow-sm shadow-green-400/30"></div>
              <span className="text-sm font-semibold text-neutral-300">Price distribution</span>
            </div>
          </summary>
          <div className="p-3"><BarList data={buckets} /></div>
        </details>
        
        {/* Sets */}
        <details className="rounded-xl border border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950 shadow-lg">
          <summary className="cursor-pointer select-none px-4 py-3 list-none">
            <div className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-indigo-400 animate-pulse shadow-lg shadow-indigo-400/50"></div>
              <span className="text-base font-bold bg-gradient-to-r from-indigo-400 to-violet-500 bg-clip-text text-transparent">Sets</span>
            </div>
          </summary>
          <div className="p-3">
            <div className="flex flex-wrap gap-1 text-[11px]">{allSets.length? allSets.map(s=> (
              <span key={s.set} className="px-2 py-1 rounded-lg bg-gradient-to-r from-neutral-800 to-neutral-700 border border-neutral-600">{s.set} • {s.count}</span>
            )) : <span className="text-xs opacity-70">—</span>}</div>
          </div>
        </details>
      </aside>

      {/* Hover preview */}
      {pv.shown && typeof window !== 'undefined' && (
        <div 
          className="fixed z-[9999] pointer-events-none" 
          style={{ 
            left: pv.x, 
            top: pv.y, 
            transform: `translate(-50%, ${pv.below ? '0%' : '-100%'})` 
          }}
        >
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl w-72 md:w-80 transition-opacity duration-150 ease-out opacity-100" style={{ minWidth: '18rem' }}>
            <img 
              src={pv.src} 
              alt="preview" 
              className="block w-full h-auto max-h-[70vh] max-w-none object-contain rounded" 
            />
          </div>
        </div>
      )}
    </div>
  );
}
