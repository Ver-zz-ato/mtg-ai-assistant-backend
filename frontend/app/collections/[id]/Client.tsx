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

  async function remove(item: Item) {
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
          {collectionId ? (
            <a href={`/collections/cost-to-finish?collectionId=${encodeURIComponent(String(collectionId))}`} className="text-xs underline underline-offset-4">Open Cost to Finish →</a>
          ) : null}
          {collectionId ? <CollectionCsvUpload collectionId={collectionId} onDone={load} /> : null}
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

      {!loading && !error && (
        items.length ? (
          <ul className="space-y-1">
            {items.map((it) => (
              <li key={it.id} className="flex items-center justify-between rounded border px-3 py-2">
                <span className="text-sm inline-flex items-center gap-2">
                  {(() => { const key = it.name.toLowerCase(); const src = (imgMap as any)?.[key]?.small; return src ? (
                    <img src={src} alt={it.name} loading="lazy" decoding="async" className="w-[24px] h-[34px] object-cover rounded"
onMouseEnter={(e)=>{ const { x, y, below } = calcPos(e as any); setPv({ src: (imgMap as any)?.[key]?.normal || src, x, y, shown: true, below }); }}
                      onMouseMove={(e)=>{ const { x, y, below } = calcPos(e as any); setPv(p=>p.shown?{...p, x, y, below}:p); }}
                      onMouseLeave={()=>setPv(p=>({...p, shown:false}))}
                    />) : null; })()}
                  <a className="hover:underline" href={`https://scryfall.com/search?q=!\"${encodeURIComponent(it.name)}\"`} target="_blank" rel="noreferrer">{it.name}</a>
                </span>
                <div className="flex items-center gap-2">
                  <button className="text-xs border rounded px-2 py-1" onClick={() => bump(it, -1)}>-</button>
                  <span className="text-xs opacity-75">x{it.qty}</span>
                  <button className="text-xs border rounded px-2 py-1" onClick={() => bump(it, +1)}>+</button>
                  <button className="text-xs text-red-500 underline" onClick={() => remove(it)}>delete</button>
                </div>
              </li>
            ))}
          </ul>
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
