"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { capture } from "@/lib/ph";
import { usePrefs } from "@/components/PrefsContext";
import CardAutocomplete from "@/components/CardAutocomplete";
import { useHoverPreview } from "@/components/shared/HoverPreview";
import ExportWishlistCSV from "@/components/ExportWishlistCSV";
import WishlistCsvUpload from "@/components/WishlistCsvUpload";
import GuestLandingPage from "@/components/GuestLandingPage";
import { getImagesForNames } from "@/lib/scryfall";

export default function WishlistPage() {
  const sb = useMemo(() => createBrowserSupabaseClient(), []);
  const [user, setUser] = useState<any>(null);
  const [pro, setPro] = useState<boolean>(false);

  // Load user data
  useEffect(() => {
    (async () => {
      try {
        capture('wishlist_page_view');
      } catch {}
      
      const { data: ures } = await sb.auth.getUser();
      const u = ures?.user;
      setUser(u);
      const md: any = u?.user_metadata || {};
      setPro(Boolean(md.pro || md.is_pro));
    })();
  }, [sb]);

  if (!user) {
    const features = [
      {
        icon: '⭐',
        title: 'Track Desired Cards',
        description: 'Keep a organized list of Magic cards you want to acquire for your decks and collection.',
      },
      {
        icon: '💰',
        title: 'Price Monitoring',
        description: 'Track prices in multiple currencies and get notified when cards drop to your target price.',
        highlight: true,
      },
      {
        icon: '🔄',
        title: 'Compare vs Collection',
        description: 'See which wishlist cards you already own and what gaps remain to fill.',
      },
      {
        icon: '📊',
        title: 'Budget Planning',
        description: 'Calculate total costs and plan your purchases within budget constraints.',
      },
      {
        icon: '📋',
        title: 'Multiple Wishlists',
        description: 'Organize different wishlists for various decks, formats, or purchase priorities.',
      },
      {
        icon: '📤',
        title: 'CSV Import/Export',
        description: 'Import existing wishlists or export for shopping at your favorite card store.',
      },
    ];

    const demoSection = (
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-center">
          Smart Wishlist Features
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left p-3 text-gray-600 dark:text-gray-400">Card</th>
                <th className="text-right p-3 text-gray-600 dark:text-gray-400">Price</th>
                <th className="text-right p-3 text-gray-600 dark:text-gray-400">Qty</th>
                <th className="text-right p-3 text-gray-600 dark:text-gray-400">Total</th>
              </tr>
            </thead>
            <tbody className="text-gray-900 dark:text-white">
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <td className="p-3">Rhystic Study</td>
                <td className="text-right p-3 font-mono">$42.50</td>
                <td className="text-right p-3">1</td>
                <td className="text-right p-3 font-mono">$42.50</td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <td className="p-3">Cyclonic Rift</td>
                <td className="text-right p-3 font-mono">$28.75</td>
                <td className="text-right p-3">1</td>
                <td className="text-right p-3 font-mono">$28.75</td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <td className="p-3">Sol Ring</td>
                <td className="text-right p-3 font-mono">$1.20</td>
                <td className="text-right p-3">3</td>
                <td className="text-right p-3 font-mono">$3.60</td>
              </tr>
              <tr className="border-t-2 border-gray-300 dark:border-gray-600 font-bold">
                <td colSpan={3} className="p-3 text-right">Total</td>
                <td className="text-right p-3 font-mono text-blue-600 dark:text-blue-400">$74.85</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
          Track prices across USD, EUR, and GBP
        </div>
      </div>
    );

    return (
      <GuestLandingPage
        title="Build Your Wishlist"
        subtitle="Track and organize Magic cards you want with smart price monitoring and budget tools"
        features={features}
        demoSection={demoSection}
      />
    );
  }

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My Wishlist</h1>
        {pro && (
          <div className="flex items-center gap-2">
            <div className="text-xs px-2 py-1 rounded bg-blue-600 text-white">PRO</div>
          </div>
        )}
      </div>
      
      <WishlistEditor pro={pro} />
    </main>
  );
}

