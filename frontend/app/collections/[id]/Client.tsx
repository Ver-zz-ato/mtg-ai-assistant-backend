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

  return (
    <div className="space-y-3 relative">
      {/* Header with export & upload */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Collection</h3>
        <div className="flex items-center gap-2">
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
                <span className="text-sm">{it.name}</span>
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
    </div>
  );
}
