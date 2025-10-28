"use client";

import React from "react";
import ExportCollectionCSV from "@/components/ExportCollectionCSV";
import CollectionCsvUpload from "@/components/CollectionCsvUpload";
import { getImagesForNames } from "@/lib/scryfall";
import Sparkline from "@/components/Sparkline";

function BarList({ data, total, colors, onClick }: { data: Array<{ label:string; value:number }>; total?: number; colors?: string[]; onClick?: (label:string)=>void }){
  const sum = (total ?? data.reduce((s,d)=>s+d.value,0)) || 1;
  return (
    <div className="space-y-1">
      {data.map((d,i)=> (
        <button key={d.label} className="text-left w-full text-xs" onClick={()=> onClick?.(d.label)}>
          <div className="flex items-center justify-between"><span className="opacity-80">{d.label}</span><span className="font-mono">{d.value}</span></div>
          <div className="h-2 rounded bg-neutral-900 overflow-hidden"><div className="h-2" style={{ width: `${Math.max(2, (d.value/sum)*100)}%`, background: colors?.[i% (colors.length||1)] || '#4ade80' }} /></div>
        </button>
      ))}
    </div>
  );
}

function AnalyticsCards({ collectionId, currency, onTypeClick, onBucketClick }: { collectionId: string; currency: 'USD'|'EUR'|'GBP'; onTypeClick?: (t:string)=>void; onBucketClick?: (b:string)=>void }){
  const [typeData, setTypeData] = React.useState<Array<{ label:string; value:number }>>([]);
  const [buckets, setBuckets] = React.useState<Array<{ label:string; value:number }>>([]);
  React.useEffect(()=>{ (async()=>{
    try{
      const r = await fetch(`/api/collections/${encodeURIComponent(collectionId)}/stats`, { cache:'no-store' });
      const j = await r.json().catch(()=>({ ok:false }));
      if(j?.ok !== false){
        const types = j?.type_hist||{};
        const td = [ 'creature','instant','sorcery','land','artifact','enchantment' ].map(k=>({ label: k, value: Number(types?.[k]||0) }));
        setTypeData(td);
      }
    } catch{}
    // Fallback if API not available or all zero
    try{
      const isEmpty = (arr: any[]) => !Array.isArray(arr) || arr.reduce((s,x)=>s+(Number(x?.value)||0),0)===0;
      if (isEmpty(typeData)) {
        const r2 = await fetch(`/api/collections/cards?collectionId=${encodeURIComponent(collectionId)}`, { cache:'no-store' });
        const j2 = await r2.json().catch(()=>({}));
        const items: Array<{ name:string; qty:number }> = Array.isArray(j2?.items)? j2.items : [];
        const names = Array.from(new Set(items.map(i=>i.name))).slice(0, 300);
        const chunks: string[][] = []; for(let i=0;i<names.length;i+=75) chunks.push(names.slice(i,i+75));
        const map: Record<string, number> = { creature:0, instant:0, sorcery:0, land:0, artifact:0, enchantment:0 };
        for(const part of chunks){
          const body = { identifiers: part.map(n=>({ name:n })) };
          const rr = await fetch('https://api.scryfall.com/cards/collection', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
          const jj:any = rr.ok? await rr.json().catch(()=>({})) : {};
          const data:any[] = Array.isArray(jj?.data)? jj.data : [];
          for(const c of data){
            const tl = String(c?.type_line||'').toLowerCase();
            for (const key of Object.keys(map)) { if (tl.includes(key)) map[key] += 1; }
          }
        }
        setTypeData(Object.entries(map).map(([label,value])=>({ label, value })));
      }
    } catch{}
  })(); }, [collectionId]);
  React.useEffect(()=>{ (async()=>{
    try{
      const r = await fetch(`/api/collections/${encodeURIComponent(collectionId)}/price-buckets?currency=${encodeURIComponent(currency)}`, { cache:'no-store' });
      const j = await r.json().catch(()=>({ ok:false }));
      if(j?.ok !== false){ setBuckets((j.buckets||[]).map((b:any)=>({ label:b.bucket, value:Number(b.count||0) }))); }
    } catch{}
  })(); }, [collectionId, currency]);
  return (
    <>
      <details className="rounded-xl border border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950 shadow-lg">
        <summary className="cursor-pointer select-none px-4 py-3 list-none">
          <div className="flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-sky-400 animate-pulse shadow-lg shadow-sky-400/50"></div>
            <span className="text-base font-bold bg-gradient-to-r from-sky-400 to-blue-500 bg-clip-text text-transparent">Type histogram</span>
          </div>
        </summary>
        <div className="p-3"><BarList data={typeData} onClick={(label)=> onTypeClick?.(label)} /></div>
      </details>
      <details className="rounded-xl border border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950 shadow-lg">
        <summary className="cursor-pointer select-none px-4 py-3 list-none">
          <div className="flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-green-400 animate-pulse shadow-lg shadow-green-400/50"></div>
            <span className="text-base font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">Price distribution</span>
          </div>
        </summary>
        <div className="p-3"><BarList data={buckets} onClick={(label)=> onBucketClick?.(label)} /></div>
      </details>
    </>
  );
}

// Lightweight Wishlist comparison panel
function WishlistCompareCard({ collectionId, currency }: { collectionId: string; currency: 'USD'|'EUR'|'GBP' }){
  const [wishlists, setWishlists] = React.useState<Array<{ id: string; name: string; card_count?: number }>>([]);
  const [selectedId, setSelectedId] = React.useState<string>('');
  const [loading, setLoading] = React.useState(false);
  const [gaps, setGaps] = React.useState<Array<{ card_name: string; quantity_missing: number; avg_price?: number }>>([]);

  React.useEffect(()=>{
    let alive = true;
    (async()=>{
      try{
        const r = await fetch('/api/wishlists', { cache:'no-store' });
        const j = await r.json().catch(()=>({}));
        if(alive && r.ok){ setWishlists(Array.isArray(j?.wishlists)? j.wishlists : (Array.isArray(j)? j : [])); }
      }catch{}
    })();
    return ()=>{ alive=false; };
  }, []);

  async function compare(){
    if(!selectedId) return;
    setLoading(true);
    try{
      const r = await fetch(`/api/collections/${encodeURIComponent(collectionId)}/compare-wishlist?wishlist_id=${encodeURIComponent(selectedId)}`, { cache:'no-store' });
      const j = await r.json().catch(()=>({}));
      if(r.ok){ setGaps(Array.isArray(j?.gaps)? j.gaps : (Array.isArray(j)? j : [])); }
    }catch{}
    finally{ setLoading(false); }
  }

  const est = gaps.reduce((s,g)=> s + (Number(g.quantity_missing)||0) * (Number(g.avg_price)||0), 0);

  return (
    <div className="p-3 space-y-2 text-sm">
      <div className="flex gap-2">
        <select value={selectedId} onChange={e=>setSelectedId(e.target.value)} className="flex-1 bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm">
          <option value="">Select wishlist…</option>
          {wishlists.map(w=> (<option key={w.id} value={w.id}>{w.name}{typeof w.card_count==='number'? ` (${w.card_count})`: ''}</option>))}
        </select>
        <button onClick={compare} disabled={!selectedId||loading} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-medium transition-all shadow-md hover:shadow-lg disabled:opacity-50">{loading? 'Comparing…':'Compare'}</button>
      </div>
      {gaps.length>0 && (
        <div className="space-y-1">
          <div className="text-xs opacity-80">Missing {gaps.length} cards • Est. cost {new Intl.NumberFormat(undefined,{ style:'currency', currency }).format(est)}</div>
          <div className="max-h-32 overflow-auto space-y-0.5">
            {gaps.slice(0,12).map((g,i)=>(
              <div key={`${g.card_name}-${i}`} className="flex justify-between text-xs">
                <span className="truncate mr-2">{g.card_name}</span>
                <span className="opacity-70">x{g.quantity_missing}</span>
              </div>
            ))}
            {gaps.length>12 && (<div className="text-[11px] opacity-60">…and {gaps.length-12} more</div>)}
          </div>
        </div>
      )}
    </div>
  );
}

// Lightweight Export/Share panel (public binder toggle + link)
function ExportShareCard({ collectionId }: { collectionId: string }){
  const [isPublic, setIsPublic] = React.useState(false);
  const [slug, setSlug] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [slugOk, setSlugOk] = React.useState<undefined|boolean>(undefined);
  const [checking, setChecking] = React.useState(false);

  React.useEffect(()=>{
    let alive = true;
    (async()=>{
      try{
        const r = await fetch(`/api/collections/${encodeURIComponent(collectionId)}/meta`, { cache:'no-store' });
        const j = await r.json().catch(()=>({}));
        if(alive && r.ok){
          const meta = j?.meta?? j;
          setIsPublic(Boolean(meta?.is_public));
          setSlug(String(meta?.public_slug||''));
        }
      }catch{}
    })();
    return ()=>{ alive=false; };
  }, [collectionId]);

  // Debounced slug validation
  React.useEffect(()=>{
    if (!slug) { setSlugOk(undefined); return; }
    const h = setTimeout(async ()=>{
      setChecking(true);
      try{
        const r = await fetch(`/api/collections/slug?slug=${encodeURIComponent(slug)}`, { cache:'no-store' });
        const j = await r.json().catch(()=>({}));
        if(r.ok){ setSlugOk(Boolean(j?.available)); } else { setSlugOk(false); }
      }catch{ setSlugOk(false); }
      finally{ setChecking(false); }
    }, 250);
    return ()=> clearTimeout(h);
  }, [slug]);

  async function togglePublic(){
    if (!isPublic && slug && slugOk === false) return; // prevent enabling with invalid slug
    setBusy(true);
    try{
      const body:any = { is_public: !isPublic };
      if(!isPublic){ body.public_slug = slug || `collection-${Date.now()}`; }
      const r = await fetch(`/api/collections/${encodeURIComponent(collectionId)}/meta`, { method:'PUT', headers:{ 'content-type':'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(()=>({}));
      if(r.ok){
        const meta = j?.meta?? j;
        setIsPublic(Boolean(meta?.is_public));
        setSlug(String(meta?.public_slug||slug));
      }
    }catch{}
    finally{ setBusy(false); }
  }

  const origin = typeof location!=='undefined'? location.origin : '';
  const url = slug? `${origin}/binder/${slug}` : '';

  async function copyLink(){ if(!url) return; try{ await navigator.clipboard.writeText(url); }catch{} }

  function qrSrc(){ if(!url) return ''; const u = encodeURIComponent(url); return `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${u}`; }

  async function downloadQR(){
    const src = qrSrc(); if(!src) return;
    try{
      const r = await fetch(src);
      const b = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `binder-${slug || 'qr'}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=> URL.revokeObjectURL(a.href), 2000);
    }catch{}
  }

  async function doExport(fmt: 'csv'|'mtga'|'mtgo'|'moxfield'){
    const r = await fetch(`/api/collections/${encodeURIComponent(collectionId)}/export?format=${fmt}`);
    if(!r.ok) return;
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `collection-${collectionId}.${fmt==='csv'?'csv': fmt==='mtgo'? 'dek' : 'txt'}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=> URL.revokeObjectURL(a.href), 2000);
  }

  return (
    <div className="p-3 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <span>Public binder</span>
        <button onClick={togglePublic} disabled={busy} className={`relative w-10 h-5 rounded-full ${isPublic? 'bg-green-600':'bg-neutral-600'}`} aria-pressed={isPublic} aria-label="toggle public">
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${isPublic? 'translate-x-5':''}`}></span>
        </button>
      </div>
      {isPublic && (
        <div className="space-y-2">
          <label className="block text-xs opacity-80">Slug
            <input aria-invalid={slugOk===false} value={slug} onChange={e=>setSlug(e.target.value)} placeholder="my-binder" className={`mt-1 w-full bg-neutral-950 border ${slugOk===false? 'border-red-500':'border-neutral-700'} rounded px-2 py-1 text-xs`} />
          </label>
          <div className="flex items-center gap-2 text-[11px] min-h-[18px]">
            {checking && <span className="opacity-60">Checking…</span>}
            {!checking && slug && slugOk===true && <span className="text-emerald-500">Slug available</span>}
            {!checking && slug && slugOk===false && <span className="text-red-500">Slug not available</span>}
          </div>
          <label className="block text-xs opacity-80">Public URL
            <input readOnly value={url} onFocus={e=>e.currentTarget.select()} className="mt-1 w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs" />
          </label>
          {url && (
            <div className="flex items-center gap-2">
              <img src={qrSrc()} alt="QR code" width={80} height={80} className="border border-neutral-700 rounded bg-white" />
              <div className="flex flex-col gap-1">
                <button onClick={copyLink} className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded text-xs">Copy link</button>
                <button onClick={downloadQR} className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded text-xs">Download QR</button>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="border-t border-neutral-800 pt-3 space-y-2">
        <div className="text-sm font-medium">Exports</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <button onClick={()=>doExport('mtga')} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-medium transition-all shadow-md hover:shadow-lg">MTGA</button>
          <button onClick={()=>doExport('mtgo')} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-medium transition-all shadow-md hover:shadow-lg">MTGO</button>
          <button onClick={()=>doExport('moxfield')} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white font-medium transition-all shadow-md hover:shadow-lg">Moxfield</button>
          <button onClick={()=>doExport('csv')} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-500 hover:to-teal-600 text-white font-medium transition-all shadow-md hover:shadow-lg">CSV</button>
        </div>
      </div>
    </div>
  );
}

export type CollectionEditorProps = {
  collectionId: string;
  mode?: "drawer" | "page"; // layout only
};

type Item = { id?: string; name: string; qty: number; created_at?: string };

import FixCollectionNamesModal from "@/components/FixCollectionNamesModal";
import { useProStatus } from "@/hooks/useProStatus";
import { DualRange } from "@/components/shared/DualRange";
import { trackProGateViewed, trackProGateClicked, trackProFeatureUsed } from '@/lib/analytics-pro';
import PriceChip from "@/components/shared/PriceChip";
import { SetIcon, RarityPill } from "@/components/shared/SetRarity";
import CardRowPreviewLeft from "@/components/shared/CardRowPreview";
import CardAutocomplete from "@/components/CardAutocomplete";

function FixNamesButton({ collectionId }: { collectionId: string }){
  const { isPro } = useProStatus();
  const [open, setOpen] = React.useState(false);
  
  // Track PRO gate view when component renders for non-PRO users
  React.useEffect(() => {
    if (!isPro) {
      trackProGateViewed('fix_card_names', 'collection_editor');
    }
  }, [isPro]);
  
  if (!isPro) {
    return (
      <button 
        disabled 
        title="PRO only"
        onClick={() => {
          trackProGateClicked('fix_card_names', 'collection_editor');
        }}
        className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-orange-600/40 to-red-600/40 text-white font-medium text-xs transition-all shadow-md opacity-60 cursor-not-allowed border border-orange-500/30"
      >
        <span className="flex items-center gap-1.5">
          <span>✏️</span>
          <span>Fix names</span>
          <span className="inline-flex items-center rounded bg-amber-300 text-black text-[10px] font-bold px-1.5 py-0.5 uppercase tracking-wide">
            PRO
          </span>
        </span>
      </button>
    );
  }
  return (
    <>
      <button 
        onClick={() => {
          setOpen(true);
          trackProFeatureUsed('fix_card_names');
        }} 
        className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white text-xs font-medium transition-all shadow-md hover:shadow-lg"
      >
        <span className="flex items-center gap-1.5">
          <span>✏️</span>
          <span>Fix names</span>
        </span>
      </button>
      <FixCollectionNamesModal collectionId={collectionId} open={open} onClose={()=>setOpen(false)} />
    </>
  );
}

export default function CollectionEditor({ collectionId, mode = "drawer" }: CollectionEditorProps){
  const [items, setItems] = React.useState<Item[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string|null>(null);
  const [name, setName] = React.useState("");
  const [qty, setQty] = React.useState<number>(1);
  const [toast, setToast] = React.useState<string|null>(null);
  const [tab, setTab] = React.useState<"overview"|"edit"|"stats"|"export">("overview");
  // Page-only state: filters, sort, pending changes, concurrency guard, currency
  const [filterText, setFilterText] = React.useState("");
  const [debouncedFilter, setDebouncedFilter] = React.useState("");
  const searchRef = React.useRef<HTMLInputElement|null>(null);
  const [sortKey, setSortKey] = React.useState<'name'|'qty'|'set'|'color'|'price'>('name');
  const [sortDir, setSortDir] = React.useState<'asc'|'desc'>('asc');
  const [pending, setPending] = React.useState<Map<string, number>>(new Map()); // id->newQty (or temp key 'new:name')
  const [busySave, setBusySave] = React.useState(false);
  const [lastLoadedAt, setLastLoadedAt] = React.useState<string>('');
  const [lastSnapshotAt, setLastSnapshotAt] = React.useState<string>('');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [currency, setCurrency] = React.useState<'USD'|'EUR'|'GBP'>('USD');
  const { isPro } = useProStatus();
  React.useEffect(()=>{ try{ const saved = localStorage.getItem('price_currency') as any; if(saved && (saved==='USD'||saved==='EUR'||saved==='GBP')) setCurrency(saved); }catch{} }, []);
  React.useEffect(()=>{ try{ localStorage.setItem('price_currency', currency); } catch{} }, [currency]);
  // Meta cache for set/color per name
  const metaRef = React.useRef<Map<string,{ set?: string; colors?: string[]; rarity?: string; type_line?: string }>>(new Map());
  const imagesRef = React.useRef<Record<string,{ small?: string; normal?: string }>>({});
  const n = React.useCallback((s:string)=> String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim(), []);

  const showToast = (m:string)=>{ setToast(m); setTimeout(()=>setToast(null), 1200); };

  const reload = React.useCallback(async ()=>{
    if(!collectionId) return;
    setLoading(true); setError(null);
    try{
      const res = await fetch(`/api/collections/cards?collectionId=${encodeURIComponent(collectionId)}`, { cache:'no-store' });
      const j = await res.json().catch(()=>({}));
      if(!res.ok || j?.ok===false) throw new Error(j?.error||'load failed');
      const arr: Item[] = (j.items||[]).map((it:any)=>({ id: it.id, name: it.name, qty: Number(it.qty)||0, created_at: it.created_at }));
      setItems(arr);
      const maxUpdated = arr.map(i=>i.created_at||'').filter(Boolean).sort().pop() || new Date().toISOString();
      setLastLoadedAt(maxUpdated);
    }catch(e:any){ setError(e?.message||'load failed'); }
    finally{ setLoading(false); }
  }, [collectionId]);

  React.useEffect(()=>{ reload(); }, [reload]);

  // Pricing (snapshot totals, default USD; currency selectable on page)
  const [valueUSD, setValueUSD] = React.useState<number|null>(null);
  const [priceMap, setPriceMap] = React.useState<Record<string, number>>({});
  const refreshValue = React.useCallback(async ()=>{
    try{
      const names = Array.from(new Set(items.map(i=>i.name)));
      if(!names.length) { setValueUSD(0); return; }
      const r = await fetch('/api/price/snapshot', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ names, currency }) });
      const j = await r.json().catch(()=>({}));
      if(!r.ok || j?.ok===false) throw new Error(j?.error||'snapshot failed');
      const prices: Record<string, number> = j.prices||{};
      const norm=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
      const total = items.reduce((acc,it)=> acc + (prices[norm(it.name)]||0)*it.qty, 0);
      setPriceMap(prices);
      setValueUSD(total);
    }catch(e:any){ showToast(e?.message||'snapshot failed'); }
  }, [items]);

  React.useEffect(()=>{ if(items.length) refreshValue(); }, [items, refreshValue, currency]);

  // Debounce filter input and keyboard shortcuts
  React.useEffect(()=>{ const t = setTimeout(()=> setDebouncedFilter(filterText.trim().toLowerCase()), 200); return ()=> clearTimeout(t); }, [filterText]);
  React.useEffect(()=>{ const onKey=(e:KeyboardEvent)=>{ if(e.key==='/' && searchRef.current){ e.preventDefault(); searchRef.current.focus(); } }; window.addEventListener('keydown', onKey); return ()=> window.removeEventListener('keydown', onKey); }, []);

  // Color pie (best-effort via Scryfall color_identity)
  const [colorCounts, setColorCounts] = React.useState<Record<string, number>>({ W:0, U:0, B:0, R:0, G:0 });
  const refreshColorPie = React.useCallback(async ()=>{
    try{
      const names = Array.from(new Set(items.map(i=>i.name))).slice(0, 300); // cap for drawer
      if(!names.length) { setColorCounts({W:0,U:0,B:0,R:0,G:0}); return; }
      // Reuse collection endpoint then query Scryfall /cards/collection via helper to minimize code churn.
      // getImagesForNames returns images; for colors, do a direct fetch here (small batch).
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
          // Count a card once by its primary color identity (multicolor split equally)
          if(ci.length){ const share = 1/ci.length; for(const k of ci){ if(counts[k]!=null) counts[k]+=share; } }
        }
      }
      setColorCounts(counts);
    }catch{ setColorCounts({W:0,U:0,B:0,R:0,G:0}); }
  }, [items]);
  React.useEffect(()=>{ if(items.length) refreshColorPie(); }, [items, refreshColorPie]);

  // Mutations
  async function add(){
    if(!collectionId || !name.trim()) return;
    try{ const { containsProfanity } = await import("@/lib/profanity"); if(containsProfanity(name)){ alert('Please choose a different name.'); return; } }catch{}
    const safeName = name.trim();
    const res = await fetch('/api/collections/cards', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ collectionId, name: safeName, qty }) });
    const j = await res.json();
    if(!res.ok || !j?.ok){ alert(j?.error||'Add failed'); return; }
    setName(''); setQty(1); reload(); showToast(`Added x${qty} ${safeName}`);
  }
  async function bump(it: Item, delta:number){
    const res = await fetch('/api/collections/cards', { method:'PATCH', headers:{'content-type':'application/json'}, body: JSON.stringify({ id: it.id, delta }) });
    const j = await res.json(); if(!res.ok || !j?.ok){ alert(j?.error||'Update failed'); return; }
    reload(); if(delta>0) showToast(`Added x${delta} ${it.name}`); else if(delta<0) showToast(`Removed x${Math.abs(delta)} ${it.name}`);
  }
  async function remove(it: Item){
    // INSTANT UPDATE: Remove from UI immediately (optimistic)
    const previousItems = items;
    setItems(prev => prev.filter(i => i.id !== it.id));
    
    // Use undo toast with 8 second window
    const { undoToastManager } = await import('@/lib/undo-toast');
    
    undoToastManager.showUndo({
      id: `remove-collection-card-${it.id}`,
      message: `Removed ${it.name}`,
      duration: 8000,
      onUndo: async () => {
        // Restore card to UI immediately
        setItems(previousItems);
        showToast(`Restored ${it.name}`);
      },
      onExecute: async () => {
        // Actually delete from database (only runs if undo not clicked within 8 seconds)
        try {
          const res = await fetch('/api/collections/cards', { method:'DELETE', headers:{'content-type':'application/json'}, body: JSON.stringify({ id: it.id }) });
          const j = await res.json();
          if(!res.ok || !j?.ok){
            // If delete fails, restore the card
            setItems(previousItems);
            alert(j?.error||'Delete failed');
          }
        } catch (e: any) {
          alert(e?.message || 'Error deleting card');
          // Restore on error
          setItems(previousItems);
        }
      },
    });
  }

  const totalCards = React.useMemo(()=> items.reduce((s,it)=>s+it.qty,0), [items]);
  const unique = items.length;

  // Derived: sets represented (page & drawer) and top sets list (page)
  const [topSets, setTopSets] = React.useState<Array<{ set: string; count: number }>>([]);
  const [allSets, setAllSets] = React.useState<Array<{ set: string; count: number }>>([]);
  const refreshSets = React.useCallback(async ()=>{
    try{
      const names = Array.from(new Set(items.map(i=>i.name))).slice(0, 300);
      if(!names.length){ setTopSets([]); setAllSets([]); return; }
      const chunks: string[][] = []; for(let i=0;i<names.length;i+=75) chunks.push(names.slice(i,i+75));
      const counts = new Map<string, number>();
      for(const part of chunks){
        const body = { identifiers: part.map(n=>({ name:n })) };
        const r = await fetch('https://api.scryfall.com/cards/collection', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
        const j:any = r.ok? await r.json().catch(()=>({})) : {};
        const data:any[] = Array.isArray(j?.data)? j.data : [];
        for(const c of data){
          const code = String(c?.set||'').toUpperCase(); if(code) counts.set(code, (counts.get(code)||0)+1);
          const key=String(c?.name||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
          metaRef.current.set(key, { ...(metaRef.current.get(key)||{}), set: code, colors: Array.isArray(c?.color_identity)? c.color_identity: [], rarity: String(c?.rarity||'').toLowerCase(), type_line: String(c?.type_line||'') });
          imagesRef.current[key] = { small: c?.image_uris?.small || c?.card_faces?.[0]?.image_uris?.small, normal: c?.image_uris?.normal || c?.card_faces?.[0]?.image_uris?.normal };
        }
      }
      const all = Array.from(counts.entries()).map(([set,count])=>({ set, count })).sort((a,b)=>b.count-a.count);
      setAllSets(all);
      setTopSets(all.slice(0,8));
    }catch{ setTopSets([]); setAllSets([]); }
  }, [items]);
  React.useEffect(()=>{ if(items.length) refreshSets(); }, [items, refreshSets]);

  // Filters/sorts (page only)
  // Advanced filter state (right Tools)
  const [filterColors, setFilterColors] = React.useState<string[]>([]); // W U B R G C
  const [filterSets, setFilterSets] = React.useState<string[]>([]);
  const [filterRarity, setFilterRarity] = React.useState<string[]>([]);
  const [filterTypes, setFilterTypes] = React.useState<string[]>([]); // Creature, Instant, etc.
  const [filterQtyMin, setFilterQtyMin] = React.useState<number>(0);
  const [filterPriceBand, setFilterPriceBand] = React.useState<string>(''); // '<1','1-5','5-20','20-50','50-100','100+'

  // Price slider min/max
  const [pMin, setPMin] = React.useState<number|''>('');
  const [pMax, setPMax] = React.useState<number|''>('');

  const filteredSorted = React.useMemo(()=>{
    let arr = items.slice();
    const q = debouncedFilter;
    if(q) arr = arr.filter(i=> i.name.toLowerCase().includes(q));
    // Advanced filters
    if(filterQtyMin>0) arr = arr.filter(i=> i.qty >= filterQtyMin);
    if(filterSets.length) arr = arr.filter(i=> filterSets.includes((metaRef.current.get(n(i.name))?.set||'').toUpperCase()));
    if(filterRarity.length) arr = arr.filter(i=> filterRarity.includes((metaRef.current.get(n(i.name)) as any)?.rarity || ('' as any)));
    if(filterTypes.length) arr = arr.filter(i=> { const tl=(metaRef.current.get(n(i.name)) as any)?.type_line||''; const lc=String(tl).toLowerCase(); return filterTypes.some(t=> lc.includes(t.toLowerCase())); });
    if(filterColors.length){
      arr = arr.filter(i=>{
        const colors = (metaRef.current.get(n(i.name))?.colors||[]) as string[];
        if(filterColors.includes('C')) return colors.length===0; // colorless
        return colors.some(c=> filterColors.includes(c));
      });
    }
    if(filterPriceBand){
      const norm=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
      arr = arr.filter(i=>{
        const unit = priceMap[norm(i.name)]||0;
        switch(filterPriceBand){
          case '<1': return unit<1;
          case '1-5': return unit>=1 && unit<5;
          case '5-20': return unit>=5 && unit<20;
          case '20-50': return unit>=20 && unit<50;
          case '50-100': return unit>=50 && unit<100;
          case '100+': return unit>=100;
          default: return true;
        }
      });
    }
    if(pMin!=='' || pMax!==''){
      const norm=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
      const lo = pMin===''? -Infinity: Number(pMin);
      const hi = pMax===''? Infinity: Number(pMax);
      arr = arr.filter(i=>{ const u = priceMap[norm(i.name)]||0; return u>=lo && u<=hi; });
    }
    if(sortKey==='name') arr.sort((a,b)=> a.name.localeCompare(b.name));
    if(sortKey==='qty') arr.sort((a,b)=> a.qty - b.qty);
    if(sortKey==='set') arr.sort((a,b)=> (metaRef.current.get(n(a.name))?.set||'').localeCompare(metaRef.current.get(n(b.name))?.set||''));
    if(sortKey==='color') arr.sort((a,b)=> (metaRef.current.get(n(a.name))?.colors||[]).join('').localeCompare((metaRef.current.get(n(b.name))?.colors||[]).join('')));
    if(sortKey==='price'){ const norm=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim(); arr.sort((a,b)=> (priceMap[norm(a.name)]||0) - (priceMap[norm(b.name)]||0)); }
    if(sortDir==='desc') arr.reverse();
    return arr;
  }, [items, debouncedFilter, filterQtyMin, filterSets.join(','), filterRarity.join(','), filterTypes.join(','), filterColors.join(','), filterPriceBand, pMin, pMax, sortKey, sortDir, priceMap]);

  // Virtualized list (page): basic windowing
  const listRef = React.useRef<HTMLDivElement|null>(null);
  const rowH = 52; // row height estimate
  const [scrollTop, setScrollTop] = React.useState(0);
  const rAF = React.useRef<number|undefined>(undefined);
  const nextScrollTop = React.useRef<number>(0);
  const [containerH, setContainerH] = React.useState<number>(600);
  React.useLayoutEffect(()=>{
    const el = listRef.current; if (!el || typeof window === 'undefined') return;
    const RO: any = (window as any).ResizeObserver;
    const measure = () => setContainerH(el.clientHeight || 600);
    measure();
    const ro = RO ? new RO(measure) : null;
    ro?.observe(el);
    return () => { try { ro?.disconnect(); } catch {} };
  }, []);
  const visibleCount = Math.max(10, Math.ceil(containerH/rowH));
  const totalH = filteredSorted.length * rowH;
  const startIndex = Math.max(0, Math.floor(scrollTop/rowH)-5);
  const endIndex = Math.min(filteredSorted.length, startIndex + visibleCount + 10);
  const windowed = filteredSorted.slice(startIndex, endIndex);

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

  if(mode==='drawer'){
    // Drawer layout remains tabbed + lightweight
    return (
      <div className='space-y-3'>
        <div className="flex items-center gap-2 text-sm">
          {(['overview','edit','stats','export'] as const).map(t => (
            <button key={t} onClick={()=>setTab(t)} className={`px-2 py-1 rounded border ${tab===t?'bg-neutral-800 border-neutral-600':'bg-neutral-900 border-neutral-800'}`}>{t[0].toUpperCase()+t.slice(1)}</button>
          ))}
        </div>
        {tab==='overview' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950 p-4 space-y-2 shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-1 w-1 rounded-full bg-cyan-400 animate-pulse shadow-lg shadow-cyan-400/50"></div>
                <span className="font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">Mini stats</span>
              </div>
              <div className="text-sm">Cards: <b className="font-mono">{totalCards}</b></div>
              <div className="text-sm">Unique: <b className="font-mono">{unique}</b></div>
              <div className="text-sm">Value ({currency} snapshot): <b className="font-mono">{valueUSD!=null? new Intl.NumberFormat(undefined, { style:'currency', currency }).format(valueUSD) : '—'}</b></div>
              <button onClick={refreshValue} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white text-xs font-medium transition-all shadow-md hover:shadow-lg">Refresh value</button>
            </div>
            <div className="rounded-xl border border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950 p-4 space-y-2 shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-1 w-1 rounded-full bg-purple-400 animate-pulse shadow-lg shadow-purple-400/50"></div>
                <span className="font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">Color pie</span>
              </div>
              <ColorPie />
            </div>
          </div>
        )}
        {tab==='edit' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Card name" className="flex-1 border rounded px-2 py-1 text-sm bg-transparent" onKeyDown={(e)=>{ if(e.key==='Enter') add(); }} />
              <button onClick={add} className="border rounded px-2 py-1 text-sm">Add 1</button>
              <button onClick={()=>{ if(!name.trim()) return; const it = items.find(i=>i.name.toLowerCase()===name.trim().toLowerCase()); if(!it) return showToast('Not found'); bump({ id: it?.id, name: it?.name||name, qty: it?.qty||0 }, -1); }} className="border rounded px-2 py-1 text-sm">Remove 1</button>
            </div>
          </div>
        )}
        {tab==='stats' && (
          <div className="space-y-3">
            <div className="rounded border border-neutral-800 p-3">
              <div className="font-medium mb-1">Snapshot value</div>
              <div className="text-sm">Estimate (USD): <b className="font-mono">{valueUSD!=null? `$${valueUSD.toFixed(2)}` : '—'}</b></div>
              <button onClick={refreshValue} className="mt-2 text-xs px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700">Refresh now</button>
            </div>
            <div className="rounded border border-neutral-800 p-3">
              <div className="font-medium mb-1">Color pie</div>
              <ColorPie />
            </div>
          </div>
        )}
        {tab==='export' && (
          <div className="space-y-3">
            <div className="rounded border border-neutral-800 p-3">
              <div className="font-medium mb-2">Export CSV</div>
              <ExportCollectionCSV collectionId={collectionId} />
            </div>
          </div>
        )}
        {toast && (<div className="pointer-events-none fixed bottom-4 right-4 rounded bg-black/80 text-white text-xs px-3 py-2 shadow">{toast}</div>)}
      </div>
    );
  }

  // Page layout: two-column, left list with filters, right panels with stats/tools. Save/Cancel with concurrency guard.
  const changed = React.useMemo(()=>{
    const map = new Map<string, number>();
    for(const it of items){ map.set(it.id||it.name, it.qty); }
    let dirty = false;
    pending.forEach((v,k)=>{ if(map.get(k)!==v) dirty = true; });
    return dirty;
  }, [pending, items]);

  function setQtyStaged(it: Item, newQty:number){
    const key = it.id || ("new:"+it.name);
    const next = new Map(pending); next.set(key, newQty); setPending(next);
  }

  async function saveAll(){
    if(busySave) return; setBusySave(true);
    // Basic last-updated guard: recheck latest updated and warn if drifted
    try{
      const res = await fetch(`/api/collections/cards?collectionId=${encodeURIComponent(collectionId)}`, { cache:'no-store' });
      const j = await res.json().catch(()=>({}));
      const arr: Item[] = (j.items||[]).map((it:any)=>({ id: it.id, name: it.name, qty: Number(it.qty)||0, created_at: it.created_at }));
      const latest = arr.map(i=>i.created_at||'').filter(Boolean).sort().pop()||'';
      if(latest && lastLoadedAt && latest>lastLoadedAt){
        if(!confirm('This collection changed in another tab. Refresh and lose your staged edits?')){ setBusySave(false); return; } else { setItems(arr); setLastLoadedAt(latest); setPending(new Map()); setBusySave(false); return; }
      }
    } catch{}

    try{
      // Apply diffs naïvely: compare pending against current, send PATCH/DELETE/POST
      for(const it of items){ const key = it.id||it.name; const staged = pending.has(key)? pending.get(key)! : it.qty; const delta = staged - it.qty; if(delta===0) continue; if(it.id){ if(staged<=0){ await fetch('/api/collections/cards', { method:'DELETE', headers:{'content-type':'application/json'}, body: JSON.stringify({ id: it.id }) }); } else { await fetch('/api/collections/cards', { method:'PATCH', headers:{'content-type':'application/json'}, body: JSON.stringify({ id: it.id, delta }) }); } } }
      // New rows in pending using temp keys (none produced yet by UI)
      setPending(new Map()); await reload(); setBusySave(false); showToast('Saved');
    } catch(e:any){ setBusySave(false); showToast(e?.message||'Save failed'); }
  }

  // Undo support
  const [undo, setUndo] = React.useState<{ type:'delete'|'playset'; data:any }|null>(null);
  const undoTimerRef = React.useRef<any>(null);
  function startUndoTimer(){ if(undoTimerRef.current) clearTimeout(undoTimerRef.current); undoTimerRef.current = setTimeout(()=> setUndo(null), 10000); }
  async function doUndo(){
    if(!undo) return; const kind = undo.type; const d = undo.data;
    if(kind==='delete'){
      for(const r of (d.removed||[])){ await fetch('/api/collections/cards', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ collectionId, name: r.name, qty: r.qty }) }); }
      setUndo(null); await reload();
    } else if(kind==='playset'){
      const prev: Map<string, number> = d.prev;
      for(const [id, prevQty] of Array.from(prev.entries())){
        const cur = items.find(i=>i.id===id)?.qty || 0; const delta = prevQty - cur; if(delta!==0){ await fetch('/api/collections/cards', { method:'PATCH', headers:{'content-type':'application/json'}, body: JSON.stringify({ id, delta }) }); }
      }
      setUndo(null); await reload();
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-10 gap-6" style={{ minHeight:'calc(100vh - 140px)' }}>
      {/* Left: filter + virtualized list editor */}
      <div className="flex flex-col h-full overflow-hidden lg:col-span-2 xl:col-span-7">
        {/* Sticky Save/Cancel + Search */}
        <div className="sticky top-0 z-10 bg-neutral-950/95 backdrop-blur px-0 pt-0 pb-2 border-b border-neutral-900">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm font-medium">🔍 Search<input ref={searchRef} value={filterText} onChange={e=>setFilterText(e.target.value)} className="ml-2 w-64 bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"/></label>
            {/* Fix names (PRO) */}
            <FixNamesButton collectionId={collectionId} />
            <label className="text-sm font-medium">🔤 Sort<select value={sortKey} onChange={e=>setSortKey(e.target.value as any)} className="ml-2 bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"><option value="name">Name</option><option value="qty">Qty</option><option value="set">Set</option><option value="color">Color</option><option value="price">Price</option></select></label>
            <label className="text-sm font-medium">📊 Dir<select value={sortDir} onChange={e=>setSortDir(e.target.value as any)} className="ml-2 bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"><option value="asc">Asc</option><option value="desc">Desc</option></select></label>
            <div className="ml-auto flex items-center gap-2">
              <label className="text-sm font-medium">💰 Currency<select value={currency} onChange={e=>setCurrency(e.target.value as any)} className="ml-2 bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"><option>USD</option><option>EUR</option><option>GBP</option></select></label>
              <button onClick={saveAll} disabled={!changed||busySave} className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white text-sm font-medium transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">{busySave?'Saving…':'💾 Save'}</button>
              <button onClick={()=>{ setPending(new Map()); reload(); }} disabled={busySave} className="px-4 py-2 rounded-lg border border-neutral-700 hover:bg-neutral-800 text-sm font-medium transition-colors disabled:opacity-50">Cancel</button>
            </div>
          </div>
          {/* Filters Row with chips */}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {/* Active chips */}
            <div className="w-full flex flex-wrap gap-1">
              {filterColors.map(c=> (<button key={'c-'+c} onClick={()=>setFilterColors(p=>p.filter(x=>x!==c))} className="px-1.5 py-0.5 rounded-full bg-neutral-900 border border-neutral-700 text-xs">Color: {c} ✕</button>))}
              {filterTypes.map(t=> (<button key={'t-'+t} onClick={()=>setFilterTypes(p=>p.filter(x=>x!==t))} className="px-1.5 py-0.5 rounded-full bg-neutral-900 border border-neutral-700 text-xs">Type: {t} ✕</button>))}
              {!!filterPriceBand && (<button onClick={()=>setFilterPriceBand('')} className="px-1.5 py-0.5 rounded-full bg-neutral-900 border border-neutral-700 text-xs">Price: {filterPriceBand} ✕</button>)}
              {filterQtyMin>0 && (<button onClick={()=>setFilterQtyMin(0)} className="px-1.5 py-0.5 rounded-full bg-neutral-900 border border-neutral-700 text-xs">Qty ≥ {filterQtyMin} ✕</button>)}
              {filterRarity.map(r=> (<button key={'r-'+r} onClick={()=>setFilterRarity(p=>p.filter(x=>x!==r))} className="px-1.5 py-0.5 rounded-full bg-neutral-900 border border-neutral-700 text-xs">Rarity: {r} ✕</button>))}
              {filterSets.map(s=> (<button key={'s-'+s} onClick={()=>setFilterSets(p=>p.filter(x=>x!==s))} className="px-1.5 py-0.5 rounded-full bg-neutral-900 border border-neutral-700 text-xs">Set: {s} ✕</button>))}
              {(filterColors.length||filterTypes.length||filterPriceBand||filterQtyMin>0||filterRarity.length||filterSets.length)? (
                <button onClick={()=>{ setFilterColors([]); setFilterRarity([]); setFilterTypes([]); setFilterPriceBand(''); setFilterSets([]); setFilterQtyMin(0); }} className="ml-2 px-2 py-0.5 rounded-full border border-neutral-700 text-xs">Clear all</button>
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
                <label key={k} className={`inline-flex items-center gap-1.5 cursor-pointer px-3 py-1.5 rounded-lg transition-all ${filterColors.includes(k) ? `${color} ${border} border-2 shadow-md` : 'bg-neutral-800/50 border border-neutral-700 hover:bg-neutral-700/50'}`} title={name}>
                  <input type="checkbox" checked={filterColors.includes(k)} onChange={(e)=> setFilterColors(p=> e.target.checked? [...p,k] : p.filter(x=>x!==k))} className="hidden"/>
                  <span className={`font-bold text-sm ${filterColors.includes(k) ? text : 'text-neutral-300'}`}>{k}</span>
                </label>
              ))}
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-neutral-900/50 to-neutral-800/50 border border-neutral-700/50">
              <span className="font-semibold text-sm bg-gradient-to-r from-blue-400 to-cyan-500 bg-clip-text text-transparent">🃏 Type:</span>
              {['creature','instant','sorcery','land','artifact','enchantment'].map(k=> (
                <label key={k} className="inline-flex items-center gap-1.5 cursor-pointer hover:bg-neutral-800/50 px-2 py-1 rounded transition-colors">
                  <input type="checkbox" checked={filterTypes.includes(k)} onChange={(e)=> setFilterTypes(p=> e.target.checked? [...p,k] : p.filter(x=>x!==k))} className="w-4 h-4 rounded border-neutral-600 bg-neutral-950 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"/>
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
                <span className="text-xs text-neutral-400 min-w-[40px]">${pMin || 0}</span>
                <div className="flex-1">
                  <DualRange min={0} max={500} valueMin={pMin} valueMax={pMax} onChange={(lo,hi)=>{ setPMin(lo); setPMax(hi); setFilterPriceBand(''); }} />
                </div>
                <span className="text-xs text-neutral-400 min-w-[40px] text-right">${pMax || 500}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  {label:'Any', min:0, max:500},
                  {label:'< $1', min:0, max:1},
                  {label:'$1-5', min:1, max:5},
                  {label:'$5-20', min:5, max:20},
                  {label:'$20-50', min:20, max:50},
                  {label:'$50-100', min:50, max:100},
                  {label:'$100+', min:100, max:500}
                ].map(({label, min, max})=> {
                  const isActive = pMin === min && pMax === max;
                  return (
                    <button 
                      key={label} 
                      onClick={()=>{ setPMin(min); setPMax(max); setFilterPriceBand(''); }}
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
                <label className="text-sm font-medium">Qty ≥<input type="number" min={0} value={filterQtyMin} onChange={e=>setFilterQtyMin(Math.max(0, Number(e.target.value||0)))} className="ml-2 w-20 bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"/></label>
                <label className="text-sm font-medium">Sets<select multiple value={filterSets} onChange={(e)=>{ const opts=Array.from(e.currentTarget.selectedOptions).map(o=>o.value); setFilterSets(opts); }} className="ml-2 bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 min-w-40 max-h-24 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all">{allSets.map(s=> (<option key={s.set} value={s.set}>{s.set} ({s.count})</option>))}</select></label>
                <div className="inline-flex items-center gap-2">
                  <span className="text-sm font-medium">💎 Rarity:</span>
                  {['common','uncommon','rare','mythic'].map(k=> (
                    <label key={k} className="inline-flex items-center gap-1.5 cursor-pointer hover:bg-neutral-800/50 px-2 py-1 rounded transition-colors">
                      <input type="checkbox" checked={filterRarity.includes(k)} onChange={(e)=> setFilterRarity(p=> e.target.checked? [...p,k] : p.filter(x=>x!==k))} className="w-4 h-4 rounded border-neutral-600 bg-neutral-950 text-amber-500 focus:ring-amber-500 focus:ring-offset-0 cursor-pointer"/>
                      <span className="font-medium capitalize">{k}</span>
                    </label>
                  ))}
                </div>
                <button onClick={()=>{ setFilterColors([]); setFilterRarity([]); setFilterTypes([]); setFilterPriceBand(''); setFilterSets([]); setFilterQtyMin(0); setFilterText(''); }} className="ml-auto px-3 py-1.5 rounded-lg bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-xs font-medium transition-all shadow-md hover:shadow-lg">🗑️ Clear All</button>
              </div>
            </details>
          </div>
        </div>

        {/* Add row */}
        <div className="flex items-center gap-2 px-0">
          <div className="flex-1">
            <CardAutocomplete value={name} onChange={setName} onPick={(n)=>{ setName(n); add(); }} placeholder="Add card…" />
          </div>
          <input type="number" min={1} value={qty} onChange={e=>setQty(Math.max(1, Number(e.target.value||1)))} className="w-20 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm bg-neutral-950" />
          <button onClick={add} className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white text-sm font-medium transition-all shadow-md hover:shadow-lg">
            <span className="flex items-center gap-1.5">
              <span>➕</span>
              <span>Add</span>
            </span>
          </button>
        </div>

        {/* Virtualized list */}
        <div ref={listRef} onScroll={(e)=>{
          const st = (e.target as HTMLDivElement).scrollTop;
          nextScrollTop.current = st;
          if (rAF.current==null) {
            rAF.current = requestAnimationFrame(()=>{ setScrollTop(nextScrollTop.current); rAF.current = undefined; });
          }
        }} className="relative flex-1 overflow-auto max-h-[70vh] rounded border border-neutral-800 bg-neutral-950">
          {loading && (
            <div className="p-3 space-y-2">
              {Array.from({ length: 10 }).map((_,i)=>(<div key={i} className="h-11 border-b border-neutral-900 flex items-center px-3"><div className="w-24 h-4 bg-neutral-900 animate-pulse rounded" /></div>))}
            </div>
          )}
          {!loading && (
          <div style={{ height: totalH }} className="relative">
            <div style={{ position:'absolute', top: startIndex*rowH, left:0, right:0 }}>
              {windowed.map((it, idx) => {
                const key = it.id||it.name; const staged = pending.has(key)? pending.get(key)! : it.qty;
                const k2 = n(it.name); const unit = (()=>{ const nn=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim(); return priceMap[nn(it.name)]||0; })();
                return (
                  <div key={`${key}-${startIndex+idx}`} className="flex items-center justify-between border-b border-neutral-900 px-3" style={{ height: rowH }}>
                    <span className="text-sm inline-flex items-center gap-2 min-w-0">
                      <input type="checkbox" checked={selected.has(key)} onChange={(e)=>{ const n = new Set(selected); e.target.checked? n.add(key): n.delete(key); setSelected(n); }} className="w-4 h-4 rounded border-neutral-600 bg-neutral-950 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-0 cursor-pointer"/>
                      <input type="number" min={0} step={1} value={staged} className="w-14 bg-neutral-950 border border-neutral-700 rounded px-1 py-0.5 text-center" onChange={(e)=>{ const v = Math.max(0, parseInt(e.target.value||'0',10)); setQtyStaged(it, v); }} />
                      <CardRowPreviewLeft name={it.name} imageSmall={imagesRef.current[k2]?.small} imageLarge={imagesRef.current[k2]?.normal} setCode={(metaRef.current.get(n(it.name))?.set)||''} rarity={(metaRef.current.get(n(it.name))?.rarity)||''} />
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs opacity-80 tabular-nums w-32 text-right">{unit>0? new Intl.NumberFormat(undefined,{ style:'currency', currency }).format(unit*staged): '—'}</span>
                      <button className="text-xs text-red-500 underline" onClick={()=>remove(it)}>delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          )}
        </div>
      </div>

      {/* Right: stats/tools panels */}
      <aside className="h-full overflow-auto space-y-3 lg:col-span-1 xl:col-span-3">
        <details open className="rounded-xl border border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950 shadow-lg">
          <summary className="cursor-pointer select-none px-4 py-3 list-none">
            <div className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-cyan-400 animate-pulse shadow-lg shadow-cyan-400/50"></div>
              <span className="text-base font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">Overview</span>
            </div>
          </summary>
          <div className="p-3 space-y-2">
            <div className="text-sm">Cards: <b className="font-mono">{totalCards}</b></div>
            <div className="text-sm">Unique: <b className="font-mono">{unique}</b></div>
            <div className="text-sm flex items-center gap-2">Value: <b className="font-mono">{valueUSD!=null? new Intl.NumberFormat(undefined, { style:'currency', currency }).format(valueUSD): '—'}</b>
              <select value={currency} onChange={e=>setCurrency(e.target.value as any)} className="ml-auto bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs"><option>USD</option><option>EUR</option><option>GBP</option></select>
            </div>
            <button onClick={refreshValue} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white text-xs font-medium transition-all shadow-md hover:shadow-lg">Refresh now</button>
          </div>
        </details>
        <details open className="rounded-xl border border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950 shadow-lg">
          <summary className="cursor-pointer select-none px-4 py-3 list-none">
            <div className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-purple-400 animate-pulse shadow-lg shadow-purple-400/50"></div>
              <span className="text-base font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">Color pie</span>
            </div>
          </summary>
          <div className="p-3"><ColorPie /></div>
        </details>
        <details open className="rounded-xl border border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950 shadow-lg">
          <summary className="cursor-pointer select-none px-4 py-3 list-none">
            <div className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-amber-400 animate-pulse shadow-lg shadow-amber-400/50"></div>
              <span className="text-base font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">Price history</span>
            </div>
          </summary>
          <div className="p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs opacity-80">
              <span>Last snapshot:</span>
              <span className="font-mono">{lastSnapshotAt ? new Date(lastSnapshotAt).toLocaleString() : '—'}</span>
            </div>
            <Sparkline names={items.map(i=>i.name)} currency={currency} />
            {isPro ? (
              <button onClick={async()=>{ 
                trackProFeatureUsed('price_snapshot');
                try{ const r=await fetch('/api/cron/price/snapshot',{ method:'POST' }); if(r.ok){ setLastSnapshotAt(new Date().toISOString()); } }catch{} 
              }} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-medium transition-all shadow-md hover:shadow-lg">Take snapshot now</button>
            ) : (
              <button 
                disabled 
                onClick={() => {
                  trackProGateClicked('price_snapshot', 'collection_editor');
                }}
                className="text-xs px-2 py-1 rounded border border-neutral-800 opacity-60" 
                title="PRO only"
              >
                Take snapshot now
                <span className="ml-1 inline-flex items-center rounded bg-amber-300 text-black text-[10px] font-bold px-1 py-0.5 uppercase tracking-wide">
                  PRO
                </span>
              </button>
            )}
          </div>
        </details>
        {/* Wishlist compare moved up */}
        <details className="rounded-xl border border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950 shadow-lg">
          <summary className="cursor-pointer select-none px-4 py-3 list-none">
            <div className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-pink-400 animate-pulse shadow-lg shadow-pink-400/50"></div>
              <span className="text-base font-bold bg-gradient-to-r from-pink-400 to-rose-500 bg-clip-text text-transparent">Wishlist compare</span>
            </div>
          </summary>
          <WishlistCompareCard collectionId={collectionId} currency={currency} />
        </details>
        {/* Analytics (advanced) hidden by default */}
        <AnalyticsCards collectionId={collectionId} currency={currency}
          onTypeClick={(t)=> setFilterTypes(p=> p.includes(t)? p : [...p,t])}
          onBucketClick={(b)=>{ const m:any = { '<$1':'<1', '$1–5':'1-5', '$5–20':'5-20', '$20–50':'20-50', '$50–100':'50-100', '$100+':'100+' }; setFilterPriceBand(m[b]||''); }}
        />
        <details className="rounded-xl border border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950 shadow-lg">
          <summary className="cursor-pointer select-none px-4 py-3 list-none">
            <div className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-indigo-400 animate-pulse shadow-lg shadow-indigo-400/50"></div>
              <span className="text-base font-bold bg-gradient-to-r from-indigo-400 to-violet-500 bg-clip-text text-transparent">Sets</span>
            </div>
          </summary>
          <div className="p-3">
            <div className="flex flex-wrap gap-1 text-[11px]">{allSets.length? allSets.map(s=> (
              <button key={s.set} onClick={()=> setFilterSets(p=> p.includes(s.set)? p : [...p, s.set])} className="px-2 py-1 rounded-lg bg-gradient-to-r from-neutral-800 to-neutral-700 hover:from-neutral-700 hover:to-neutral-600 border border-neutral-600 transition-all">{s.set} • {s.count}</button>
            )) : <span className="text-xs opacity-70">—</span>}</div>
          </div>
        </details>
      </aside>
      {/* Bulk actions drawer (page-only) */}
      {selected.size>0 && (
        <div className="fixed bottom-16 right-6 left-6 lg:left-[calc(50%+20px)] lg:right-6 z-20 rounded border border-neutral-800 bg-neutral-950/95 px-4 py-3 flex items-center gap-3 shadow-2xl text-sm">
          <div className="opacity-80">Selected: {selected.size}</div>
          <button onClick={async()=>{
            if(!isPro){ 
              trackProGateClicked('set_to_playset', 'bulk_actions');
              alert('Set to playset is a PRO feature.'); 
              return; 
            }
            trackProFeatureUsed('set_to_playset');
            // record previous qty for undo
            const prev = new Map<string, number>();
            for(const key of selected){ const it = items.find(x=> (x.id||x.name)===key); if(!it) continue; prev.set(it.id!, it.qty); const delta = 4 - (pending.has(key)? pending.get(key)! : it.qty); if(delta!==0){ await fetch('/api/collections/cards', { method:'PATCH', headers:{'content-type':'application/json'}, body: JSON.stringify({ id: it.id, delta }) }); } }
            setSelected(new Set()); reload();
            setUndo({ type:'playset', data: { prev } }); startUndoTimer();
          }} className={`text-xs px-3 py-1 rounded ${isPro? 'bg-neutral-800 hover:bg-neutral-700':'bg-neutral-800 opacity-60 cursor-not-allowed'}`}>Set to playset</button>
          <button onClick={async()=>{
            if(!confirm(`Delete ${selected.size} selected items?`)) return;
            const removed: Array<{ name:string; qty:number }> = [];
            for(const key of Array.from(selected)){ const it = items.find(x=> (x.id||x.name)===key); if(!it?.id) continue; removed.push({ name: it.name, qty: it.qty }); await fetch('/api/collections/cards', { method:'DELETE', headers:{'content-type':'application/json'}, body: JSON.stringify({ id: it.id }) }); }
            setSelected(new Set()); reload();
            setUndo({ type:'delete', data: { removed } }); startUndoTimer();
          }} className="text-sm px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white">Delete</button>
          <button onClick={async()=>{
            try{
              const names = Array.from(selected).map(k=> items.find(x=> (x.id||x.name)===k)?.name).filter(Boolean) as string[];
              if(!names.length) return;
              const r = await fetch('/api/wishlists/add', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ names, qty: 1 }) });
              const j = await r.json().catch(()=>({}));
              if(!r.ok || j?.ok===false){ alert(j?.error||'Failed to add to wishlist'); return; }
              showToast('Added to wishlist');
            } catch(e:any){ alert(e?.message||'Failed'); }
          }} className="text-sm px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700">Add to wishlist</button>
          <a href="/profile?tab=wishlist" className="text-sm underline opacity-90 hover:opacity-100">Go to my Wishlist →</a>
          <button onClick={()=> setSelected(new Set())} className="ml-auto text-sm px-2 py-1.5 rounded border border-neutral-700">Clear</button>
        </div>
      )}
      {/* Undo snackbar */}
      {undo && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-30 rounded border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm flex items-center gap-3 shadow-xl">
          <span>{undo.type==='delete'? 'Deleted selected cards' : 'Set to playset applied'}</span>
          <button onClick={async()=>{ await doUndo(); }} className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700">Undo</button>
        </div>
      )}
      {/* Bottom sticky bar on mobile */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-neutral-950/95 border-t border-neutral-900 px-3 py-2 flex items-center gap-2">
        <button onClick={saveAll} disabled={!changed||busySave} className={`px-3 py-1.5 rounded ${!changed||busySave?'bg-neutral-800 opacity-60':'bg-emerald-600 hover:bg-emerald-500'} text-sm flex-1`}>{busySave?'Saving…':'Save'}</button>
        <button onClick={()=>{ setPending(new Map()); reload(); }} disabled={busySave} className="px-3 py-1.5 rounded border border-neutral-700 text-sm">Cancel</button>
      </div>
      {toast && (<div className="pointer-events-none fixed bottom-4 right-4 rounded bg-black/80 text-white text-xs px-3 py-2 shadow">{toast}</div>)}
    </div>
  );
}
