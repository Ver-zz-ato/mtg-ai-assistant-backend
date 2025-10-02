"use client";
import React from "react";
import Modal from "@/components/Modal";

export default function CreateDeckFAB(){
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  async function create(){
    if (!name.trim()) return;
    setBusy(true);
    try{
      const r = await fetch('/api/decks/create', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ title: name.trim() }) });
      const j = await r.json().catch(()=>({})); if(!r.ok || j?.ok===false) throw new Error(j?.error||'Create failed');
      window.location.href = `/my-decks/${encodeURIComponent(j.id || '')}`;
    } catch(e:any){ alert(e?.message||'Create failed'); setBusy(false); }
  }
  return (
    <>
      <button onClick={()=>setOpen(true)} className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xl shadow-xl">+</button>
      <Modal open={open} title="Create new deck" onClose={()=>setOpen(false)}>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Deck name" className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" />
        <div className="flex justify-end gap-2">
          <button onClick={()=>setOpen(false)} className="px-3 py-1.5 rounded border border-neutral-700 text-sm">Cancel</button>
          <button onClick={create} disabled={busy||!name.trim()} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-sm text-white">Create</button>
        </div>
      </Modal>
    </>
  );
}