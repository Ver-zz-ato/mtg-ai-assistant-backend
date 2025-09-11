// app/my-decks/[id]/Client.tsx
"use client";

import { useEffect, useState, useTransition } from "react";

type Card = { id: string; name: string; qty: number };

export default function Client({ deckId }: { deckId: string }) {
  const [items, setItems] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [qty, setQty] = useState<number | "">("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({ ok: false, items: [] }));
      if (data?.ok && Array.isArray(data.items)) setItems(data.items);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [deckId]);

  async function adjustQty(id: string, delta: number) {
    const res = await fetch("/api/decks/cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, delta }),
    });
    if (res.ok) await load();
  }

  async function deleteCard(id: string) {
    const res = await fetch("/api/decks/cards", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) await load();
  }

  async function addCard(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const n = typeof qty === "number" && Number.isFinite(qty) ? qty : 1;

    const res = await fetch("/api/decks/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deckId, name: trimmed, qty: n }),
    });
    if (res.ok) {
      setName(""); setQty("");
      await load();
    }
  }

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-2xl font-semibold">Edit Deck</h1>

      <form onSubmit={addCard} className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-sm mb-1">Card name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border rounded px-2 py-1"
            placeholder="Lightning Bolt"
          />
        </div>
        <div className="w-24">
          <label className="block text-sm mb-1">Qty</label>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(e.target.value === "" ? "" : parseInt(e.target.value, 10))}
            className="w-full border rounded px-2 py-1"
            placeholder="1"
          />
        </div>
        <button className="px-3 py-2 border rounded">Add</button>
      </form>

      <div className="border rounded">
        {loading ? (
          <div className="p-3 text-sm text-neutral-600">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-3 text-sm text-neutral-600">No cards yet.</div>
        ) : (
          items.map((c) => (
            <Row key={c.id} card={c} onAdjust={adjustQty} onDelete={deleteCard} />
          ))
        )}
      </div>
    </div>
  );
}

function Row({ card, onAdjust, onDelete }: {
  card: Card,
  onAdjust: (id: string, delta: number) => Promise<void>,
  onDelete: (id: string) => Promise<void>,
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-3 border-b py-2">
      <div className="flex-1">{card.name}</div>
      <div className="flex items-center gap-2">
        <button
          className="px-2 py-1 border rounded"
          onClick={() => startTransition(() => onAdjust(card.id, -1))}
          disabled={pending}
        >
          -
        </button>
        <span className="w-8 text-center">{card.qty}</span>
        <button
          className="px-2 py-1 border rounded"
          onClick={() => startTransition(() => onAdjust(card.id, +1))}
          disabled={pending}
        >
          +
        </button>
      </div>
      <button
        className="px-2 py-1 border rounded text-red-600"
        onClick={() => startTransition(() => onDelete(card.id))}
        disabled={pending}
      >
        delete
      </button>
    </div>
  );
}
