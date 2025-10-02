"use client";
import React from "react";

export default function FixNamesModal({ deckId, open, onClose }: { deckId: string; open: boolean; onClose: ()=>void }){
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<Array<{ id: string; name: string; suggestions: string[]; choice?: string }>>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        setLoading(true);
        const r = await fetch(`/api/decks/fix-names?deckId=${encodeURIComponent(deckId)}`, { cache:'no-store' });
        const j = await r.json().catch(()=>({}));
        if (!r.ok || j?.ok===false) throw new Error(j?.error || 'Load failed');
        const arr: any[] = Array.isArray(j.items) ? j.items : [];
        setItems(arr.map(it => ({ ...it, choice: (it.suggestions||[])[0] || '' })));
      } catch (e:any) { alert(e?.message || 'Failed to load fixes'); onClose(); }
      finally { setLoading(false); }
    })();
  }, [open, deckId]);

  async function apply(){
    try {
      setSaving(true);
      for (const it of items) {
        const c = (it.choice||'').trim(); if (!c) continue;
        const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, { method:'PATCH', headers:{'content-type':'application/json'}, body: JSON.stringify({ id: it.id, new_name: c }) });
        const j = await res.json().catch(()=>({}));
        if (!res.ok || j?.ok===false) throw new Error(j?.error || 'Rename failed');
      }
      onClose();
      try { window.location.reload(); } catch {}
    } catch (e:any) { alert(e?.message || 'Apply failed'); }
    finally { setSaving(false); }
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
              <div key={it.id} className="flex items-center gap-2">
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
          <button onClick={onClose} className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs">Close</button>
          <button onClick={apply} disabled={saving || loading || items.length===0} className="px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-xs">Apply</button>
        </div>
      </div>
    </div>
  );
}
