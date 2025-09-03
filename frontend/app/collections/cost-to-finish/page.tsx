// frontend/app/collections/cost-to-finish/page.tsx
"use client";

import React, { useMemo, useState } from "react";

type MissingRow = {
  name: string;
  need: number;
  unit: number;     // filled from /api/price
  subtotal: number; // need * unit
};

function parseList(text: string): { name: string; qty: number }[] {
  // Accepts formats like:
  // 1 Sol Ring
  // Sol Ring x1
  // 10 Island
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: { name: string; qty: number }[] = [];

  for (const line of lines) {
    // "1 Sol Ring" OR "10 Mountain"
    const m1 = line.match(/^(\d+)\s+(.+)$/);
    if (m1) {
      const qty = parseInt(m1[1], 10) || 1;
      const name = m1[2].trim();
      rows.push({ name, qty });
      continue;
    }

    // "Sol Ring x1"
    const m2 = line.match(/^(.+?)\s+x(\d+)$/i);
    if (m2) {
      const name = m2[1].trim();
      const qty = parseInt(m2[2], 10) || 1;
      rows.push({ name, qty });
      continue;
    }

    // bare line → qty 1
    rows.push({ name: line, qty: 1 });
  }

  return rows;
}

export default function CostToFinishPage() {
  const [collectionOptions, setCollectionOptions] = useState<string[]>([]);
  const [collectionName, setCollectionName] = useState<string>("");
  const [currency, setCurrency] = useState<"USD" | "EUR" | "GBP">("USD");
  const [deckText, setDeckText] = useState<string>(
    [
      "1 Treasure Cruise",
      "1 Dig Through Time",
      "1 Mystic Sanctuary",
      "1 Reliquary Tower",
      "1 Command Tower",
      "1 Steam Vents",
      "1 Sulfur Falls",
      "1 Spirebluff Canal",
      "10 Island",
      "8 Mountain",
    ].join("\n")
  );

  const [rows, setRows] = useState<MissingRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [computing, setComputing] = useState(false);

  // (Optional) load user's collections in a real app.
  React.useEffect(() => {
    // If you already have /api/collections/list, you can fetch and set options here
    // setCollectionOptions([...])
  }, []);

  const handleCompute = async () => {
    setComputing(true);
    try {
      // 1) Parse the decklist into wanted card counts
      const want = parseList(deckText);

      // 2) Pull the user's collection counts (here we assume zero for MVP)
      // If you have server data, join it here to compute "need".
      const missingMap: Record<string, number> = {};
      for (const w of want) {
        const key = w.name.toLowerCase();
        missingMap[key] = (missingMap[key] || 0) + w.qty; // assume none owned for MVP
      }

      const missingNames = Object.keys(missingMap);
      if (!missingNames.length) {
        setRows([]);
        setTotal(0);
        setComputing(false);
        return;
      }

      // 3) Ask our price API for unit prices
      const priceRes = await fetch("/api/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          names: missingNames,
          currency,
        }),
      });

      if (!priceRes.ok) {
        const msg = await priceRes.text();
        alert(`Compute failed: ${msg}`);
        setComputing(false);
        return;
      }

      const priceJson: {
        ok: boolean;
        currency: "USD" | "EUR" | "GBP";
        prices: Record<string, { unit: number; found: boolean }>;
      } = await priceRes.json();

      const out: MissingRow[] = [];
      let t = 0;

      for (const nameLower of missingNames) {
        const need = missingMap[nameLower] || 0;
        const unit =
          priceJson.prices[nameLower]?.unit && priceJson.prices[nameLower].found
            ? priceJson.prices[nameLower].unit
            : 0;

        const subtotal = need * unit;
        t += subtotal;

        // Use original capitalization from want list if available
        const display =
          want.find((w) => w.name.toLowerCase() === nameLower)?.name ||
          nameLower;

        out.push({
          name: display,
          need,
          unit,
          subtotal,
        });
      }

      // Sort by subtotal desc for readability
      out.sort((a, b) => b.subtotal - a.subtotal);

      setRows(out);
      setTotal(t);
    } catch (e: any) {
      alert(`Compute failed: ${e?.message || e}`);
    } finally {
      setComputing(false);
    }
  };

  const fmt = (n: number) =>
    `${currency} ${n.toFixed(2)}`;

  return (
    <div className="max-w-[1100px] mx-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold">Cost to finish</h1>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded border border-neutral-800 p-4 space-y-4">
          <div>
            <label className="text-sm text-neutral-300">Your collection</label>
            <select
              value={collectionName}
              onChange={(e) => setCollectionName(e.target.value)}
              className="w-full mt-1 rounded bg-neutral-900 border border-neutral-700 p-2"
            >
              <option value="">(Not linked in MVP)</option>
              {collectionOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-neutral-300">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as any)}
              className="w-full mt-1 rounded bg-neutral-900 border border-neutral-700 p-2"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>

          <div>
            <label className="text-sm text-neutral-300">Decklist</label>
            <textarea
              value={deckText}
              onChange={(e) => setDeckText(e.target.value)}
              rows={16}
              className="w-full mt-1 rounded bg-neutral-900 border border-neutral-700 p-2 font-mono text-sm"
            />
          </div>

          <button
            onClick={handleCompute}
            disabled={computing}
            className="rounded bg-amber-600 hover:bg-amber-700 px-3 py-2 text-sm font-medium disabled:opacity-60"
          >
            {computing ? "Computing…" : "Compute cost"}
          </button>
        </div>

        <div className="rounded border border-neutral-800 p-4">
          <div className="mb-3 text-sm text-neutral-300">
            {rows.length
              ? `Missing ${rows.length} unique cards. Estimated total: ${fmt(
                  total
                )}`
              : `Missing 0 unique cards. Estimated total: ${fmt(0)}`}
          </div>

          <div className="divide-y divide-neutral-800">
            <div className="grid grid-cols-4 text-xs uppercase text-neutral-400 pb-2">
              <div>Card</div>
              <div className="text-right">Need</div>
              <div className="text-right">Unit</div>
              <div className="text-right">Subtotal</div>
            </div>
            {rows.map((r) => (
              <div
                key={r.name}
                className="grid grid-cols-4 py-2 text-sm items-center"
              >
                <div className="truncate pr-2">{r.name}</div>
                <div className="text-right">{r.need}</div>
                <div className="text-right">
                  {r.unit > 0 ? fmt(r.unit) : "—"}
                </div>
                <div className="text-right">{fmt(r.subtotal)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
