// app/my-decks/[id]/page.tsx
import { Suspense } from "react";
import { notFound } from "next/navigation";

async function fetchDeck(deckId: string) {
  // If you already have an API for deck meta, call it here. Placeholder:
  return { id: deckId, name: "Deck" };
}

async function fetchCards(deckId: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/decks/cards?deckId=${deckId}`, {
    // Revalidate per request; you can tune caching later
    cache: "no-store",
  });
  if (!res.ok) return { ok: false, items: [] as any[] };
  return res.json();
}

export default async function DeckPage({ params }: { params: { id: string } }) {
  const deck = await fetchDeck(params.id);
  if (!deck) return notFound();

  const data = await fetchCards(params.id);
  const items = data?.items ?? [];

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-2xl font-semibold">Edit Deck: {deck.name}</h1>
      <Suspense fallback={<div>Loading cards…</div>}>
        <CardsEditor deckId={params.id} initialItems={items} />
      </Suspense>
    </div>
  );
}

"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

function Row({ card, onAdjust, onDelete }: {
  card: { id: string, name: string, qty: number },
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

function CardsEditor({ deckId, initialItems }: { deckId: string; initialItems: any[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [name, setName] = useState("");
  const [qty, setQty] = useState<number | "">("");

  async function adjustQty(id: string, delta: number) {
    const res = await fetch("/api/decks/cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, delta }),
    });
    if (!res.ok) {
      console.error("PATCH failed");
      return;
    }
    router.refresh();
  }

  async function deleteCard(id: string) {
    const res = await fetch("/api/decks/cards", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      console.error("DELETE failed");
      return;
    }
    router.refresh();
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
    if (!res.ok) {
      console.error("POST failed");
      return;
    }
    setName("");
    setQty("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
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
        {items.length === 0 ? (
          <div className="p-3 text-sm text-neutral-600">No cards yet.</div>
        ) : (
          items.map((c: any) => (
            <Row key={c.id} card={c} onAdjust={adjustQty} onDelete={deleteCard} />
          ))
        )}
      </div>
    </div>
  );
}
