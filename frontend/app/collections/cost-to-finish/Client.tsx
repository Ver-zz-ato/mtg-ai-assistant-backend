"use client";

import * as React from "react";

type Collection = { id: string; name: string };

type CostRow = {
  name: string;
  need: number;
  unit: number;      // price per card in selected currency
  subtotal: number;  // need * unit
};

type ApiOk = { ok: true; items: CostRow[]; total: number };
type ApiErr = { ok: false; error: string };

type Props = {
  /** Optional deck ID we navigated in with (?deck=xyz) so the API can look up context */
  initialDeckId?: string | null;
  /** Text pasted (or prefilled) into the textarea */
  initialDeckText?: string;
  /** "USD" | "EUR" etc. */
  initialCurrency?: string;
  /** Collections user can pick from */
  collections: Collection[];
  /** Preferred / preselected collection id */
  initialCollectionId?: string | null;
};

export default function CostToFinishClient({
  initialDeckId = null,
  initialDeckText = "",
  initialCurrency = "USD",
  collections,
  initialCollectionId = null,
}: Props) {
  const [deckText, setDeckText] = React.useState<string>(initialDeckText ?? "");
  const [currency, setCurrency] = React.useState<string>(initialCurrency ?? "USD");
  const [selectedCollectionId, setSelectedCollectionId] = React.useState<string | null>(
    initialCollectionId ?? (collections[0]?.id ?? null)
  );
  const [rows, setRows] = React.useState<CostRow[]>([]);
  const [total, setTotal] = React.useState<number>(0);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string>("");

  async function computeCost() {
    setError("");
    setRows([]);
    setTotal(0);

    if (!selectedCollectionId) {
      setError("collectionId required");
      return;
    }
    if (!deckText?.trim()) {
      setError("Paste a deck list first.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        deckText,
        currency,
        collectionId: selectedCollectionId,
        deckId: initialDeckId ?? undefined,
      };

      // IMPORTANT: make the URL absolute and target the API route, not the page.
      const apiUrl = new URL(
        "/api/collections/cost-to-finish",
        window.location.origin
      ).toString();

      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let json: ApiOk | ApiErr;
      try {
        json = (await res.json()) as ApiOk | ApiErr;
      } catch {
        json = { ok: false, error: `Unexpected response (HTTP ${res.status})` };
      }

      if (!res.ok || json.ok === false) {
        setError((json as ApiErr)?.error || `HTTP ${res.status}`);
        return;
      }

      const ok = json as ApiOk;
      setRows(ok.items ?? []);
      setTotal(ok.total ?? 0);
    } catch (e: any) {
      setError(e?.message || "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 pb-12">
      <div className="flex items-center justify-between gap-3 py-3">
        <h1 className="text-xl font-semibold">Cost to Finish</h1>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">Currency</label>
          <select
            className="rounded border bg-transparent px-2 py-1 text-sm"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>

          <label className="text-sm text-gray-400 ml-3">Collection</label>
          <select
            className="rounded border bg-transparent px-2 py-1 text-sm"
            value={selectedCollectionId ?? ""}
            onChange={(e) => setSelectedCollectionId(e.target.value || null)}
          >
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <button
            className="rounded bg-orange-500 hover:bg-orange-600 text-white text-sm px-3 py-1.5 disabled:opacity-50"
            onClick={computeCost}
            disabled={loading}
          >
            {loading ? "Computing…" : "Compute cost"}
          </button>
        </div>
      </div>

      <textarea
        className="w-full h-56 rounded border bg-transparent p-3 text-sm font-mono"
        placeholder='Paste a decklist, e.g.:
1 Sol Ring
1 Arcane Signet
...'
        value={deckText}
        onChange={(e) => setDeckText(e.target.value)}
      />

      <p className="mt-2 text-xs text-gray-400">
        Using owned quantities from{" "}
        <span className="font-medium">
          {collections.find((c) => c.id === selectedCollectionId)?.name ??
            "(select a collection)"}
        </span>
        . Need = deck − owned (never negative).
      </p>

      {error && (
        <p className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-gray-800">
              <th className="py-2 pr-3">Card</th>
              <th className="py-2 pr-3">Need</th>
              <th className="py-2 pr-3">Unit</th>
              <th className="py-2 pr-3">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="py-3 text-gray-500" colSpan={4}>
                  {loading ? "Calculating…" : "No missing cards."}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.name} className="border-b border-gray-900/30">
                  <td className="py-2 pr-3">{r.name}</td>
                  <td className="py-2 pr-3">{r.need}</td>
                  <td className="py-2 pr-3">
                    {r.unit.toLocaleString(undefined, {
                      style: "currency",
                      currency,
                    })}
                  </td>
                  <td className="py-2 pr-3">
                    {r.subtotal.toLocaleString(undefined, {
                      style: "currency",
                      currency,
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td className="py-3 font-semibold" colSpan={3}>
                Total:
              </td>
              <td className="py-3 font-semibold">
                {total.toLocaleString(undefined, {
                  style: "currency",
                  currency,
                })}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
