"use client";

import * as React from "react";

/** Minimal shape for the Collection dropdown */
export type CollectionSummary = {
  id: string;
  name: string;
};

/** Row returned by the cost-to-finish API */
type CostRow = {
  card: string;
  need: number;
  unit: string;     // e.g., "x"
  subtotal: number; // numeric cost for the row
};

/** Props from the server/page */
type Props = {
  /** Collections available to the user (optional; defaults to []) */
  collections?: CollectionSummary[];
  /** If present, we’ll fetch the deck text by id and seed the textarea */
  initialDeckId?: string;
  /** Preselect a collection for the user */
  initialCollectionId?: string;
  /** Preselect currency (USD by default) */
  initialCurrency?: string;
};

export default function Client({
  collections = [], // ⟵ default avoids "possibly undefined"
  initialDeckId,
  initialCollectionId,
  initialCurrency,
}: Props) {
  const [deckText, setDeckText] = React.useState<string>("");
  const [currency, setCurrency] = React.useState<string>(initialCurrency ?? "USD");
  const [selectedCollectionId, setSelectedCollectionId] = React.useState<string | null>(
    initialCollectionId ?? (collections[0]?.id ?? null)
  );

  const [rows, setRows] = React.useState<CostRow[]>([]);
  const [total, setTotal] = React.useState<number>(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // If we got a deck id, fetch its text once to seed the textarea
  React.useEffect(() => {
    if (!initialDeckId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/decks/${initialDeckId}`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        const text =
          json?.deck?.deck_text ??
          json?.data?.deck_text ??
          json?.deck_text ??
          "";
        if (!cancelled && text) setDeckText(String(text));
      } catch {
        // non-fatal; user can paste the deck text manually
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialDeckId]);

  async function computeCost() {
    setError(null);
    setRows([]);
    setTotal(0);

    if (!selectedCollectionId) {
      setError("collectionId required");
      return;
    }
    if (!deckText.trim() && !initialDeckId) {
      setError("Please paste a decklist or open from a deck.");
      return;
    }

    setLoading(true);
    try {
      const body: any = {
        collectionId: selectedCollectionId,
        currency,
        useOwned: true, // IMPORTANT: use owned quantities (deck - owned, never negative)
      };
      if (initialDeckId) body.deckId = initialDeckId;
      else body.deckText = deckText;

      const res = await fetch("/api/collections/cost-to-finish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Request failed (${res.status})`);
      }

      const apiRows: CostRow[] = Array.isArray(json?.rows) ? json.rows : [];
      setRows(apiRows);
      setTotal(Number(json?.total ?? 0));
    } catch (e: any) {
      setError(e?.message || "Failed to compute cost.");
    } finally {
      setLoading(false);
    }
  }

  const selectedCollectionName =
    collections.find((c) => c.id === selectedCollectionId)?.name ?? "selected collection";

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-4">Cost to Finish</h1>

      <div className="flex items-center gap-3 mb-3">
        <label className="text-sm">Currency</label>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
        </select>

        <label className="text-sm ml-4">Collection</label>
        <select
          className="rounded border px-2 py-1 text-sm min-w-[10rem]"
          value={selectedCollectionId ?? ""}
          onChange={(e) => setSelectedCollectionId(e.target.value || null)}
        >
          {collections.length === 0 && <option value="">(no collections)</option>}
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <button
          onClick={computeCost}
          disabled={loading}
          className="ml-2 rounded bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60"
        >
          {loading ? "Computing..." : "Compute cost"}
        </button>
      </div>

      <textarea
        className="w-full h-64 rounded border bg-black/10 p-2 font-mono text-sm"
        placeholder="Paste a deck list here (e.g. '1 Sol Ring\n1 Arcane Signet\n...')"
        value={deckText}
        onChange={(e) => setDeckText(e.target.value)}
      />

      <div className="text-xs text-gray-400 mt-2">
        Using owned quantities from <span className="text-gray-200">{selectedCollectionName}</span>.
        {" "}Need = deck − owned (never negative).
      </div>

      {error && <div className="mt-2 text-red-500 text-sm">{error}</div>}

      <div className="mt-6">
        <table className="w-full text-sm">
          <thead className="text-left border-b border-gray-700">
            <tr>
              <th className="py-1">Card</th>
              <th className="py-1">Need</th>
              <th className="py-1">Unit</th>
              <th className="py-1 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-3 text-center text-gray-400">
                  {/* empty state */}
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.card}-${i}`} className="border-b border-gray-800">
                  <td className="py-1 pr-2">{r.card}</td>
                  <td className="py-1 pr-2">{r.need}</td>
                  <td className="py-1 pr-2">{r.unit}</td>
                  <td className="py-1 text-right">${r.subtotal.toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-3 font-medium" colSpan={3}>
                Total:
              </td>
              <td className="pt-3 text-right font-semibold">
                ${Number(total || 0).toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
