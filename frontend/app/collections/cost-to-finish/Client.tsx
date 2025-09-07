"use client";

import * as React from "react";

type CostRow = { card: string; need: number; unit: number; subtotal: number };

type Props = {
  collections?: Array<{ id: string; name: string }>;
  initialDeckId?: string;
  initialCollectionId?: string;
  initialCurrency?: string;
};

export default function Client({
  collections = [],
  initialDeckId,
  initialCollectionId,
  initialCurrency = "USD",
}: Props) {
  const [deckText, setDeckText] = React.useState<string>("");
  const [currency, setCurrency] = React.useState<string>(initialCurrency ?? "USD");
  const [selectedCollectionId, setSelectedCollectionId] = React.useState<string | null>(
    initialCollectionId ?? (collections[0]?.id ?? null)
  );
  const [rows, setRows] = React.useState<CostRow[]>([]);
  const [total, setTotal] = React.useState<number>(0);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  async function computeCost() {
    setIsLoading(true);
    setError(null);
    setRows([]);
    setTotal(0);

    try {
      const payload: any = {
        currency,
      };

      if (deckText.trim()) {
        payload.deckText = deckText.trim();
      } else if (initialDeckId) {
        payload.deckId = initialDeckId;
      }

      if (selectedCollectionId) {
        payload.collectionId = selectedCollectionId;
        payload.useOwned = true; // when a collection is selected, subtract owned
      }

      const res = await fetch("/api/collections/cost-to-finish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setError(data?.error ?? `Request failed (${res.status})`);
        return;
      }

      setRows(Array.isArray(data.rows) ? data.rows : []);
      setTotal(typeof data.total === "number" ? data.total : 0);
    } catch (e: any) {
      setError(e?.message ?? "Failed to compute");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-xl font-semibold mb-4">Cost to Finish</h1>

      <div className="flex items-center gap-3 mb-3">
        {/* Currency */}
        <label className="text-sm">
          Currency
          <select
            className="ml-2 rounded border px-2 py-1 text-sm"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </label>

        {/* Collection */}
        <label className="text-sm">
          Collection
          <select
            className="ml-2 rounded border px-2 py-1 text-sm"
            value={selectedCollectionId ?? ""}
            onChange={(e) => setSelectedCollectionId(e.target.value || null)}
          >
            <option value="">(no collections)</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={computeCost}
          disabled={isLoading}
          className="rounded bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm px-3 py-1.5"
        >
          {isLoading ? "Computing..." : "Compute cost"}
        </button>
      </div>

      <textarea
        className="w-full h-56 rounded border p-2 font-mono text-sm mb-2"
        placeholder="Paste your decklist here (one card per line)…"
        value={deckText}
        onChange={(e) => setDeckText(e.target.value)}
      />

      <p className="text-xs text-gray-400 mb-3">
        Using owned quantities from <span className="font-medium">{selectedCollectionId ? "selected collection" : "no collection selected"}</span>.
        Need = deck − owned (never negative).
      </p>

      {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-y">
            <th className="text-left py-2">Card</th>
            <th className="text-right py-2">Need</th>
            <th className="text-right py-2">Unit</th>
            <th className="text-right py-2">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-6 text-center text-gray-500">
                {isLoading ? "Working…" : "No items"}
              </td>
            </tr>
          ) : (
            rows.map((r, idx) => (
              <tr key={`${r.card}-${idx}`} className="border-t">
                <td className="py-1">{r.card}</td>
                <td className="text-right">{r.need}</td>
                <td className="text-right">${r.unit.toFixed(2)}</td>
                <td className="text-right">${r.subtotal.toFixed(2)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="border-t">
            <td className="py-2 font-semibold">Total:</td>
            <td />
            <td />
            <td className="text-right font-semibold">${total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
