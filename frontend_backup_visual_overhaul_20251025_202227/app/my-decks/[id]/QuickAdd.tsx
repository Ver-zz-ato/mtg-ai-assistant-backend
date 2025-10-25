"use client";
import React from "react";

export default function QuickAdd({ deckId }: { deckId: string }){
  const [line, setLine] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const h = (e: any) => { const v = String(e?.detail || '').trim(); if (v) setLine(v); };
    window.addEventListener('quickadd:prefill', h as any);
    return () => window.removeEventListener('quickadd:prefill', h as any);
  }, []);

  async function run(){
    const s = line.trim(); if (!s) return;
    // Patterns: "add 3 Sol Ring" or "3x Sol Ring" or "3 Sol Ring" or just a name
    let qty = 1; let name = s;
    const addRe = /^add\s+/i; name = name.replace(addRe, "");
    const m1 = name.match(/^(\d+)\s*[xX]?\s+(.+)$/); if (m1) { qty = Math.max(1, parseInt(m1[1],10)); name = m1[2]; }
    setBusy(true);
    try {
      const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ name, qty }) });
      const j = await res.json().catch(()=>({}));
      if (!res.ok || j?.ok===false) throw new Error(j?.error || 'Add failed');
      try { window.dispatchEvent(new Event('deck:changed')); } catch {}
      setLine("");
    } catch(e:any){ alert(e?.message || 'Add failed'); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded border border-neutral-800 p-2 text-xs space-y-2">
      <div className="font-medium text-sm">Quick add to this deck</div>
      <div className="flex items-center gap-2">
        <input value={line} onChange={e=>setLine(e.target.value)} placeholder="add 3 Sol Ring" className="flex-1 bg-neutral-950 border border-neutral-700 rounded px-2 py-1" />
        <button onClick={run} disabled={busy} className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700">Add</button>
      </div>
    </div>
  );
}
