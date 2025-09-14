// app/my-decks/[id]/CardsPane.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import EditorAddBar from "@/components/EditorAddBar";

type CardRow = { id: string; deck_id: string; name: string; qty: number; created_at: string };

export default function CardsPane({ deckId }: { deckId?: string }) {
  const [cards, setCards] = useState<CardRow[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  async function load() {
    if (!deckId) return;
    const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, { cache: "no-store" });
    let json: any = {};
    try { json = await res.json(); } catch { json = { ok: false, error: "Bad JSON" }; }
    if (!json?.ok) {
      setStatus(json?.error || `Error ${res.status}`);
      return;
    }
    setCards(json.cards || []);
    setStatus(null);
  }

  useEffect(() => { load(); }, [deckId]);

  const grouped = useMemo(() => {
    const by = new Map<string, number>();
    for (const c of cards) by.set(c.name, (by.get(c.name) || 0) + (c.qty ?? 1));
    return Array.from(by.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [cards]);

  return (
    <div className="mt-2">
      <div className="max-w-xl">
        // @ts-ignore -- legacy props supported at runtime; typing mismatch only
{deckId && <EditorAddBar deckId={deckId} onAdded={load} />}
      </div>

      {status && <p className="text-red-400 text-sm mt-2">{status}</p>}

      <div className="mt-3 flex flex-col gap-2">
        {grouped.map(([name, qty]) => (
          <div key={name} className="flex items-center justify-between rounded border border-neutral-700 px-2 py-1">
            <span className="truncate">{name}</span>
            <span className="opacity-70">x{qty}</span>
          </div>
        ))}
        {grouped.length === 0 && !status && <p className="text-sm opacity-70">No cards yet.</p>}
      </div>
    </div>
  );
}