"use client";

import { useEffect, useMemo, useState } from "react";

type Collection = { id: string; name: string; created_at: string | null };
type Missing = { name: string; need: number };
type PriceRow = { name: string; price: number };

export default function CostToFinishPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [currency, setCurrency] = useState<"USD" | "EUR" | "GBP">("USD");
  const [deckText, setDeckText] = useState("");
  const [missing, setMissing] = useState<Missing[] | null>(null);
  const [pricing, setPricing] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/collections/list", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setCollections(data.collections ?? []);
        if (data.collections?.[0]?.id) setSelectedId(data.collections[0].id);
      } else {
        alert("Failed to load collections: " + (data.error || res.status));
      }
    })();
  }, []);

  async function compute() {
    if (!selectedId) return alert("Pick a collection");
    if (!deckText.trim()) return alert("Paste a decklist");
    setBusy(true);
    setMissing(null);
    setPricing({});

    try {
      // 1) what am I missing?
      const res = await fetch("/api/collections/cost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection_id: selectedId, deck_text: deckText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      const m: Missing[] = data.missing || [];
      setMissing(m);

      if (!m.length) {
        setPricing({});
        return;
      }

      // 2) price the missing names
      const names = m.map((x) => x.name);
      const priceRes = await fetch("/api/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names, currency }),
      });
      const priceData = await priceRes.json();
      if (!priceRes.ok) throw new Error(priceData.error || priceRes.statusText);

      // Expecting priceData.rows: [{ name, price }]
      const map: Record<string, number> = {};
      const rows: PriceRow[] = priceData.rows || priceData.prices || [];
      for (const r of rows) {
        if (!r?.name) continue;
        const p = typeof r.price === "number" ? r.price : Number(r.price ?? 0);
        map[r.name] = isFinite(p) ? p : 0;
      }
      setPricing(map);
    } catch (e: any) {
      alert("Compute failed: " + (e.message || e));
    } finally {
      setBusy(false);
    }
  }

  const total = useMemo(() => {
    if (!missing?.length) return 0;
    return missing.reduce((sum, row) => {
      const unit = pricing[row.name] ?? 0;
      return sum + unit * row.need;
    }, 0);
  }, [missing, pricing]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold">Cost to finish</h1>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Left: inputs */}
        <div className="rounded-xl border p-4 space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Your collection</label>
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Currency</label>
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as any)}
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Decklist</label>
            <textarea
              placeholder="Paste decklist here (e.g., '3 Sol Ring')"
              className="w-full h-56 rounded-lg border px-3 py-2 text-sm font-mono"
              value={deckText}
              onChange={(e) => setDeckText(e.target.value)}
            />
          </div>

          <button
            className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5 disabled:opacity-50"
            onClick={compute}
            disabled={busy}
          >
            {busy ? "Computing…" : "Compute cost"}
          </button>
        </div>

        {/* Right: results */}
        <div className="rounded-xl border p-4 space-y-3">
          <div className="text-sm font-medium mb-2">Results</div>
          {!missing ? (
            <div className="text-sm opacity-70">Paste a deck and compute.</div>
          ) : missing.length === 0 ? (
            <div className="text-sm">You already own everything 🎉</div>
          ) : (
            <>
              <div className="text-sm">
                Missing <b>{missing.length}</b> unique cards. Estimated total:{" "}
                <b>
                  {currency}{" "}
                  {total.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </b>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="text-left py-2 pr-2">Card</th>
                      <th className="text-right py-2 pr-2">Need</th>
                      <th className="text-right py-2 pr-2">Unit</th>
                      <th className="text-right py-2">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missing.map((m) => {
                      const unit = pricing[m.name] ?? 0;
                      const sub = unit * m.need;
                      return (
                        <tr key={m.name} className="border-b last:border-0">
                          <td className="py-2 pr-2">{m.name}</td>
                          <td className="py-2 pr-2 text-right">{m.need}</td>
                          <td className="py-2 pr-2 text-right">
                            {currency}{" "}
                            {unit.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td className="py-2 text-right">
                            {currency}{" "}
                            {sub.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