function WishlistEditor({ pro }: { pro: boolean }) {
  const [wishlists, setWishlists] = React.useState<Array<{id:string; name:string; is_public?: boolean}>>([]);
  const [wishlistId, setWishlistId] = React.useState<string>('');
  // Use global currency prefs
  const { currency: globalCurrency, setCurrency: setGlobalCurrency } = usePrefs();
  const currency = (globalCurrency as any as 'USD'|'EUR'|'GBP') || 'USD';
  const setCurrency = (c: 'USD'|'EUR'|'GBP') => setGlobalCurrency?.(c);
  const [items, setItems] = React.useState<Array<{ name:string; qty:number; unit:number; thumb?:string }>>([]);
  const [total, setTotal] = React.useState<number>(0);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [adding, setAdding] = React.useState<boolean>(false);
  const [addName, setAddName] = React.useState<string>('');
  const [addQty, setAddQty] = React.useState<number>(1);
  const [error, setError] = React.useState<string|null>(null);
  const [collections, setCollections] = React.useState<Array<{ id:string; name:string }>>([]);
  const [collectionId, setCollectionId] = React.useState<string>('');
  const [compare, setCompare] = React.useState<{ missing: Array<{ name:string; need:number; unit:number }>; total:number; currency:string }|null>(null);
  // Keyboard + selection state
  const [sel, setSel] = React.useState<number>(-1);
  const [selSet, setSelSet] = React.useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const addWrapRef = useRef<HTMLDivElement>(null);
  const [showBulk, setShowBulk] = React.useState(false);
  const [bulkText, setBulkText] = React.useState<string>('');
  const [bulkMode, setBulkMode] = React.useState<'increment'|'replace'>('increment');

  React.useEffect(()=>{ (async()=>{
    try{
      setLoading(true);
      const r = await fetch('/api/wishlists/list', { cache:'no-store' });
      const j = await r.json().catch(()=>({}));
      const wls = Array.isArray(j?.wishlists) ? (j.wishlists as any[]) : [];
      setWishlists(wls);
      const first = wls[0]?.id ? String(wls[0].id) : '';
      setWishlistId(prev => prev || first);
      // Load collections for compare action
      try{
        const cr = await fetch('/api/collections/list', { cache:'no-store' });
        const cj = await cr.json().catch(()=>({}));
        const cols = Array.isArray(cj?.collections)? cj.collections as any[] : [];
        setCollections(cols);
        if (!collectionId && cols[0]?.id) setCollectionId(String(cols[0].id));
      } catch{}
    } finally { setLoading(false); }
  })(); }, []);

  React.useEffect(()=>{ (async()=>{
    if (!wishlistId) { setItems([]); setTotal(0); return; }
    try{
      setLoading(true);
      const q = new URLSearchParams({ wishlistId, currency });
      const r = await fetch(`/api/wishlists/items?${q.toString()}`, { cache:'no-store' });
      const j = await r.json().catch(()=>({}));
      if (r.ok && j?.ok){ setItems(Array.isArray(j.items)?j.items:[]); setTotal(Number(j.total||0)); setSel(-1); }
      else { setError(j?.error||'Failed to load items'); }
    } finally { setLoading(false); }
  })(); }, [wishlistId, currency]);

  // Selection helpers
  function toggleOne(name:string){ setSelSet(prev => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next; }); }
  function allSelectedOnPage(){ return items.length>0 && items.every(it => selSet.has(it.name)); }
  function toggleAll(){ const all = allSelectedOnPage(); setSelSet(all? new Set() : new Set(items.map(it=>it.name))); }
  async function removeSelected(){
    if (selSet.size===0) return;
    
    // Store items to remove for undo
    const names = Array.from(selSet);
    const itemsToRemove = items.filter(it => selSet.has(it.name));
    
    // Use undo toast instead of confirm
    const { undoToastManager } = await import('@/lib/undo-toast');
    
    undoToastManager.showUndo({
      id: `remove-wishlist-${Date.now()}`,
      message: `Removing ${selSet.size} item${selSet.size > 1 ? 's' : ''} from wishlist`,
      duration: 7000,
      onUndo: async () => {
        // Re-add the removed items
        try {
          for (const item of itemsToRemove) {
            await fetch('/api/wishlists/add', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                wishlist_id: wishlistId,
                name: item.name,
                qty: item.qty,
              }),
            });
          }
          
          // Reload wishlist
          const qs = new URLSearchParams({ wishlistId, currency });
          const rr = await fetch(`/api/wishlists/items?${qs.toString()}`, { cache:'no-store' });
          const jj = await rr.json().catch(()=>({}));
          if (rr.ok && jj?.ok){ 
            setItems(Array.isArray(jj.items)?jj.items:[]); 
            setTotal(Number(jj.total||0)); 
          }
        } catch (e) {
          console.error('Failed to undo wishlist removal:', e);
          alert('Failed to restore wishlist items');
        }
      },
      onExecute: async () => {
        // Actually remove the items
        try{
          const r = await fetch('/api/wishlists/remove-batch', { 
            method:'POST', 
            headers:{'content-type':'application/json'}, 
            body: JSON.stringify({ wishlist_id: wishlistId, names }) 
          });
          const j = await r.json().catch(()=>({}));
          if (!r.ok || j?.ok===false) throw new Error(j?.error||'Batch remove failed');
          
          // Track removal
          try {
            capture('wishlist_items_removed', {
              wishlist_id: wishlistId,
              count: names.length,
            });
          } catch {}
          
          // reload
          const qs = new URLSearchParams({ wishlistId, currency });
          const rr = await fetch(`/api/wishlists/items?${qs.toString()}`, { cache:'no-store' });
          const jj = await rr.json().catch(()=>({}));
          if (rr.ok && jj?.ok){ setItems(Array.isArray(jj.items)?jj.items:[]); setTotal(Number(jj.total||0)); setSel(-1); }
          setSelSet(new Set());
        } catch(e:any){ 
          alert(e?.message||'Batch remove failed'); 
        }
      },
    });
  }

  function fmt(n:number){ try{ return new Intl.NumberFormat(undefined, { style:'currency', currency }).format(n||0); } catch { return `$${(n||0).toFixed(2)}`; } }

  // Image map for hover previews
  const [imgMap, setImgMap] = React.useState<Record<string, { small?: string; normal?: string }>>({});
  React.useEffect(()=>{ (async()=>{
    try{
      const names = Array.from(new Set(items.map(i=>i.name))).slice(0,400);
      if (!names.length) { setImgMap({}); return; }
      const m = await getImagesForNames(names);
      const obj: Record<string, { small?: string; normal?: string }> = {};
      m.forEach((v:any,k:string)=>{ obj[k.toLowerCase()] = { small: v.small, normal: v.normal||v.art_crop||v.small }; });
      setImgMap(obj);
    } catch { setImgMap({}); }
  })(); }, [items.map(i=>i.name).join('|')]);

  const { preview, bind } = useHoverPreview();
  const [fixOpen, setFixOpen] = React.useState(false);

  async function add(){
    const name = addName.trim(); const q = Math.max(1, Number(addQty||1)); if (!name) return;
    try{ setAdding(true);
      const body: any = { names:[name], qty: q };
      if (wishlistId) body.wishlist_id = wishlistId;
      const r = await fetch('/api/wishlists/add', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
      const j = await r.json().catch(()=>({}));
      if (!r.ok || j?.ok===false) throw new Error(j?.error||'Add failed');
      const wid = String(j?.wishlist_id||wishlistId||'');
      if (wid && wid !== wishlistId) setWishlistId(wid);
      setAddName(''); setAddQty(1);
      // reload
      const qs = new URLSearchParams({ wishlistId: wid||wishlistId, currency });
      const rr = await fetch(`/api/wishlists/items?${qs.toString()}`, { cache:'no-store' });
      const jj = await rr.json().catch(()=>({}));
      if (rr.ok && jj?.ok){ setItems(Array.isArray(jj.items)?jj.items:[]); setTotal(Number(jj.total||0)); setSel(-1); }
    } catch(e:any){ alert(e?.message||'Add failed'); } finally { setAdding(false); }
  }

  async function setQty(name:string, next:number){
    try{
      const body = { wishlist_id: wishlistId, name, qty: Math.max(0, Number(next||0)) };
      const r = await fetch('/api/wishlists/update', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
      const j = await r.json().catch(()=>({}));
      if (!r.ok || j?.ok===false) throw new Error(j?.error||'Update failed');
      setItems(prev => prev.map(it => it.name===name ? { ...it, qty: Math.max(0,next) } : it));
      setTotal(prev => items.reduce((s,it)=> s + (it.name===name ? (it.unit||0)*Math.max(0,next) : (it.unit||0)*Math.max(0,it.qty||0)), 0));
    } catch(e:any){ alert(e?.message||'Update failed'); }
  }
  
  function focusAdd(){ try{ addWrapRef.current?.querySelector('input')?.focus(); } catch{} }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>){
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    const typing = tag === 'input' || tag === 'textarea';
    if (e.ctrlKey && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); setShowBulk(true); return; }
    if (e.ctrlKey && (e.key === 'f' || e.key === 'F' || e.key === '/')) { e.preventDefault(); focusAdd(); return; }
    if (typing) return; // don't hijack while editing inputs
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(i=> Math.min(items.length-1, Math.max(0, i+1))); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel(i=> Math.max(0, (i<0?0:i-1))); return; }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); if (sel>=0 && sel<items.length) setQty(items[sel].name, (items[sel].qty||0)+1); return; }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); if (sel>=0 && sel<items.length) setQty(items[sel].name, Math.max(0,(items[sel].qty||0)-1)); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); if (sel>=0 && sel<items.length) remove(items[sel].name); return; }
    if (e.key === 'Enter') { if (addName.trim()) { e.preventDefault(); add(); } return; }
  }

  async function remove(name:string){
    try{
      const r = await fetch('/api/wishlists/remove', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ wishlist_id: wishlistId, name }) });
      const j = await r.json().catch(()=>({}));
      if (!r.ok || j?.ok===false) throw new Error(j?.error||'Remove failed');
      setItems(prev => prev.filter(it => it.name !== name));
      setTotal(prev => items.filter(it=>it.name!==name).reduce((s,it)=> s + (it.unit||0)*Math.max(0,it.qty||0), 0));
    } catch(e:any){ alert(e?.message||'Remove failed'); }
  }

  async function inlineFix(name:string){
    try{
      const r = await fetch('/api/cards/fuzzy', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ names:[name] }) });
      const j = await r.json().catch(()=>({}));
      const sugg = j?.results?.[name]?.suggestion || j?.results?.[name]?.all?.[0];
      if (!sugg) { alert('No suggestion found'); return; }
      if (!confirm(`Rename to "${sugg}"?`)) return;
      const rr = await fetch('/api/wishlists/rename', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ wishlist_id: wishlistId, name, new_name: sugg }) });
      const jj = await rr.json().catch(()=>({}));
      if (!rr.ok || jj?.ok===false) throw new Error(jj?.error||'Rename failed');
      // reload
      const qs = new URLSearchParams({ wishlistId, currency });
      const r2 = await fetch(`/api/wishlists/items?${qs.toString()}`, { cache:'no-store' });
      const j2 = await r2.json().catch(()=>({}));
      if (r2.ok && j2?.ok){ setItems(Array.isArray(j2.items)?j2.items:[]); setTotal(Number(j2.total||0)); setSel(-1); }
    } catch(e:any){ alert(e?.message||'Rename failed'); }
  }

  if (loading && !items.length && !wishlists.length) return <div className="text-xs opacity-70">Loading…</div>;

  return (
    <div ref={containerRef} onKeyDown={handleKeyDown} tabIndex={0} className="space-y-4 outline-none">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-sm opacity-80">Wishlist</label>
          <select value={wishlistId} onChange={(e)=>setWishlistId(e.target.value)} className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm min-w-[12rem]">
            {wishlists.map(w => (<option key={w.id} value={w.id}>{w.name||'Untitled'}</option>))}
            {!wishlists.length && (<option value="">My Wishlist</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm opacity-80">Currency</label>
          <select value={currency} onChange={(e)=>setCurrency(e.target.value as any)} className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm">
            <option>USD</option>
            <option>EUR</option>
            <option>GBP</option>
          </select>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {wishlistId ? <WishlistCsvUpload wishlistId={wishlistId} onDone={async()=>{ const qs=new URLSearchParams({ wishlistId, currency }); const r=await fetch(`/api/wishlists/items?${qs.toString()}`,{cache:'no-store'}); const j=await r.json().catch(()=>({})); if (r.ok&&j?.ok){ setItems(Array.isArray(j.items)?j.items:[]); setTotal(Number(j.total||0)); } }} /> : null}
          {wishlistId ? <ExportWishlistCSV wishlistId={wishlistId} small /> : null}
          <button onClick={()=>setFixOpen(true)} className="text-xs underline underline-offset-4">Fix names</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-sm flex-1 min-w-[260px]">
          <div className="opacity-70 mb-1">Add card</div>
          <div ref={addWrapRef}>
            <CardAutocomplete value={addName} onChange={setAddName} onPick={(name)=>{ setAddName(name); add(); }} placeholder="Search card…" />
          </div>
        </label>
        <label className="text-sm w-24">
          <div className="opacity-70 mb-1">Qty</div>
          <input type="number" min={1} value={addQty} onChange={(e)=>setAddQty(Math.max(1, Number(e.target.value||1)))} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" />
        </label>
        <button onClick={add} disabled={adding || !addName.trim()} className={`px-3 py-2 rounded text-sm ${adding || !addName.trim() ? 'bg-gray-300 text-black' : 'bg-white text-black hover:bg-gray-100'}`}>{adding?'Adding…':'Add'}</button>
        <button onClick={()=>setShowBulk(true)} className="px-3 py-2 rounded border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-sm">Bulk add</button>
        <div className="ml-auto flex items-end gap-2">
          <label className="text-sm">
            <div className="opacity-70 mb-1">Compare vs Collection</div>
            <select value={collectionId} onChange={(e)=>setCollectionId(e.target.value)} className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm min-w-[12rem]">
              {collections.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </label>
          <button onClick={async()=>{
            if (!wishlistId || !collectionId) return;
            try{
              const q = new URLSearchParams({ wishlistId, collectionId, currency });
              const r = await fetch(`/api/wishlists/compare?${q.toString()}`, { cache:'no-store' });
              const j = await r.json().catch(()=>({}));
              if (r.ok && j?.ok) setCompare({ missing: Array.isArray(j.missing)? j.missing : [], total: Number(j.total||0), currency: String(j.currency||currency) });
            } catch{}
          }} className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-sm">Compare</button>
        </div>
        <FixNamesModalWishlist wishlistId={wishlistId} open={fixOpen} onClose={()=>setFixOpen(false)} pro={pro} />
      </div>

      {compare && (
        <div className="rounded border border-neutral-800 p-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="font-medium">Missing from selected collection</div>
            <div className="tabular-nums">Est. {new Intl.NumberFormat(undefined, { style:'currency', currency: compare.currency as any }).format(compare.total||0)}</div>
          </div>
          <ul className="mt-2 max-h-40 overflow-auto space-y-1">
            {compare.missing.map((m,i)=> (
              <li key={`${m.name}-${i}`} className="flex items-center justify-between gap-2">
                <span className="truncate">{m.name}</span>
                <span className="opacity-80">x{m.need}</span>
              </li>
            ))}
            {compare.missing.length===0 && (<li className="text-xs opacity-70">No gaps — you already own everything on this wishlist in the selected collection.</li>)}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
        {/* Action bar */}
        <div className="sticky top-0 z-20 bg-neutral-950/90 backdrop-blur border-b border-neutral-800 px-2 py-1 flex items-center gap-2 text-xs">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={allSelectedOnPage()} onChange={toggleAll} /> Select all</label>
          {selSet.size>0 && (
            <>
              <span className="opacity-80">{selSet.size} selected</span>
              <button className="px-2 py-0.5 rounded border border-neutral-700 hover:bg-neutral-800" onClick={()=>setSelSet(new Set())}>Clear</button>
              <button className="px-2 py-0.5 rounded border border-red-500 text-red-300 hover:bg-red-900/20" onClick={removeSelected}>Remove selected</button>
            </>
          )}
        </div>
        <table className="w-full text-sm select-none">
          <thead>
            <tr className="text-xs opacity-70 border-b border-neutral-800">
              <th className="p-2 sticky top-6 bg-neutral-950 z-10">{/* selection */}</th>
              <th className="text-left p-2 sticky top-6 bg-neutral-950 z-10">Card</th>
              <th className="text-right p-2 sticky top-6 bg-neutral-950 z-10">Price</th>
              <th className="text-right p-2 sticky top-6 bg-neutral-950 z-10">Qty</th>
              <th className="text-right p-2 sticky top-6 bg-neutral-950 z-10">Subtotal</th>
              <th className="p-2 sticky top-6 bg-neutral-950 z-10"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.name} className={`border-b border-neutral-900 ${sel===i? 'bg-neutral-900/60' : ''}`} onClick={()=>setSel(i)}>
                <td className="p-2 w-8 align-middle"><input type="checkbox" checked={selSet.has(it.name)} onChange={()=>toggleOne(it.name)} /></td>
                <td className="p-2">
                  <div className="flex items-center gap-3">
                    {(() => { const key = it.name.toLowerCase(); const img = imgMap[key]?.small || it.thumb || ''; const big = imgMap[key]?.normal || img || ''; return img ? (<img src={img} alt="" className="w-10 h-14 object-cover rounded border border-neutral-800" {...(bind(big) as any)} />) : (<div className="w-10 h-14 rounded bg-neutral-900 border border-neutral-800" />); })()}
                    <span className="truncate max-w-[38ch]" title={it.name}>{it.name}</span>
                  </div>
                </td>
                <td className="p-2 text-right tabular-nums">{(it.unit||0)>0 ? fmt(it.unit||0) : (<span className="opacity-60">— <button className="underline" onClick={()=>inlineFix(it.name)}>fix?</button></span>)}</td>
                <td className="p-2 text-right">
                  <div className="inline-flex items-center gap-2">
                    <button className="px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800" onClick={()=>setQty(it.name, Math.max(0, (it.qty||0) - 1))}>-</button>
                    <span className="min-w-[2ch] inline-block text-center tabular-nums">{it.qty||0}</span>
                    <button className="px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800" onClick={()=>setQty(it.name, Math.max(0, (it.qty||0) + 1))}>+</button>
                  </div>
                </td>
                <td className="p-2 text-right tabular-nums">{fmt((it.unit||0) * Math.max(0,it.qty||0))}</td>
                <td className="p-2 text-right">
                  <button className="text-xs text-red-300 underline" onClick={()=>remove(it.name)}>Remove</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-sm opacity-70 text-center">No items yet. Use the form above to add cards to your wishlist.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td className="p-2 text-right font-medium" colSpan={4}>Total</td>
              <td className="p-2 text-right font-semibold tabular-nums">{fmt(total||0)}</td>
              <td className="p-2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
      {preview}
      
      {/* Bulk add modal */}
      {showBulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-[min(720px,95vw)] rounded-lg border border-neutral-700 bg-neutral-950 p-4 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <div className="text-base font-semibold">Bulk add to wishlist</div>
              <button className="text-sm opacity-80 hover:opacity-100" onClick={()=>setShowBulk(false)}>Close</button>
            </div>
            <div className="text-xs opacity-80 mb-2">Paste one card per line. Formats supported: "2 Sol Ring", "Sol Ring x2", "Sol Ring". Use Ctrl+B to open, Ctrl+F to focus search, +/- to change qty on selection, Delete to remove.</div>
            <textarea value={bulkText} onChange={(e)=>setBulkText(e.target.value)} className="w-full min-h-40 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm" placeholder={"2 Sol Ring\n1 Lightning Greaves\n3 Counterspell"} />
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-3 text-sm">
                <label className="flex items-center gap-1"><input type="radio" name="bulkmode" checked={bulkMode==='increment'} onChange={()=>setBulkMode('increment')} /> Increment existing</label>
                <label className="flex items-center gap-1"><input type="radio" name="bulkmode" checked={bulkMode==='replace'} onChange={()=>setBulkMode('replace')} /> Set exact quantities</label>
              </div>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 rounded border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-sm" onClick={()=>setBulkText('')}>Clear</button>
                <button className="px-3 py-1.5 rounded bg-white text-black text-sm" onClick={async()=>{
                  const lines = (bulkText||'').split(/\r?\n|,/).map(s=>s.trim()).filter(Boolean);
                  if (!lines.length) { setShowBulk(false); return; }
                  function parseLine(s:string){
                    const a = s.match(/^\s*(\d+)\s*[xX]?\s+(.+)$/); if (a) return { qty: Math.max(1, Number(a[1]||1)), name: a[2].trim() };
                    const b = s.match(/^\s*(.+?)\s*[xX]\s*(\d+)\s*$/); if (b) return { qty: Math.max(1, Number(b[2]||1)), name: b[1].trim() };
                    return { qty: 1, name: s.trim() };
                  }
                  const parsed = lines.map(parseLine).filter(p=>!!p.name);
                  try{
                    if (bulkMode==='increment'){
                      // group by qty, call add endpoint in batches
                      const groups: Record<string,string[]> = {};
                      for (const p of parsed){ const k = String(p.qty); (groups[k] ||= []).push(p.name); }
                      for (const [k, names] of Object.entries(groups)){
                        const body:any = { names, qty: Math.max(1, Number(k)||1) }; if (wishlistId) body.wishlist_id = wishlistId;
                        const r = await fetch('/api/wishlists/add', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
                        const j = await r.json().catch(()=>({})); if (!r.ok || j?.ok===false) throw new Error(j?.error||'Bulk add failed');
                        const wid = String(j?.wishlist_id||wishlistId||''); if (wid && wid !== wishlistId) setWishlistId(wid);
                      }
                    } else {
                      // replace exact quantities via update route per item
                      for (const p of parsed){
                        const body = { wishlist_id: wishlistId, name: p.name, qty: Math.max(0, Number(p.qty||0)) };
                        const r = await fetch('/api/wishlists/update', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
                        const j = await r.json().catch(()=>({})); if (!r.ok || j?.ok===false) throw new Error(j?.error||'Bulk update failed');
                      }
                    }
                    // reload
                    const qs = new URLSearchParams({ wishlistId, currency });
                    const rr = await fetch(`/api/wishlists/items?${qs.toString()}`, { cache:'no-store' });
                    const jj = await rr.json().catch(()=>({})); if (rr.ok && jj?.ok){ setItems(Array.isArray(jj.items)?jj.items:[]); setTotal(Number(jj.total||0)); setSel(-1); }
                    setShowBulk(false); setBulkText('');
                  } catch(e:any){ alert(e?.message||'Bulk action failed'); }
                }}>Apply</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FixNamesModalWishlist({ wishlistId, open, onClose, pro }: { wishlistId: string; open: boolean; onClose: ()=>void; pro: boolean }){
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<Array<{ name: string; suggestions: string[]; choice?: string }>>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(()=>{ if(!open) return; (async()=>{
    try{
      setLoading(true);
      const r = await fetch(`/api/wishlists/fix-names?wishlistId=${encodeURIComponent(wishlistId)}`, { cache:'no-store' });
      const j = await r.json().catch(()=>({}));
      if (!r.ok || j?.ok===false) throw new Error(j?.error||'Load failed');
      const arr: any[] = Array.isArray(j.items)? j.items : [];
      setItems(arr.map(it => ({ ...it, choice: (it.suggestions||[])[0] || '' })));
    } catch(e:any){ alert(e?.message||'Failed to load fixes'); onClose(); }
    finally { setLoading(false); }
  })(); }, [open, wishlistId]);

  async function apply(){
    if (!pro) { alert('Batch fix is a Pro feature.'); return; }
    try{
      setSaving(true);
      const changes = items.map(it => ({ from: it.name, to: String(it.choice||'').trim() })).filter(ch => ch.to && ch.to !== ch.from);
      if (!changes.length) { onClose(); return; }
      const r = await fetch('/api/wishlists/fix-names/apply', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ wishlist_id: wishlistId, changes }) });
      const j = await r.json().catch(()=>({}));
      if (!r.ok || j?.ok===false) throw new Error(j?.error||'Apply failed');
      onClose(); try{ window.location.reload(); } catch{}
    } catch(e:any){ alert(e?.message||'Apply failed'); } finally { setSaving(false); }
  }
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4">
      <div className="max-w-xl w-full rounded border border-neutral-700 bg-neutral-950 p-3 text-sm">
        <div className="font-semibold mb-2">Fix card names</div>
        {loading && <div className="text-xs opacity-70">Loading…</div>}
        {!loading && items.length===0 && (<div className="text-xs opacity-80">All card names look good.</div>)}
        {!loading && items.length>0 && (
          <div className="space-y-2 max-h-[50vh] overflow-auto pr-2">
            {items.map((it, idx) => (
              <div key={`${it.name}-${idx}`} className="flex items-center gap-2">
                <div className="flex-1 truncate">{it.name}</div>
                <select value={it.choice} onChange={e=>setItems(arr => { const next = arr.slice(); next[idx] = { ...it, choice: e.target.value }; return next; })}
                  className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs">
                  {it.suggestions.map(s => (<option key={s} value={s}>{s}</option>))}
                </select>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center justify-end gap-2">
          {!pro && (<span className="text-[11px] opacity-70 mr-auto">Batch rename is a Pro feature.</span>)}
          <button onClick={onClose} className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs">Close</button>
          <button onClick={apply} disabled={saving || loading || items.length===0 || !pro} className="px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-xs">Apply</button>
        </div>
      </div>
    </div>
  );
}