// app/collections/[id]/Client.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ExportCollectionCSV from "@/components/ExportCollectionCSV";
import CollectionCsvUpload from "@/components/CollectionCsvUpload";

type Item = { id: string; name: string; qty: number; created_at?: string };

export default function CollectionClient({ collectionId: idProp }: { collectionId?: string }) {
  const params = useParams();
  const collectionId = useMemo(() => {
    const pid = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params?.id[0] : undefined;
    return idProp || pid;
  }, [params, idProp]);

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1200);
  }

  async function load() {
    if (!collectionId) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/collections/cards?collectionId=${collectionId}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setItems(json.items || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [collectionId]);

  useEffect(() => {
    function onImported(e: any) {
      if (!collectionId) return;
      if (e?.detail?.collectionId && e.detail.collectionId !== collectionId) return;
      load();
    }
    window.addEventListener("collection:csv-imported", onImported);
    return () => window.removeEventListener("collection:csv-imported", onImported);
  }, [collectionId]);

  async function add() {
    if (!collectionId || !name.trim()) return;
    try { const { containsProfanity } = await import("@/lib/profanity"); if (containsProfanity(name)) { alert('Please choose a different name.'); return; } } catch {}
    const safeName = name.trim();
    const res = await fetch(`/api/collections/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collectionId, name: safeName, qty }),
    });
    const json = await res.json();
    if (!res.ok || !json?.ok) {
      alert(json?.error || "Add failed");
      return;
    }
    setName("");
    setQty(1);
    await load();
    showToast(`Added x${qty} ${safeName}`);
  }

  async function bump(item: Item, delta: number) {
    const res = await fetch(`/api/collections/cards`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, delta }),
    });
    const json = await res.json();
    if (!res.ok || !json?.ok) {
      alert(json?.error || "Update failed");
      return;
    }
    await load();
    if (delta > 0) showToast(`Added x${delta} ${item.name}`);
    else if (delta < 0) showToast(`Removed x${Math.abs(delta)} ${item.name}`);
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
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map(i => i.id)));
    }
  }

  async function bulkDelete() {
    if (!collectionId || selected.size === 0) return;
    
    const itemsToDelete = items.filter(i => selected.has(i.id));
    const { undoToastManager } = await import('@/lib/undo-toast');
    const { capture } = await import('@/lib/ph');
    
    // OPTIMISTIC UI: Remove from UI immediately
    setItems(prev => prev.filter(i => !selected.has(i.id)));
    setSelected(new Set());
    
    // Track bulk delete
    try {
      capture('bulk_delete_collection_items', {
        collection_id: collectionId,
        count: itemsToDelete.length,
        item_names: itemsToDelete.map(i => i.name).join(', ')
      });
    } catch {}
    
    // Delete from database immediately (in background)
    const deletePromises = itemsToDelete.map(item =>
      fetch(`/api/collections/cards`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      })
    );
    
    // Execute all deletions
    Promise.all(deletePromises)
      .catch((e) => {
        console.error('Failed to bulk delete:', e);
        // Reload to show actual state if deletion failed
        load();
      });
    
    // Show undo toast
    undoToastManager.showUndo({
      id: 'bulk-delete-collection-items',
      message: `${itemsToDelete.length} item${itemsToDelete.length > 1 ? 's' : ''} deleted`,
      duration: 8000,
      onUndo: async () => {
        // Restore all deleted items
        try {
          for (const item of itemsToDelete) {
            await fetch(`/api/collections/cards`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ collectionId, name: item.name, qty: item.qty }),
            });
          }
          showToast(`Restored ${itemsToDelete.length} items`);
          await load();
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

  async function remove(item: Item) {
    if (!confirm(`Are you sure you want to delete ${item.name}?`)) return;
    const res = await fetch(`/api/collections/cards`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id }),
    });
    const json = await res.json();
    if (!res.ok || !json?.ok) {
      alert(json?.error || "Delete failed");
      return;
    }
    await load();
    showToast(`Removed ${item.name}`);
  }

  // Scryfall images for list + hover
  const [imgMap, setImgMap] = useState<Record<string, { small?: string; normal?: string }>>({});
  const [pv, setPv] = useState<{ src: string; x: number; y: number; shown: boolean; below: boolean }>({ src: "", x: 0, y: 0, shown: false, below: false });

  // Currency toggle + snapshot prices
  // Avoid hydration mismatch: read localStorage after mount
  const [currency, setCurrency] = useState<string>('USD');
  useEffect(() => { try { const saved = localStorage.getItem('price_currency'); if (saved && saved !== 'USD') setCurrency(saved); } catch {} }, []);
  useEffect(()=>{ try { localStorage.setItem('price_currency', currency); } catch {} }, [currency]);
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  useEffect(() => {
    (async () => {
      try {
        const names = Array.from(new Set(items.map(i=>i.name)));
        if (!names.length) { setPriceMap({}); return; }
        // Clear price map when currency changes to avoid stale data
        setPriceMap({});
        // Direct currency only; GBP requires snapshot rows - use cache: no-store to ensure fresh data
        const r1 = await fetch('/api/price/snapshot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ names, currency }), cache: 'no-store' });
        const j1 = await r1.json().catch(()=>({ ok:false }));
        if (r1.ok && j1?.ok) setPriceMap(j1.prices || {}); else setPriceMap({});
      } catch { setPriceMap({}); }
    })();
  }, [items.map(i=>i.name).join('|'), currency]);
  useEffect(() => {
    (async () => {
      try {
        const names = Array.from(new Set(items.map(i=>i.name))).slice(0, 400);
        if (!names.length) { setImgMap({}); return; }
        const { getImagesForNames } = await import("@/lib/scryfall");
        const m = await getImagesForNames(names);
        const obj: any = {}; m.forEach((v: any, k: string) => { obj[k] = { small: v.small, normal: v.normal }; });
        setImgMap(obj);
      } catch { setImgMap({}); }
    })();
  }, [items.map(i=>i.name).join('|')]);

  const calcPos = (e: MouseEvent | any) => {
    try {
      const vw = window.innerWidth; const vh = window.innerHeight;
      const margin = 12; const boxW = 320; const boxH = 460; // approximate
      const half = boxW / 2;
      const rawX = e.clientX as number;
      const rawY = e.clientY as number;
      const below = rawY - boxH - margin < 0;
      const x = Math.min(vw - margin - half, Math.max(margin + half, rawX));
      const y = below ? Math.min(vh - margin, rawY + margin) : Math.max(margin + 1, rawY - margin);
      return { x, y, below };
    } catch {
      return { x: (e as any).clientX || 0, y: (e as any).clientY || 0, below: false };
    }
  };

  return (
    <div className="space-y-3 relative">
      {/* Header with export & upload */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Collection</h3>
        <div className="flex items-center gap-2">
          <a href="/wishlist" className="text-xs underline underline-offset-4 text-blue-600">My Wishlist →</a>
          {collectionId ? (
            <a href={`/collections/cost-to-finish?collectionId=${encodeURIComponent(String(collectionId))}`} className="text-xs underline underline-offset-4">Cost to Finish →</a>
          ) : null}
          {collectionId ? <CollectionCsvUpload collectionId={collectionId} mode="existing" onDone={load} /> : null}
          {collectionId ? <ExportCollectionCSV collectionId={collectionId} small /> : null}
        </div>
      </div>

      {/* Add row */}
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Card name"
          className="flex-1 border rounded px-2 py-1 text-sm bg-transparent"
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <input
          type="number"
          value={qty}
          min={1}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value || 1)))}
          className="w-16 border rounded px-2 py-1 text-sm bg-transparent"
        />
        <button onClick={add} className="border rounded px-2 py-1 text-sm">Add</button>
      </div>

      {/* List */}
      {loading && <div className="text-xs opacity-70">Loading…</div>}
      {error && <div className="text-xs text-red-500">Error: {error}</div>}

      {/* Bulk actions and Currency toggle */}
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <>
              <button
                onClick={toggleSelectAll}
                className="px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800 transition-colors"
              >
                {selected.size === items.length && items.length > 0 ? 'Deselect All' : 'Select All'}
              </button>
              {selected.size > 0 && (
                <button
                  onClick={bulkDelete}
                  className="px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white transition-colors"
                >
                  Delete {selected.size} item{selected.size > 1 ? 's' : ''}
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

      {!loading && !error && (
        items.length ? (
          <>
          <ul className="space-y-1">
            {items.map((it) => (
              <li key={it.id} className="flex items-center justify-between rounded border px-3 py-2">
                <span className="text-sm inline-flex items-center gap-2 min-w-0">
                  <input
                    type="checkbox"
                    checked={selected.has(it.id)}
                    onChange={() => toggleSelect(it.id)}
                    className="w-4 h-4 rounded border-neutral-700 bg-neutral-950 text-emerald-600 focus:ring-emerald-600 focus:ring-offset-0"
                  />
                  <input type="number" min={0} step={1} value={it.qty}
                    className="w-14 bg-neutral-950 border border-neutral-700 rounded px-1 py-0.5 text-center"
                    onChange={(e)=>{ const v = Math.max(0, parseInt(e.target.value||'0',10)); const d = v - it.qty; if (d!==0) bump(it, d); }} />
                  {(() => { const key = it.name.toLowerCase(); const src = (imgMap as any)?.[key]?.small; return src ? (
                    <img src={src} alt={it.name} loading="lazy" decoding="async" className="w-[24px] h-[34px] object-cover rounded"
onMouseEnter={(e)=>{ const { x, y, below } = calcPos(e as any); setPv({ src: (imgMap as any)?.[key]?.normal || src, x, y, shown: true, below }); }}
                      onMouseMove={(e)=>{ const { x, y, below } = calcPos(e as any); setPv(p=>p.shown?{...p, x, y, below}:p); }}
                      onMouseLeave={()=>setPv(p=>({...p, shown:false}))}
                    />) : null; })()}
                  <a className="hover:underline" href={`https://scryfall.com/search?q=!\"${encodeURIComponent(it.name)}\"`} target="_blank" rel="noreferrer">{it.name}</a>
                </span>
                <div className="flex items-center gap-2">
                  {(() => { try { const norm = it.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim(); const unit = priceMap[norm]; if (unit>0) { const sym = currency==='EUR'?'€':(currency==='GBP'?'£':'$'); return (<span className="text-xs opacity-80 w-32 text-right tabular-nums">{sym}{(unit*it.qty).toFixed(2)} <span className="opacity-60">• {sym}{unit.toFixed(2)} each</span></span>); } else { return (<span className="text-xs opacity-60 w-32 text-right">— <button className="underline ml-1" onClick={async()=>{ try { const r = await fetch('/api/cards/fuzzy', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ names:[it.name] }) }); const j = await r.json(); const sugg = j?.results?.[it.name]?.suggestion; if (!sugg) { alert('No suggestion found'); return; } if (!confirm(`Rename to "${sugg}"?`)) return; const res = await fetch('/api/collections/cards', { method:'PATCH', headers:{'content-type':'application/json'}, body: JSON.stringify({ id: it.id, new_name: sugg }) }); const jj = await res.json(); if (!res.ok || jj?.ok===false) throw new Error(jj?.error || 'Rename failed'); await load(); } catch(e:any){ alert(e?.message || 'Failed'); } }}>fix?</button></span>); } } catch {} return (<span className="text-xs opacity-40 w-20 text-right">—</span>); })()}
                  <button className="text-xs text-red-500 underline" onClick={() => remove(it)}>delete</button>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between">
            <div className="text-xs opacity-70">Cards: <span className="font-mono">{items.reduce((s,it)=>s+it.qty,0)}</span></div>
{(() => { try { const total = items.reduce((acc,it)=>{ const norm = it.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim(); const unit = priceMap[norm] || 0; return acc + unit*it.qty; },0); const sym = currency==='EUR'?'€':(currency==='GBP'?'£':'$'); return (<div className="text-sm opacity-90">Est. total (snapshot): <span className="font-mono">{sym}{total.toFixed(2)}</span></div>); } catch { return null; } })()}
          </div>
          </>
          
        ) : (
          <div className="text-xs text-muted-foreground rounded border p-3">
            No cards in this collection yet — try adding <span className="font-medium">Lightning Bolt</span>?<br />
            Tip: type a card and press <span className="font-mono">Enter</span>.
          </div>
        )
      )}

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed bottom-4 right-4 rounded bg-black/80 text-white text-xs px-3 py-2 shadow">
          {toast}
        </div>
      )}

      {/* Hover preview */}
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
