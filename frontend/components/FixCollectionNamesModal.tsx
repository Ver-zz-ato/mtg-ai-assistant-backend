"use client";
import React from "react";
import { toast as showToast } from "@/lib/toast-client";

export default function FixCollectionNamesModal({ 
  collectionId, 
  open, 
  onClose 
}: { 
  collectionId: string; 
  open: boolean; 
  onClose: () => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<Array<{ id: string; name: string; suggestions: string[]; choice?: string }>>([]);
  const [saving, setSaving] = React.useState(false);
  const [currentIndex, setCurrentIndex] = React.useState(0);

  React.useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        setLoading(true);
        const r = await fetch(`/api/collections/fix-names?collectionId=${encodeURIComponent(collectionId)}`, { cache:'no-store' });
        const j = await r.json().catch(()=>({}));
        if (!r.ok || j?.ok===false) throw new Error(j?.error || 'Load failed');
        const arr: any[] = Array.isArray(j.items) ? j.items : [];
        setItems(arr.map(it => ({ ...it, choice: (it.suggestions||[])[0] || '' })));
      } catch (e:any) { showToast(e?.message || 'Failed to load fixes', 'error'); onClose(); }
      finally { setLoading(false); }
    })();
  }, [open, collectionId]);

  async function apply(){
    try {
      setSaving(true);
      setCurrentIndex(0);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        setCurrentIndex(i);
        const c = (it.choice||'').trim(); if (!c) continue;
        const res = await fetch(`/api/collections/cards`, { 
          method:'PATCH', 
          headers:{'content-type':'application/json'}, 
          body: JSON.stringify({ id: it.id, new_name: c }) 
        });
        const j = await res.json().catch(()=>({}));
        if (!res.ok || j?.ok===false) throw new Error(j?.error || 'Rename failed');
      }
      onClose();
      try { window.location.reload(); } catch {}
    } catch (e:any) { showToast(e?.message || 'Apply failed', 'error'); }
    finally { setSaving(false); setCurrentIndex(0); }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <div className="max-w-xl w-full rounded-xl border border-neutral-700 bg-neutral-900 p-5 text-sm shadow-2xl" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">✏️</span>
          <h3 className="text-lg font-bold bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">
            Fix Card Names
          </h3>
        </div>
        {loading && (
          <div className="flex items-center gap-2 py-8 justify-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-400"></div>
            <span className="text-neutral-400">Checking card names...</span>
          </div>
        )}
        {!loading && items.length===0 && (
          <div className="py-8 text-center space-y-2">
            <div className="text-4xl">✅</div>
            <div className="text-base font-medium text-neutral-200">All card names look good!</div>
            <div className="text-xs text-neutral-400">All cards in your collection are recognized and match our database.</div>
          </div>
        )}
        {!loading && items.length>0 && (
          <>
            <div className="mb-3 text-xs text-neutral-400">
              Found <span className="font-semibold text-orange-400">{items.length}</span> card{items.length !== 1 ? 's' : ''} that need fixing. Select the correct name from the dropdown:
            </div>
            <div className="space-y-2 max-h-[50vh] overflow-auto pr-2 custom-scrollbar">
              {items.map((it, idx) => (
                <div key={it.id} className="flex items-center gap-3 p-3 rounded-lg bg-neutral-800/50 border border-neutral-700/50 hover:border-neutral-600 transition-colors">
                  <div className="flex-1 font-medium text-neutral-200 truncate">{it.name}</div>
                  <svg className="w-4 h-4 text-orange-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  <select value={it.choice} onChange={e=>setItems(arr => { const next = arr.slice(); next[idx] = { ...it, choice: e.target.value }; return next; })}
                    className="bg-neutral-950 border border-neutral-600 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent min-w-[180px]">
                    {it.suggestions.map(s => (<option key={s} value={s}>{s}</option>))}
                  </select>
                </div>
              ))}
            </div>
            {saving && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                  Fixing {currentIndex + 1} of {items.length} cards...
                </div>
                <div className="bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-orange-500 to-red-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${((currentIndex + 1) / items.length) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </>
        )}
        <div className="mt-5 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-neutral-700 hover:bg-neutral-800 text-sm font-medium transition-colors">
            Close
          </button>
          <button onClick={apply} disabled={saving || loading || items.length===0} className="px-4 py-2 rounded-lg bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white text-sm font-semibold transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? 'Applying...' : 'Apply Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
