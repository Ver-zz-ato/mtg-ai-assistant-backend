"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type CardRow = { id: string; name: string; qty: number };

export default function CollectionPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [items, setItems] = useState<CardRow[]>([]);
  const [name, setName] = useState("");
  const [qty, setQty] = useState<number>(1);

  const collectionId = params.id;

  async function load() {
    const res = await fetch(`/api/collections/cards?collectionId=${collectionId}`, {
      cache: "no-store",
    });
    const json = await res.json();
    if (json?.ok) setItems(json.items ?? []);
    else console.error(json?.error || "Failed loading items");
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId]);

  function refresh() {
    startTransition(() => {
      router.refresh();
      load();
    });
  }

  async function add() {
    const body = { collectionId, name: name.trim(), qty: Number(qty) || 1 };
    await fetch(`/api/collections/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setName("");
    setQty(1);
    refresh();
  }

  async function patch(id: string, delta: number) {
    await fetch(`/api/collections/cards`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, delta }),
    });
    refresh();
  }

  async function remove(id: string) {
    await fetch(`/api/collections/cards`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    refresh();
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-semibold">Collection</h1>

      <div className="flex gap-2 items-center">
        <input
          className="w-full rounded-md bg-zinc-900 px-3 py-2"
          placeholder="Card name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="w-20 rounded-md bg-zinc-900 px-3 py-2 text-right"
          placeholder="Qty"
          inputMode="numeric"
          value={qty}
          onChange={(e) => setQty(Number(e.target.value) || 1)}
        />
        <button
          onClick={add}
          disabled={!name.trim() || isPending}
          className="rounded-md bg-emerald-700 px-3 py-2 disabled:opacity-50"
        >
          Add
        </button>
      </div>

      <div className="divide-y divide-zinc-800">
        {items.length === 0 ? (
          <p className="text-sm text-zinc-400">No cards yet — add one above or upload a CSV.</p>
        ) : (
          items.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 py-2"
            >
              <div className="flex-1 truncate">{c.name}</div>
              <button
                onClick={() => patch(c.id, -1)}
                className="rounded-md bg-zinc-800 px-2"
                aria-label="decrement"
              >
                -
              </button>
              <div className="w-8 text-center tabular-nums">{c.qty}</div>
              <button
                onClick={() => patch(c.id, +1)}
                className="rounded-md bg-zinc-800 px-2"
                aria-label="increment"
              >
                +
              </button>
              <button
                onClick={() => remove(c.id)}
                className="rounded-md bg-red-700 px-2"
                aria-label="delete"
              >
                delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
