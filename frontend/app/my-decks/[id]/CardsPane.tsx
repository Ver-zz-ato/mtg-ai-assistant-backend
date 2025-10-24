// app/my-decks/[id]/CardsPane.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { capture } from '@/lib/ph';
import EditorAddBar from "@/components/EditorAddBar";

type CardRow = { id: string; deck_id: string; name: string; qty: number; created_at: string };

export default function CardsPane({ deckId }: { deckId?: string }) {
  const [cards, setCards] = useState<CardRow[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const addBarRef = React.useRef<HTMLDivElement|null>(null);
  const listRef = React.useRef<HTMLDivElement|null>(null);

  async function load() {
    if (!deckId) return;
    const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, { cache: "no-store" });
    let json: any = {};
    try { json = await res.json(); } catch { json = { ok: false, error: "Bad JSON" }; }
    if (!json?.ok) { setStatus(json?.error || `Error ${res.status}`); return; }
    setCards(json.cards || []);
    setStatus(null);
  }

  useEffect(() => { 
    load(); 
    
    // Listen for deck changes from other components (AI suggestions, etc.)
    const handleDeckChange = () => load();
    window.addEventListener('deck:changed', handleDeckChange);
    return () => window.removeEventListener('deck:changed', handleDeckChange);
  }, [deckId]);

  async function add(name: string | { name: string }, qty: number) {
    if (!deckId) return;
    const n = (typeof name === "string" ? name : name?.name)?.trim();
    const q = Math.max(1, Number(qty) || 1);
    if (!n) return;
    try { const { containsProfanity } = await import("@/lib/profanity"); if (containsProfanity(n)) { alert('Please choose a different name.'); return; } } catch {}

    // Optimistic update - add card immediately to UI
    const tempId = `temp-${Date.now()}`;
    const optimisticCard: CardRow = {
      id: tempId,
      deck_id: deckId,
      name: n,
      qty: q,
      created_at: new Date().toISOString(),
    };
    
    setCards(prev => [...prev, optimisticCard]);
    window.dispatchEvent(new CustomEvent("toast", { detail: `Added x${q} ${n}` }));

    try {
      const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, qty: q }),
      });
      const json = await res.json().catch(() => ({ ok: false, error: "Bad JSON" }));
      
      if (!json.ok) {
        // Revert optimistic update
        setCards(prev => prev.filter(c => c.id !== tempId));
        
        const retry = confirm(`Failed to add ${n}. Retry?`);
        if (retry) {
          add(name, qty);
        }
        return;
      }

      // Track successful card addition
      capture('deck_card_added', {
        deck_id: deckId,
        card_name: n,
        quantity: q,
        method: 'search'
      });

      // Replace temp card with real card from server
      await load();
      try { window.dispatchEvent(new Event('deck:changed')); } catch {}
    } catch (err) {
      // Revert on network error
      setCards(prev => prev.filter(c => c.id !== tempId));
      
      const retry = confirm(`Network error adding ${n}. Retry?`);
      if (retry) {
        add(name, qty);
      }
    }
  }

  async function delta(id: string, d: number) {
    if (!deckId) return;
    
    // Optimistic update - immediately change quantity in UI
    const card = cards.find(c => c.id === id);
    if (!card) return;
    
    const previousQty = card.qty;
    const newQty = previousQty + d;
    
    // If quantity would go to 0 or below, remove the card
    if (newQty <= 0) {
      setCards(prev => prev.filter(c => c.id !== id));
    } else {
      setCards(prev => prev.map(c => c.id === id ? { ...c, qty: newQty } : c));
    }
    
    window.dispatchEvent(new CustomEvent("toast", { detail: d > 0 ? "Added +1" : "Removed -1" }));
    setBusyId(id);
    
    try {
      const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, delta: d }),
      });
      const json = await res.json().catch(() => ({ ok: false, error: "Bad JSON" }));
      
      if (!json.ok) {
        // Revert optimistic update
        if (newQty <= 0) {
          setCards(prev => [...prev, { ...card, qty: previousQty }]);
        } else {
          setCards(prev => prev.map(c => c.id === id ? { ...c, qty: previousQty } : c));
        }
        
        const retry = confirm(`Failed to update ${card.name}. Retry?`);
        if (retry) {
          delta(id, d);
        }
        return;
      }
      
      // Track card quantity changes
      capture('deck_card_quantity_changed', {
        deck_id: deckId,
        card_name: card.name,
        old_quantity: previousQty,
        new_quantity: newQty,
        method: 'button_click'
      });
      
      // Reload to ensure sync with server
      await load();
      try { window.dispatchEvent(new Event('deck:changed')); } catch {}
    } catch (e: any) {
      // Revert on network error
      if (newQty <= 0) {
        setCards(prev => [...prev, { ...card, qty: previousQty }]);
      } else {
        setCards(prev => prev.map(c => c.id === id ? { ...c, qty: previousQty } : c));
      }
      
      const retry = confirm(`Network error. Retry?`);
      if (retry) {
        delta(id, d);
      }
    } finally {
      setBusyId(null);
    }
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === cards.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(cards.map(c => c.id)));
    }
  }

  async function bulkDelete() {
    if (!deckId || selected.size === 0) return;
    
    const cardsToDelete = cards.filter(c => selected.has(c.id));
    const { undoToastManager } = await import('@/lib/undo-toast');
    
    // OPTIMISTIC UI: Remove from UI immediately
    setCards(prev => prev.filter(c => !selected.has(c.id)));
    setSelected(new Set());
    
    // Track bulk delete
    try {
      capture('bulk_delete_cards', {
        deck_id: deckId,
        count: cardsToDelete.length,
        card_names: cardsToDelete.map(c => c.name).join(', ')
      });
    } catch {}
    
    // Delete from database immediately (in background)
    const deletePromises = cardsToDelete.map(card =>
      fetch(`/api/decks/cards?id=${encodeURIComponent(card.id)}&deckid=${encodeURIComponent(deckId)}`, {
        method: "DELETE"
      })
    );
    
    // Execute all deletions
    Promise.all(deletePromises)
      .then(() => {
        try { window.dispatchEvent(new Event('deck:changed')); } catch {}
      })
      .catch((e) => {
        console.error('Failed to bulk delete:', e);
        // Reload to show actual state if deletion failed
        load();
      });
    
    // Show undo toast
    undoToastManager.showUndo({
      id: 'bulk-delete-cards',
      message: `${cardsToDelete.length} card${cardsToDelete.length > 1 ? 's' : ''} deleted`,
      duration: 8000,
      onUndo: async () => {
        // Restore all deleted cards
        try {
          for (const card of cardsToDelete) {
            await fetch(`/api/decks/cards`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ deckId, name: card.name, qty: card.qty }),
            });
          }
          window.dispatchEvent(new CustomEvent("toast", { detail: `Restored ${cardsToDelete.length} cards` }));
          await load();
          try { window.dispatchEvent(new Event('deck:changed')); } catch {}
        } catch (e) {
          console.error('Failed to undo bulk delete:', e);
          alert('Failed to undo deletion');
        }
      },
      onExecute: () => {
        // Already executed above, this is just for the toast interface
      },
    });
  }

  async function remove(id: string, name: string, qty: number) {
    if (!deckId) return;
    
    // INSTANT UPDATE: Remove from UI immediately (optimistic)
    const cardToRemove = cards.find(c => c.id === id);
    if (!cardToRemove) return;
    
    setCards(prev => prev.filter(c => c.id !== id));
    
    // Use undo toast with 8 second window
    const { undoToastManager } = await import('@/lib/undo-toast');
    
    undoToastManager.showUndo({
      id: `remove-card-${id}`,
      message: `Removed ${qty}x ${name}`,
      duration: 8000, // 8 seconds as requested
      onUndo: async () => {
        // Restore card to UI immediately
        setCards(prev => [...prev, cardToRemove]);
        
        // Don't need to call API - card was never actually deleted yet
        window.dispatchEvent(new CustomEvent("toast", { detail: `Restored ${qty}x ${name}` }));
        try { window.dispatchEvent(new Event('deck:changed')); } catch {}
      },
      onExecute: async () => {
        // Actually delete from database (only runs if undo not clicked within 8 seconds)
        try {
          const res = await fetch(`/api/decks/cards?id=${encodeURIComponent(id)}&deckid=${encodeURIComponent(deckId)}`, {
            method: "DELETE",
          });
          const json = await res.json().catch(() => ({ ok: false, error: "Bad JSON" }));
          if (!json.ok) {
            // If delete fails, restore the card
            setCards(prev => [...prev, cardToRemove]);
            throw new Error(json.error || "Delete failed");
          }
          
          // Track card removal
          capture('deck_card_removed', {
            deck_id: deckId,
            card_name: name,
            quantity: qty,
          });
          
          try { window.dispatchEvent(new Event('deck:changed')); } catch {}
        } catch (e: any) {
          alert(e?.message || "Error deleting card");
          // Restore on error
          setCards(prev => [...prev, cardToRemove]);
        }
      },
    });
  }

  // render each actual row (not grouped), sorted by name for a stable view
  const rows = useMemo(() => [...cards].sort((a, b) => a.name.localeCompare(b.name)), [cards]);

  // Scryfall images (thumb + hover)
  const [imgMap, setImgMap] = useState<Record<string, { small?: string; normal?: string }>>({});
  const [pv, setPv] = useState<{ src: string; x: number; y: number; shown: boolean; below: boolean }>({ src: "", x: 0, y: 0, shown: false, below: false });

  // Currency toggle + snapshot prices per normalized name
  // Important: avoid reading localStorage during initial render to prevent hydration mismatches.
  const [currency, setCurrency] = useState<string>('USD');
  useEffect(() => { try { const saved = localStorage.getItem('price_currency'); if (saved && saved !== 'USD') setCurrency(saved); } catch {} }, []);
  useEffect(()=>{ try { localStorage.setItem('price_currency', currency); } catch {} }, [currency]);
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  useEffect(() => {
    (async () => {
      try {
        const names = Array.from(new Set(rows.map(r => r.name)));
        if (!names.length) { setPriceMap({}); return; }
        // Direct currency only; GBP requires snapshot rows (no FX fallback)
        const r1 = await fetch('/api/price/snapshot', { method: 'POST', headers: { 'content-type':'application/json' }, body: JSON.stringify({ names, currency }) });
        const j1 = await r1.json().catch(()=>({ ok:false }));
        if (r1.ok && j1?.ok) setPriceMap(j1.prices || {}); else setPriceMap({});
        // Fallback: for missing names, fetch live from Scryfall collection
        try {
          const base = (j1?.prices || {}) as Record<string, number>;
          const need = Array.from(new Set(rows.map(r=>r.name.toLowerCase()))).filter(n => !(n in base)).slice(0, 20);
          if (need.length) {
            const identifiers = need.map(n=>({ name: n }));
            const r2 = await fetch('https://api.scryfall.com/cards/collection', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ identifiers }) });
            const j2:any = await r2.json().catch(()=>({}));
            const arr:any[] = Array.isArray(j2?.data)? j2.data: [];
            const map:any = { ...(j1?.prices||{}) };
            for (const c of arr) {
              const nm = String((c?.name||'')).toLowerCase();
              const prices = c?.prices || {};
              const key = currency==='EUR' ? 'eur' : currency==='GBP' ? 'gbp' : 'usd';
              const v = prices?.[key];
              if (v!=null) map[nm] = Number(v);
            }
            setPriceMap(map);
          }
        } catch {}
      } catch { setPriceMap({}); }
    })();
  }, [rows.map(r=>r.name).join('|'), currency]);
  useEffect(() => {
    (async () => {
      try {
        const names = Array.from(new Set(rows.map(r => r.name))).slice(0, 300);
        if (!names.length) { setImgMap({}); return; }
        const { getImagesForNames } = await import("@/lib/scryfall");
        const m = await getImagesForNames(names);
        const obj: any = {}; m.forEach((v: any, k: string) => { obj[k] = { small: v.small, normal: v.normal }; });
        setImgMap(obj);
      } catch { setImgMap({}); }
    })();
  }, [rows.map(r=>r.name).join('|')]);

  const calcPos = (e: MouseEvent | any) => {
    try {
      const vw = window.innerWidth; const vh = window.innerHeight;
      const margin = 12; const boxW = 320; const boxH = 460; // approximate
      const half = boxW / 2;
      const rawX = e.clientX as number;
      const rawY = e.clientY as number;
      const below = rawY - boxH - margin < 0; // if not enough room above, render below
      const x = Math.min(vw - margin - half, Math.max(margin + half, rawX));
      const y = below ? Math.min(vh - margin, rawY + margin) : Math.max(margin + 1, rawY - margin);
      return { x, y, below };
    } catch {
      return { x: (e as any).clientX || 0, y: (e as any).clientY || 0, below: false };
    }
  };

  return (
    <div className="mt-2" onKeyDown={(e)=>{
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable;
      if (!isTyping && e.key === '/') {
        e.preventDefault();
        try { const el = addBarRef.current?.querySelector('input,textarea'); (el as any)?.focus?.(); } catch {}
      }
    }}>
      {/* Search + quick add */}
      <div className="max-w-xl" ref={addBarRef}><EditorAddBar onAdd={add} /></div>

      {status && <p className="text-red-400 text-sm mt-2">{status}</p>}

      {/* Currency toggle and bulk actions */}
      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {rows.length > 0 && (
            <>
              <button
                onClick={toggleSelectAll}
                className="px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800 transition-colors"
              >
                {selected.size === cards.length && cards.length > 0 ? 'Deselect All' : 'Select All'}
              </button>
              {selected.size > 0 && (
                <button
                  onClick={bulkDelete}
                  className="px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white transition-colors"
                >
                  Delete {selected.size} card{selected.size > 1 ? 's' : ''}
                </button>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="opacity-70">Currency</label>
          <select value={currency} onChange={e=>setCurrency(e.target.value)} className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1">
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2" ref={listRef}>
        {rows.map((c, idx) => (
          <div
            key={c.id}
            data-row-index={idx}
            className="flex items-center justify-between rounded border border-neutral-700 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            tabIndex={0}
            onKeyDown={(e)=>{
              if ((e.target as HTMLElement)?.tagName?.toLowerCase() === 'input') return;
              if (/^[1-9]$/.test(e.key)) { const to = parseInt(e.key,10); if (Number.isFinite(to)) { const diff = to - c.qty; if (diff !== 0) delta(c.id, diff); e.preventDefault(); } }
              if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(c.id, c.name, c.qty); }
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const parent = listRef.current; if (!parent) return;
                const nodes = parent.querySelectorAll('[data-row-index]');
                const me = e.currentTarget as HTMLElement;
                const myIndex = Number((me.getAttribute('data-row-index')||'0'));
                const next = e.key === 'ArrowDown' ? Math.min(nodes.length - 1, myIndex + 1) : Math.max(0, myIndex - 1);
                const target = nodes.item(next) as HTMLElement | null; target?.focus?.();
              }
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggleSelect(c.id)}
                className="w-4 h-4 rounded border-neutral-700 bg-neutral-950 text-emerald-600 focus:ring-emerald-600 focus:ring-offset-0"
                onClick={(e) => e.stopPropagation()}
              />
              <input
                type="number"
                className="w-14 bg-neutral-950 border border-neutral-700 rounded px-1 py-0.5 text-center"
                min={0}
                step={1}
                value={c.qty}
                onChange={(e)=>{ const v = Math.max(0, parseInt(e.target.value||'0',10)); const d = v - c.qty; if (d!==0) delta(c.id, d); }}
              />
              {(() => { const key = c.name.toLowerCase(); const src = imgMap[key]?.small; return src ? (
                <img src={src} alt={c.name} loading="lazy" decoding="async" className="w-[24px] h-[34px] object-cover rounded"
                  onMouseEnter={(e)=>{ const { x, y, below } = calcPos(e as any); setPv({ src: imgMap[key]?.normal || src, x, y, shown: true, below }); }}
                  onMouseMove={(e)=>{ const { x, y, below } = calcPos(e as any); setPv(p=>p.shown?{...p, x, y, below}:p); }}
                  onMouseLeave={()=>setPv(p=>({...p, shown:false}))}
                />) : null; })()}
              <a className="hover:underline truncate max-w-[40vw]" href={`https://scryfall.com/search?q=!\"${encodeURIComponent(c.name)}\"`} target="_blank" rel="noreferrer">{c.name}</a>
            </div>

            <div className="flex items-center gap-2">
              {(() => { try { const key = c.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim(); const unit = priceMap[key]; const hasImg = !!imgMap[c.name.toLowerCase()]?.small; if (unit>0) { const sym = currency==='EUR'?'€':(currency==='GBP'?'£':'$'); return (
                <span className="text-xs opacity-80 w-40 text-right tabular-nums">
                  {sym}{(unit*c.qty).toFixed(2)} <span className="opacity-60">• {sym}{unit.toFixed(2)} each</span>
                </span>
              ); } else { return (
                <span className="text-xs opacity-60 w-40 text-right">
                  — {(!hasImg) && (<button className="underline ml-1" onClick={async()=>{
                    try {
                      const r = await fetch('/api/cards/fuzzy', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ names:[c.name] }) });
                      const j = await r.json();
                      const sugg = j?.results?.[c.name]?.suggestion;
                      if (!sugg) { alert('No suggestion found'); return; }
                      if (!confirm(`Rename to "${sugg}"?`)) return;
                      const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId||'')}`, { method:'PATCH', headers:{'content-type':'application/json'}, body: JSON.stringify({ id: c.id, new_name: sugg }) });
                      const jj = await res.json(); if (!res.ok || jj?.ok===false) throw new Error(jj?.error || 'Rename failed');
                      await load();
                    } catch(e:any){ alert(e?.message || 'Failed'); }
                  }}>fix?</button>)}
                </span>
              ); } } catch {}
              return (<span className="text-xs opacity-40 w-40 text-right">— <button className="underline ml-1" onClick={async()=>{
                try {
                  const r = await fetch('/api/cards/fuzzy', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ names:[c.name] }) });
                  const j = await r.json();
                  const list: string[] = j?.results?.[c.name]?.all || [];
                  if (!Array.isArray(list) || list.length===0) { alert('No suggestion found'); return; }
                  let choice = list[0];
                  if (list.length>1) {
                    const pick = prompt('Pick a number:\n' + list.map((s:any,i:number)=>`${i+1}. ${s}`).join('\n'), '1');
                    const idx = Math.max(1, Math.min(list.length, parseInt(String(pick||'1'),10))) - 1;
                    choice = list[idx];
                  }
                  if (!choice) return;
                  if (!confirm(`Rename to "${choice}"?`)) return;
                  const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId||'')}`, { method:'PATCH', headers:{'content-type':'application/json'}, body: JSON.stringify({ id: c.id, new_name: choice }) });
                  const jj = await res.json(); if (!res.ok || jj?.ok===false) throw new Error(jj?.error || 'Rename failed');
                  await load();
                } catch(e:any){ alert(e?.message || 'Failed'); }
              }}>fix?</button></span>);
              })()}
              <button
                className="ml-3 px-2 py-0.5 text-red-300 border border-red-400 rounded hover:bg-red-950/40 disabled:opacity-50"
                onClick={() => remove(c.id, c.name, c.qty)}
                disabled={busyId === c.id}
              >
                delete
              </button>
            </div>
          </div>
        ))}

        {rows.length === 0 && !status && (
          <p className="text-sm opacity-70">No cards yet — try adding <em>Sol Ring</em>?</p>
        )}
      </div>

      {/* Totals */}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs opacity-70">Cards: <span className="font-mono">{rows.reduce((s,c)=>s+c.qty,0)}</span></div>
        {(() => { try {
          const total = rows.reduce((acc, c) => {
            const norm = c.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
            const unit = priceMap[norm] || 0; return acc + unit * c.qty;
          }, 0);
          const sym = currency==='EUR'?'€':(currency==='GBP'?'£':'$');
          return (<div className="text-sm opacity-90">Est. total (snapshot): <span className="font-mono">{sym}{total.toFixed(2)}</span></div>);
        } catch { return null; } })()}
      </div>

      {/* Global hover preview for card images */}
      {pv.shown && typeof window !== 'undefined' && (
        <div className="fixed z-[9999] pointer-events-none" style={{ left: pv.x, top: pv.y, transform: `translate(-50%, ${pv.below ? '0%' : '-100%'})` }}>
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl w-72 md:w-80 transition-opacity duration-150 ease-out opacity-100" style={{ minWidth: '18rem' }}>
            <img src={pv.src} alt="preview" className="block w-full h-auto max-h-[70vh] max-w-none object-contain rounded" />
          </div>
        </div>
      )}
    </div>
  );
}
