"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Item = { id: string; name: string; qty: number };

export default function CollectionPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [qty, setQty] = useState<number>(1);

  const collectionId = params.id;

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/collections/cards?collectionId=${collectionId}`, { cache: "no-store" });
    const json = await res.json();
    setItems(json.items ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [collectionId]);

  async function adjustQty(id: string, delta: number) {
    await fetch(`/api/collections/cards`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, delta }),
    });
    startTransition(load);
  }

  async function del(id: string) {
    await fetch(`/api/collections/cards`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    startTransition(load);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await fetch(`/api/collections/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collectionId, name: name.trim(), qty }),
    });
    setName("");
    setQty(1);
    startTransition(load);
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <div className="flex items-center gap-3 mb-4">
        <button className="text-sm underline" onClick={() => router.push("/collections")}>← Back to Collections</button>
      </div>

      <form onSubmit={add} className="flex gap-2 items-center mb-3">
        <input
          placeholder="Card name"
          className="flex-1 bg-transparent border px-3 py-2 rounded"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="number"
          min={1}
          className="w-16 bg-transparent border px-2 py-2 rounded text-center"
          value={qty}
          onChange={(e) => setQty(Math.max(1, parseInt(e.target.value || "1", 10)))}
        />
        <button className="border px-3 py-2 rounded">Add</button>
      </form>

      {loading ? (
        <div className="opacity-70">Loading…</div>
      ) : items.length === 0 ? (
        <div className="opacity-70">No cards yet — add one above or upload a CSV.</div>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => (
            <li key={c.id} className="flex items-center gap-2 border rounded px-2 py-1">
              <div className="flex-1 truncate">{c.name}</div>
              <button className="border px-2 rounded" onClick={() => adjustQty(c.id, -1)}>-</button>
              <div className="w-6 text-center">{c.qty}</div>
              <button className="border px-2 rounded" onClick={() => adjustQty(c.id, +1)}>+</button>
              <button className="border px-2 rounded text-red-500" onClick={() => del(c.id)}>delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
