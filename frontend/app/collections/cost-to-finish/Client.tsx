"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

type Collection = { id: string; name: string };
type CostRow = { card: string; need: number; unit: string; subtotal: number };

type Props = {
  collections?: Collection[];               // may be undefined until loaded
  initialDeckId?: string;
  initialCollectionId?: string;
  initialCurrency?: string;
};

export default function Client({
  collections,
  initialDeckId,
  initialCollectionId,
  initialCurrency = "USD",
}: Props) {
  const search = useSearchParams();

  // Always respect the deep-link `collection` param if present
  const deepLinkCollection = search.get("collection") || undefined;

  const [currency, setCurrency] = React.useState<string>(initialCurrency || "USD");
  const [selectedCollectionId, setSelectedCollectionId] = React.useState<string | null>(
    deepLinkCollection ?? initialCollectionId ?? (collections && collections.length > 0 ? collections[0].id : null),
  );
  const [deckText, setDeckText] = React.useState<string>("");
  const [rows, setRows] = React.useState<CostRow[]>([]);
  const [total, setTotal] = React.useState<number>(0);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<boolean>(false);

  const backendRoute = "/api/collections/cost-to-finish";

  async function onCompute() {
    setError(null);
    setBusy(true);
    setRows([]);
    setTotal(0);

    try {
      const res = await fetch(backendRoute, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          // send both camelCase so our route will accept it and forward snake_case
          collectionId: selectedCollectionId,
          currency,
          deckText,
          useOwned: true,
          deckId: initialDeckId ?? null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.ok === false) {
        const msg = data?.error || `HTTP ${res.status}`;
        setError(msg);
        return;
      }

      // shape expected from backend: { items: CostRow[], total: number }
      setRows(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e: any) {
      setError(e?.message || "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const collectionsList = collections ?? []; // tolerate undefined

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="text-sm">Currency</label>
        <select
          className="border rounded px-2 py-1 text-sm"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        >
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
        </select>

        <label className="text-sm ml-4">Collection</label>
        <select
          className="border rounded px-2 py-1 text-sm min-w-[220px]"
          value={selectedCollectionId ?? ""}
          onChange={(e) => setSelectedCollectionId(e.target.value || null)}
        >
          {collectionsList.length === 0 ? (
            <option value="">
              (no collections)
            </option>
          ) : (
            <>
              <option value="">(no collections)</option>
              {collectionsList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </>
          )}
        </select>

        <button
          className="ml-2 rounded bg-orange-500 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          onClick={onCompute}
          disabled={busy}
        >
          {busy ? "Computing..." : "Compute cost"}
        </button>
      </div>

      <textarea
        className="w-full h-64 border rounded p-2 font-mono text-sm"
        placeholder="Paste your decklist here (one card per line)…"
        value={deckText}
        onChange={(e) => setDeckText(e.target.value)}
      />

      <p className="text-xs text-gray-400">
        Using owned quantities from <b>selected collection</b>. Need = deck – owned (never negative).
      </p>

      {error && (
        <div className="text-red-500 text-sm">{error}</div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="py-1">Card</th>
            <th className="py-1">Need</th>
            <th className="py-1">Unit</th>
            <th className="py-1">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-2 text-gray-400">No items</td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i}>
                <td className="py-1">{r.card}</td>
                <td className="py-1">{r.need}</td>
                <td className="py-1">{r.unit}</td>
                <td className="py-1">${r.subtotal.toFixed(2)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="py-2 font-semibold text-right">Total:</td>
            <td className="py-2 font-semibold">${total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
