// app/my-decks/[id]/CardsPane.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import EditorAddBar from "@/components/EditorAddBar";

type CardRow = { id: string; deck_id: string; name: string; qty: number; created_at: string };

export default function CardsPane({ deckId }: { deckId?: string }) {
  const [cards, setCards] = useState<CardRow[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    if (!deckId) return;
    const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, { cache: "no-store" });
    let json: any = {};
    try { json = await res.json(); } catch { json = { ok: false, error: "Bad JSON" }; }
    if (!json?.ok) { setStatus(json?.error || `Error ${res.status}`); return; }
    setCards(json.cards || []);
    setStatus(null);
  }

  useEffect(() => { load(); }, [deckId]);

  async function add(name: string | { name: string }, qty: number) {
    if (!deckId) return;
    const n = (typeof name === "string" ? name : name?.name)?.trim();
    const q = Math.max(1, Number(qty) || 1);
    if (!n) return;
    try { const { containsProfanity } = await import("@/lib/profanity"); if (containsProfanity(n)) { alert('Please choose a different name.'); return; } } catch {}

    const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n, qty: q }),
    });
    const json = await res.json().catch(() => ({ ok: false, error: "Bad JSON" }));
    if (!json.ok) { alert(json.error || "Failed to add"); return; }

    window.dispatchEvent(new CustomEvent("toast", { detail: `Added x${q} ${n}` }));
    await load();
  }

  async function delta(id: string, d: number) {
    if (!deckId) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, delta: d }),
      });
      const json = await res.json().catch(() => ({ ok: false, error: "Bad JSON" }));
      if (!json.ok) throw new Error(json.error || "Update failed");
      window.dispatchEvent(new CustomEvent("toast", { detail: d > 0 ? "Added +1" : "Removed -1" }));
      await load();
    } catch (e: any) {
      alert(e?.message || "Error");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string, name: string) {
    if (!deckId) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/decks/cards?id=${encodeURIComponent(id)}&deckid=${encodeURIComponent(deckId)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({ ok: false, error: "Bad JSON" }));
      if (!json.ok) throw new Error(json.error || "Delete failed");
      window.dispatchEvent(new CustomEvent("toast", { detail: `Deleted ${name}` }));
      await load();
    } catch (e: any) {
      alert(e?.message || "Error");
    } finally {
      setBusyId(null);
    }
  }

  // render each actual row (not grouped), sorted by name for a stable view
  const rows = useMemo(() => [...cards].sort((a, b) => a.name.localeCompare(b.name)), [cards]);

  // Scryfall images (thumb + hover)
  const [imgMap, setImgMap] = useState<Record<string, { small?: string; normal?: string }>>({});
  const [pv, setPv] = useState<{ src: string; x: number; y: number; shown: boolean; below: boolean }>({ src: "", x: 0, y: 0, shown: false, below: false });
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
    <div className="mt-2">
      {/* Search + quick add */}
      <div className="max-w-xl"><EditorAddBar onAdd={add} /></div>

      {status && <p className="text-red-400 text-sm mt-2">{status}</p>}

      <div className="mt-3 flex flex-col gap-2">
        {rows.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between rounded border border-neutral-700 px-2 py-1"
          >
            <span className="truncate pr-2 flex items-center gap-2">
              {(() => { const key = c.name.toLowerCase(); const src = imgMap[key]?.small; return src ? (
                <img src={src} alt={c.name} loading="lazy" decoding="async" className="w-[24px] h-[34px] object-cover rounded"
onMouseEnter={(e)=>{ const { x, y, below } = calcPos(e as any); setPv({ src: imgMap[key]?.normal || src, x, y, shown: true, below }); }}
                  onMouseMove={(e)=>{ const { x, y, below } = calcPos(e as any); setPv(p=>p.shown?{...p, x, y, below}:p); }}
                  onMouseLeave={()=>setPv(p=>({...p, shown:false}))}
                />) : null; })()}
              <a className="hover:underline" href={`https://scryfall.com/search?q=!\"${encodeURIComponent(c.name)}\"`} target="_blank" rel="noreferrer">{c.name}</a>
            </span>

            <div className="flex items-center gap-2">
              <button
                className="px-2 py-0.5 rounded border border-neutral-600 hover:bg-neutral-800 disabled:opacity-50"
                onClick={() => delta(c.id, -1)}
                disabled={busyId === c.id}
                aria-label={`Remove one ${c.name}`}
              >
                −
              </button>
              <span className="w-10 text-center opacity-80 select-none">x{c.qty}</span>
              <button
                className="px-2 py-0.5 rounded border border-neutral-600 hover:bg-neutral-800 disabled:opacity-50"
                onClick={() => delta(c.id, +1)}
                disabled={busyId === c.id}
                aria-label={`Add one ${c.name}`}
              >
                +
              </button>

              <button
                className="ml-3 px-2 py-0.5 text-red-300 border border-red-400 rounded hover:bg-red-950/40 disabled:opacity-50"
                onClick={() => remove(c.id, c.name)}
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
