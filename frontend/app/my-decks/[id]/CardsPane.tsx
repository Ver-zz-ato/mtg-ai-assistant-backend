// app/my-decks/[id]/CardsPane.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Card = { id: string; name: string; qty: number; created_at: string };
type ApiResp = { ok: boolean; cards?: Card[]; error?: string };

export default function CardsPane({ deckId: deckIdProp }: { deckId?: string }) {
  const params = useParams();
  const deckId = useMemo(() => deckIdProp ?? (typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params?.id[0] : undefined), [deckIdProp, params]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);

  async function load() {
    if (!deckId) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/decks/cards?deckId=${deckId}`, { cache: "no-store" });
      const json: ApiResp = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setCards(json.cards || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [deckId]);

  async function bump(name: string, delta: number) {
    if (!deckId) return;
    const res = await fetch(`/api/decks/cards`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deckId, name, delta }),
    });
    const json = await res.json();
    if (!res.ok || !json?.ok) {
      alert(json?.error || "Update failed");
      return;
    }
    await load();
  }

  async function remove(name: string) {
    if (!deckId) return;
    const res = await fetch(`/api/decks/cards`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deckId, name }),
    });
    const json = await res.json();
    if (!res.ok || !json?.ok) {
      alert(json?.error || "Delete failed");
      return;
    }
    await load();
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">Cards</h3>
        <button className="text-xs underline" onClick={load}>Refresh</button>
      </div>
      {loading && <div className="text-xs opacity-70">Loading…</div>}
      {error && <div className="text-xs text-red-500">Error: {error}</div>}
      {!loading && !error && (
        cards.length ? (
          <ul className="space-y-1">
            {cards.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded border px-3 py-2">
                <span className="text-sm">{c.name}</span>
                <div className="flex items-center gap-2">
                  <button className="text-xs border rounded px-2 py-1" onClick={() => bump(c.name, -1)}>-</button>
                  <span className="text-xs opacity-75">x{c.qty}</span>
                  <button className="text-xs border rounded px-2 py-1" onClick={() => bump(c.name, +1)}>+</button>
                  <button className="text-xs text-red-500 underline" onClick={() => remove(c.name)}>delete</button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-xs text-muted-foreground">No cards yet.</div>
        )
      )}
    </div>
  );
}
