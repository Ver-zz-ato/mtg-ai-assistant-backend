"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

type CardRow = { name: string; qty: number };

export default function CollectionDetailPage({ params }: { params: { id: string } }) {
  const collectionId = decodeURIComponent(params.id);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr("");
        const res = await fetch(
          `/api/collections/cards?collectionId=${encodeURIComponent(collectionId)}`,
          { cache: "no-store" }
        );
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || res.statusText);

        // Adjust mapping if your API returns a different shape
        const rows: CardRow[] = (j.cards ?? j.data ?? []).map((r: any) => ({
          name: String(r.name ?? r.card_name ?? r.card ?? ""),
          qty: Number(r.qty ?? r.quantity ?? r.count ?? r.owned ?? 0),
        }));

        setCards(rows);
      } catch (e: any) {
        setErr(e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [collectionId]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Collection</h1>
        <Link href="/collections" className="text-sm underline underline-offset-4">
          ← Back to Collections
        </Link>
      </div>

      <div className="text-xs opacity-70 break-all">ID: {collectionId}</div>

      {err && <div className="text-red-500">{err}</div>}
      {loading && <div className="rounded-xl border p-4 text-sm opacity-75">Loading…</div>}

      {!loading && cards.length === 0 && !err && (
        <div className="rounded-xl border p-4 text-sm">No cards in this collection yet.</div>
      )}

      {cards.length > 0 && (
        <div className="rounded-xl border">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3">Card</th>
                <th className="text-right py-2 px-3">Qty</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((r, i) => (
                <tr key={`${r.name}-${i}`} className="border-b">
                  <td className="py-1 px-3">{r.name}</td>
                  <td className="py-1 px-3 text-right">{r.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
