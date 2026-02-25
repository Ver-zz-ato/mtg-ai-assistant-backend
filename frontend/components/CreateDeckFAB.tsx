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
      <button 
        onClick={()=>setOpen(true)} 
        className="group fixed bottom-6 right-6 w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 hover:from-blue-400 hover:via-purple-400 hover:to-pink-400 text-white shadow-[0_0_20px_rgba(139,92,246,0.5)] hover:shadow-[0_0_30px_rgba(139,92,246,0.7)] transition-all transform hover:scale-110 active:scale-95 z-50"
        aria-label="Create new deck"
      >
        <div className="flex flex-col items-center justify-center">
          <svg className="w-8 h-8 group-hover:rotate-90 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-[9px] font-bold mt-0.5">NEW</span>
        </div>
      </button>
      <Modal open={open} title="✨ Create New Deck" onClose={()=>setOpen(false)}>
        <div className="space-y-4">
          <input 
            value={name} 
            onChange={e=>setName(e.target.value)} 
            onKeyDown={e => e.key === 'Enter' && !busy && name.trim() && create()}
            placeholder="Enter deck name..." 
            autoFocus
            className="w-full bg-neutral-950 border-2 border-neutral-700 focus:border-blue-500 rounded-lg px-4 py-3 text-white placeholder:text-gray-500 transition-colors"
          />
          <div className="flex justify-end gap-3">
            <button 
              onClick={()=>setOpen(false)} 
              className="px-6 py-2.5 rounded-lg border-2 border-neutral-700 text-white hover:bg-neutral-800 transition-colors font-medium"
            >
              Cancel
            </button>
            <button 
              onClick={create} 
              disabled={busy||!name.trim()} 
              className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold shadow-lg transition-all"
            >
              {busy ? 'Creating...' : 'Create Deck'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}