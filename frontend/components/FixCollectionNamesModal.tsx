"use client";
import React from "react";

export type FixCollectionNamesModalProps = {
  collectionId: string;
  open: boolean;
  onClose: ()=>void;
};

export default function FixCollectionNamesModal({ collectionId, open, onClose }: FixCollectionNamesModalProps){
  const [loading, setLoading] = React.useState(false);
  const [rows, setRows] = React.useState<Array<{ id: string; name: string; suggestions: string[]; choice?: string }>>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(()=>{
    if(!open) return;
    (async()=>{
      try{
        setLoading(true);
        // fetch current cards
        const r = await fetch(`/api/collections/cards?collectionId=${encodeURIComponent(collectionId)}`, { cache:'no-store' });
        const j = await r.json().catch(()=>({}));
        if(!r.ok || j?.ok===false) throw new Error(j?.error||'load failed');
        const items: Array<{ id:string; name:string }> = (j.items||[]).map((it:any)=>({ id: it.id, name: it.name }));
        const names = Array.from(new Set(items.map(i=>i.name)));
        const r2 = await fetch('/api/cards/fuzzy', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ names }) });
        const j2 = await r2.json().catch(()=>({}));
        if(!r2.ok || j2?.ok===false) throw new Error(j2?.error||'fuzzy failed');
        const sugg: Record<string,{ suggestion?:string; all?:string[] }> = j2.results||{};
        const out: Array<{ id:string; name:string; suggestions:string[]; choice?:string }> = [];
        for(const it of items){
          const s = sugg[it.name]?.all || [];
          if(s.length && s[0]!==it.name){ out.push({ id: it.id, name: it.name, suggestions: s, choice: s[0] }); }
        }
        setRows(out);
      }catch(e:any){ alert(e?.message||'failed'); onClose(); }
      finally{ setLoading(false); }
    })();
  }, [open, collectionId]);

  async function apply(){
    try{
      setSaving(true);
      for(const it of rows){
        const next = String(it.choice||'').trim(); if(!next) continue;
        const res = await fetch('/api/collections/cards', { method:'PATCH', headers:{'content-type':'application/json'}, body: JSON.stringify({ id: it.id, new_name: next }) });
        const jj = await res.json().catch(()=>({}));
        if(!res.ok || jj?.ok===false) throw new Error(jj?.error||'rename failed');
      }
      onClose();
      try{ window.location.reload(); }catch{}
    }catch(e:any){ alert(e?.message||'apply failed'); }
    finally{ setSaving(false); }
  }

  if(!open) return null;
  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full rounded border border-neutral-700 bg-neutral-950 p-3 text-sm">
        <div className="font-semibold mb-2">Fix card names</div>
        {loading && <div className="text-xs opacity-70">Analyzing…</div>}
        {!loading && rows.length===0 && (<div className="text-xs opacity-80">All names look good.</div>)}
        {!loading && rows.length>0 && (
          <div className="space-y-2 max-h-[60vh] overflow-auto pr-2">
            {rows.map((it, idx)=> (
              <div key={it.id} className="grid grid-cols-3 items-center gap-2">
                <div className="truncate" title={it.name}>{it.name}</div>
                <select value={it.choice} onChange={e=> setRows(arr=>{ const next=arr.slice(); next[idx] = { ...it, choice: e.target.value }; return next; })} className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs">
                  {(it.suggestions||[]).map(s=> (<option key={s} value={s}>{s}</option>))}
                </select>
                <div className="text-right"><button onClick={()=> setRows(arr=> arr.filter((_,i)=>i!==idx))} className="text-xs underline opacity-80">Ignore</button></div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs">Close</button>
          <button onClick={apply} disabled={saving||loading||rows.length===0} className="px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-xs">Apply</button>
        </div>
      </div>
    </div>
  );
}
