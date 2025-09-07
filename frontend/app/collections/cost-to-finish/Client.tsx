// frontend/app/collections/cost-to-finish/Client.tsx
"use client";

import * as React from "react";

type Collection = { id: string; name: string };

type CostRow = {
  card: string;
  need: number;
  unit?: number;
  subtotal?: number;
};

type Props = {
  collections?: Collection[];
  initialDeckId?: string;
  initialCollectionId?: string | null;
  initialCurrency?: string;
  // Optional initial deck text provided by the page (if any)
  initialDeckText?: string;
};

export default function Client({
  collections = [],
  initialDeckId,
  initialCollectionId,
  initialCurrency = "USD",
  initialDeckText = "",
}: Props) {
  const [currency, setCurrency] = React.useState<string>(initialCurrency);
  const [rows, setRows] = React.useState<CostRow[]>([]);
  const [total, setTotal] = React.useState<number>(0);
  const [error, setError] = React.useState<string | null>(null);

  const [selectedCollectionId, setSelectedCollectionId] = React.useState<
    string | null
  >(initialCollectionId ?? (collections[0]?.id ?? null));

  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    if (initialDeckText && textareaRef.current && !textareaRef.current.value) {
      textareaRef.current.value = initialDeckText;
    }
  }, [initialDeckText]);

  const onCompute = async () => {
    setError(null);
    setRows([]);
    setTotal(0);

    const deckText = textareaRef.current?.value?.trim() ?? "";
    const collectionId = selectedCollectionId ?? null;

    if (!collectionId) {
      setError("Select a collection first.");
      return;
    }
    if (!deckText) {
      setError("Paste your deck list (one card per line) before computing cost.");
      return;
    }

    const res = await fetch("/api/collections/cost-to-finish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        // camelCase; API route will convert to snake_case
        collectionId,
        currency,
        deckText,
        useOwned: true,
        deckId: initialDeckId ?? null, // harmless if upstream ignores it
      }),
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      setError(msg || "Upstream call failed");
      return;
    }

    let data: any;
    try {
      data = await res.json();
    } catch {
      setError("Invalid JSON from proxy");
      return;
    }

    if (!data?.ok) {
      setError(data?.error || "Upstream call failed");
      return;
    }

    setRows(data.rows ?? []);
    setTotal(data.total ?? 0);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <label className="text-sm">Currency</label>
        <select
          className="rounded border px-2 py-1 text-sm"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        >
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
        </select>

        <label className="text-sm">Collection</label>
        <select
          className="rounded border px-2 py-1 text-sm min-w-[220px]"
          value={selectedCollectionId ?? ""}
          onChange={(e) =>
            setSelectedCollectionId(e.target.value || null)
          }
        >
          {collections.length === 0 ? (
            <option value="">(no collections)</option>
          ) : (
            collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))
          )}
        </select>

        <button
          className="rounded bg-orange-500 px-3 py-1.5 text-sm text-white hover:bg-orange-600"
          onClick={onCompute}
        >
          Compute cost
        </button>
      </div>

      <textarea
        ref={textareaRef}
        className="w-full h-72 rounded border p-2 font-mono text-sm"
        defaultValue={initialDeckText}
        placeholder={`Paste your deck list here, one card per line. Example:

1 Sol Ring
1 Arcane Signet
...
`}
      />

      <p className="text-xs text-gray-400">
        Using owned quantities from <span className="italic">selected collection</span>. Need = deck − owned (never negative).
      </p>

      {error && (
        <div className="text-red-500 text-sm">{error}</div>
      )}

      <div className="mt-2 border rounded">
        <table className="w-full text-sm">
          <thead className="bg-black/10">
            <tr>
              <th className="text-left p-2">Card</th>
              <th className="text-left p-2">Need</th>
              <th className="text-left p-2">Unit</th>
              <th className="text-left p-2">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-3 text-gray-400">
                  —
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.card}-${i}`} className="border-t">
                  <td className="p-2">{r.card}</td>
                  <td className="p-2">{r.need}</td>
                  <td className="p-2">
                    {r.unit != null ? `$${r.unit.toFixed(2)}` : "—"}
                  </td>
                  <td className="p-2">
                    {r.subtotal != null ? `$${r.subtotal.toFixed(2)}` : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t font-semibold">
              <td className="p-2">Total:</td>
              <td />
              <td />
              <td className="p-2">${total.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
