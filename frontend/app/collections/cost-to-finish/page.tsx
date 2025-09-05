"use client";

import React from "react";
import { normalizeName } from "@/lib/mtg/normalize";
import { Currency, currencyPrefix } from "@/lib/currency";

type Row = { name: string; need: number; unit: number; subtotal: number };

export default function CostToFinishPage() {
  const [currency, setCurrency] = React.useState<Currency>("USD");
  const [deckText, setDeckText] = React.useState<string>(
    "1 Treasure Cruise\n1 Dig Through Time\n10 Island\n8 Mountain"
  );
  const [rows, setRows] = React.useState<Row[]>([]);
  const [total, setTotal] = React.useState<number>(0);
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState("");

  // NEW: pick up deck text from ?deck=...
  React.useEffect(() => {
    const url = new URL(window.location.href);
    const q = url.searchParams.get("deck");
    if (q) setDeckText(q);
  }, []);

  async function compute() {
    setLoading(true);
    setErrorMsg("");
    try {
      const lines = deckText.split("\n").map((l) => l.trim()).filter(Boolean);
      const entries = lines.map((line) => {
        const m = line.match(/^(\d+)\s+(.+)$/);
        return { qty: m ? Number(m[1]) : 1, name: m ? m[2] : line };
      });

      const res = await fetch("/api/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: entries.map((e) => e.name), currency }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Price lookup failed");

      const prices: Record<string, number> = j.prices;
      const newRows = entries.map((e) => {
        const unit = prices[normalizeName(e.name)] ?? 0;
        const subtotal = +(unit * e.qty).toFixed(2);
        return { name: e.name, need: e.qty, unit, subtotal };
      });
      setRows(newRows);
      setTotal(+newRows.reduce((a, r) => a + r.subtotal, 0).toFixed(2));
    } catch (e: any) {
      setErrorMsg(e.message);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold">Cost to Finish</h1>

      <div className="flex gap-4">
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency)}
          className="border p-2 rounded"
        >
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
        </select>

        <button
          onClick={compute}
          disabled={loading}
          className="bg-orange-600 text-white px-4 py-2 rounded disabled:opacity-60"
        >
          {loading ? "Computing..." : "Compute cost"}
        </button>
      </div>

      <textarea
        value={deckText}
        onChange={(e) => setDeckText(e.target.value)}
        className="w-full h-60 border rounded p-2 font-mono"
      />

      {errorMsg && <div className="text-red-500">{errorMsg}</div>}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2">Card</th>
            <th className="text-right py-2">Need</th>
            <th className="text-right py-2">Unit</th>
            <th className="text-right py-2">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b">
              <td className="py-1">{r.name}</td>
              <td className="text-right py-1">{r.need}</td>
              <td className="text-right py-1">
                {currencyPrefix(currency)} {r.unit.toFixed(2)}
              </td>
              <td className="text-right py-1">
                {currencyPrefix(currency)} {r.subtotal.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="font-semibold text-right">
        Total: {currencyPrefix(currency)} {total.toFixed(2)}
      </div>
    </div>
  );
}
