// app/decks/[id]/Client.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Card = { id: string; name: string; qty: number; created_at: string };
type ApiResp = { ok: boolean; deck?: any; cards?: Card[]; error?: string; warning?: string };

export default function Client({ deckId: deckIdProp }: { deckId?: string }) {
  const params = useParams();
  const deckId = useMemo(() => deckIdProp ?? (typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params?.id[0] : undefined), [deckIdProp, params]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);

  useEffect(() => {
    if (!deckId) return;
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const res = await fetch(`/api/decks/${deckId}`, { cache: "no-store" });
        const json: ApiResp = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || `HTTP ${res.status}`);
        }
        if (alive) setCards(json.cards || []);
      } catch (e: any) {
        if (alive) setError(e?.message || "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [deckId]);

  if (!deckId) return <div className="text-sm text-red-500">No deck id.</div>;
  if (loading) return <div className="text-sm opacity-70">Loading cards…</div>;
  if (error) return <div className="text-sm text-red-500">Error: {error}</div>;
  if (!cards?.length) return <div className="text-sm text-muted-foreground">No cards to display.</div>;

  return (
    <div className="mt-3">
      <ul className="space-y-1">
        {cards.map((c) => (
          <li key={c.id} className="flex items-center justify-between rounded border px-3 py-2">
            <span className="text-sm">{c.name}</span>
            <span className="text-xs opacity-75">x{c.qty}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
