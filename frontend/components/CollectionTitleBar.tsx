"use client";
import React from "react";
import { useRouter } from "next/navigation";

export default function CollectionTitleBar({ collectionId }: { collectionId: string }){
  const [name, setName] = React.useState<string>("");
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const router = useRouter();

  React.useEffect(()=>{ (async()=>{ try{ const r = await fetch(`/api/collections/title?id=${encodeURIComponent(collectionId)}`, { cache:'no-store' }); const j = await r.json().catch(()=>({})); if(r.ok) setName(String(j?.name||'')); } catch{} })(); }, [collectionId]);

  async function save(){
    if(!name.trim()) return;
    setBusy(true);
    try{
      const r = await fetch('/api/collections/title', { method:'PATCH', headers:{'content-type':'application/json'}, body: JSON.stringify({ id: collectionId, name: name.trim() }) });
      const j = await r.json().catch(()=>({}));
      if(!r.ok || j?.ok===false) throw new Error(j?.error||'Rename failed');
      setEditing(false);
    }catch(e:any){ alert(e?.message||'Rename failed'); }
    finally{ setBusy(false); }
  }

  async function onDelete(){
    const typed = prompt('Type DELETE to confirm you want to delete this collection.');
    if (typed !== 'DELETE') return;
    try{
      const r = await fetch('/api/collections/delete', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ id: collectionId }) });
      const j = await r.json().catch(()=>({}));
      if(!r.ok || j?.ok===false) throw new Error(j?.error||'Delete failed');
      router.push('/collections');
    }catch(e:any){ alert(e?.message||'Delete failed'); }
  }

  return (
    <div className="flex items-center gap-3">
      {editing ? (
        <>
          <input value={name} onChange={e=>setName(e.target.value)} className="w-80 bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm" />
          <button onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white text-sm font-medium transition-all shadow-md hover:shadow-lg disabled:opacity-50">Save</button>
          <button onClick={()=>setEditing(false)} disabled={busy} className="px-4 py-2 rounded-lg border border-neutral-700 hover:bg-neutral-800 text-sm font-medium transition-colors">Cancel</button>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold truncate" title={name}>{name || 'Collection'}</h1>
          <button onClick={()=>setEditing(true)} className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-medium transition-all shadow-md hover:shadow-lg">Rename</button>
          <button onClick={onDelete} className="px-4 py-2 rounded-lg bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-sm font-medium transition-all shadow-md hover:shadow-lg">Delete</button>
        </>
      )}
    </div>
  );
}
