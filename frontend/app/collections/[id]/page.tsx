"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type ApiRow = { card_name: string; qty: number };

export default function CollectionDetailPage() {
  const params = useParams<{ id: string }>();
  const collectionId = decodeURIComponent(String(params.id ?? ""));

  const [rows, setRows] = React.useState<ApiRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr("");
        const r = await fetch(`/api/collections/cards?collectionId=${encodeURIComponent(collectionId)}`, {
          cache: "no-store",
        });
        const j = await r.json();
        if (!r.ok || !j?.ok) throw new Error(j?.error || r.statusText);
        if (!alive) return;
        setRows(Array.isArray(j.cards) ? j.cards : []);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [collectionId]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Collection</h1>
        <Link href="/collections" className="text-sm underline underline-offset-4">← Back to Collections</Link>
      </div>

      <div className="text-xs opacity-70 break-all">ID: {collectionId}</div>

      {err && <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm">{err}</div>}
      {loading && <div className="rounded-xl border p-4 text-sm opacity-75">Loading…</div>}

      {!loading && !err && rows.length === 0 && (
        <div className="rounded-xl border p-4 text-sm">No cards in this collection yet.</div>
      )}

      {rows.length > 0 && (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-black/30">
              <tr className="border-b">
                <th className="text-left py-2 px-3">Card</th>
                <th className="text-right py-2 px-3">Qty</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.card_name}-${i}`} className="border-b">
                  <td className="py-1 px-3">{r.card_name}</td>
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
