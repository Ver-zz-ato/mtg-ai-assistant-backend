// frontend/app/collections/cost-to-finish/Client.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Collection = { id: string; name: string };

interface Props {
  initialDeckId?: string;
  initialCollectionId?: string;
  // If you already had initialDeckText prop, keep it too.
}

export default function Client({
  initialDeckId,
  initialCollectionId,
}: Props) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [currency, setCurrency] = useState<"USD" | "GBP" | "EUR">("USD");
  const [deckText, setDeckText] = useState<string>("");
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [error, setError] = useState<string>("");

  // Load collections (whatever you had before)
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/collections/list");
      const json = await res.json();
      if (json?.ok) setCollections(json.collections as Collection[]);
    })();
  }, []);

  // If we came in with ?collection=, auto-select it once collections are loaded
  useEffect(() => {
    if (!collections.length || !initialCollectionId) return;
    const hit = collections.find(c => c.id === initialCollectionId);
    if (hit) setSelectedCollection(hit);
  }, [collections, initialCollectionId]);

  // (Optional) If you support ?deck= and want to prefill the text box from the deck id,
  // you could fetch it here. Otherwise the user pastes/edits the text manually.
  useEffect(() => {
    (async () => {
      if (!initialDeckId) return;
      try {
        const res = await fetch(`/api/decks/${initialDeckId}`);
        const json = await res.json();
        if (json?.ok && json?.deck?.deck_text) setDeckText(json.deck.deck_text);
      } catch {}
    })();
  }, [initialDeckId]);

  const selectedCollectionId: string | undefined =
    selectedCollection?.id ?? initialCollectionId ?? undefined;

  async function computeCost() {
    setError("");

    if (!selectedCollectionId) {
      setError("collectionId required");
      return;
    }
    if (!deckText?.trim()) {
      setError("Paste a deck list first.");
      return;
    }

    const payload = {
      deckText,
      currency,
      collectionId: selectedCollectionId,  // <-- IMPORTANT
      deckId: initialDeckId ?? undefined,  // optional
    };

    const res = await fetch("/api/collections/cost-to-finish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();

    if (!res.ok || json?.ok === false) {
      setError(json?.error || `HTTP ${res.status}`);
      setRows([]);
      setTotal(0);
      return;
    }

    // expect: { ok:true, items:[...], total: number }
    setRows(json.items || []);
    setTotal(json.total || 0);
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3">
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as any)}
          className="border rounded px-2 py-1 bg-black/20"
        >
          <option value="USD">USD</option>
          <option value="GBP">GBP</option>
          <option value="EUR">EUR</option>
        </select>

        <select
          value={selectedCollection?.id ?? ""}
          onChange={(e) => {
            const c = collections.find(x => x.id === e.target.value) || null;
            setSelectedCollection(c);
          }}
          className="border rounded px-2 py-1 bg-black/20"
        >
          <option value="" disabled>Select collection…</option>
          {collections.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <button
          className="px-3 py-1 rounded bg-orange-500"
          onClick={computeCost}
        >
          Compute cost
        </button>
      </div>

      {/* Hint line */}
      {selectedCollectionId ? (
        <div className="text-xs opacity-70">
          Using owned quantities from <b>
            {selectedCollection?.name ??
              collections.find(c => c.id === selectedCollectionId)?.name ??
              selectedCollectionId}
          </b>. Need = deck − owned (never negative).
        </div>
      ) : (
        <div className="text-xs text-red-500">Pick a collection.</div>
      )}

      {/* Deck text area */}
      <textarea
        value={deckText}
        onChange={(e) => setDeckText(e.target.value)}
        rows={14}
        className="w-full border rounded p-2 bg-black/20"
      />

      {error && <div className="text-red-500 text-sm">{error}</div>}

      {/* Results table (keep your existing rendering) */}
      {/* ... render rows + total ... */}
    </div>
  );
}
