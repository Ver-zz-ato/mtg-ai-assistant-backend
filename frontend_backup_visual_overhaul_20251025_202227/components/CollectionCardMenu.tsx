"use client";
import React from "react";

export default function CollectionCardMenu({ id, name }: { id:string; name?:string }){
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement|null>(null);
  React.useEffect(()=>{ function onDoc(e:any){ if(!ref.current?.contains(e.target)) setOpen(false); } document.addEventListener('mousedown', onDoc); return ()=> document.removeEventListener('mousedown', onDoc); },[]);

  async function snapshot(){ try{ const r = await fetch(`/api/collections/cards?collectionId=${encodeURIComponent(id)}`); const j = await r.json(); const names = Array.from(new Set((j?.items||[]).map((it:any)=>it.name))); if(names.length){ await fetch('/api/price/snapshot', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ names, currency:'USD' }) }); } alert('Snapshot requested'); } catch{ alert('Snapshot request queued'); } setOpen(false); }
  async function del(){ const typed = prompt(`Type the collection name to delete: ${name||'collection'}`); if(!typed || typed.trim()!==(name||'').trim()) return; await fetch('/api/collections/delete', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ id }) }); window.location.reload(); }

  return (
    <div className="relative">
      <button onClick={()=>setOpen(v=>!v)} className="px-2 py-1 rounded border border-neutral-700 text-xs" title="More">⋯</button>
      {open && (
        <div className="absolute right-0 mt-1 w-44 rounded border border-neutral-800 bg-neutral-950 shadow-xl z-20 text-sm">
          <button onClick={snapshot} className="w-full text-left px-3 py-2 hover:bg-neutral-900">Price snapshot</button>
          <button onClick={del} className="w-full text-left px-3 py-2 hover:bg-neutral-900 text-red-400">Delete</button>
        </div>
      )}
    </div>
  );
}