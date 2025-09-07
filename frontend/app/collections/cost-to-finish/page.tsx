"use client";

export const dynamic = "force-dynamic";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { normalizeName } from "@/lib/mtg/normalize";
import { Currency, currencyPrefix } from "@/lib/currency";

type Row = { name: string; need: number; unit: number; subtotal: number };

function InnerCostToFinish() {
  const params = useSearchParams();
  const deckId = params.get("deck") || "";

  const [currency, setCurrency] = useState<Currency>("USD");
  const [deckText, setDeckText] = useState<string>(
    "1 Treasure Cruise\n1 Dig Through Time\n10 Island\n8 Mountain"
  );
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const bootLoaded = useRef(false);

  async function compute(incomingText?: string) {
    setLoading(true);
    setErrorMsg("");
    try {
      const theText = (incomingText ?? deckText).trim();
      if (!theText) throw new Error("Paste a decklist first.");

      const lines = theText.split("\n").map((l) => l.trim()).filter(Boolean);
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
      if (!res.ok || j?.ok === false) throw new Error(j.error || "Price lookup failed");

      const prices: Record<string, number> = j.prices ?? {};
      const newRows = entries.map((e) => {
        const unit = prices[normalizeName(e.name)] ?? 0;
        const subtotal = +(unit * e.qty).toFixed(2);
        return { name: e.name, need: e.qty, unit, subtotal };
      });
      setRows(newRows);
      setTotal(+newRows.reduce((a, r) => a + r.subtotal, 0).toFixed(2));
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to compute.");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  // If ?deck=<id> is present, fetch deck text once on first render and compute
  useEffect(() => {
    if (!deckId || bootLoaded.current) return;
    bootLoaded.current = true;

    (async () => {
      try {
        const res = await fetch(`/api/decks/get?id=${encodeURIComponent(deckId)}`, {
          cache: "no-store",
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j?.ok === false) {
          setErrorMsg(j.error || "Failed to load deck.");
          return;
        }

        const text: string =
          j?.deck?.deck_text ??
          j?.deck?.meta?.deck_text ??
          j?.deck?.data?.text ??
          "";

        if (text) {
          setDeckText(text);
          // auto-compute once we’ve loaded the deck
          compute(text);
        }
      } catch (err: any) {
        setErrorMsg(err?.message || "Failed to load deck.");
      }
    })();
  }, [deckId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cost to Finish</h1>
        {deckId ? (
          <div className="text-xs opacity-70">Deck: {deckId}</div>
        ) : null}
      </div>

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
          onClick={() => compute()}
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
        placeholder="Paste a decklist, one card per line (e.g. '2 Sol Ring')"
      />

      {errorMsg && <div className="text-red-500">{errorMsg}</div>}

      <div className="overflow-x-auto">
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
      </div>

      <div className="font-semibold text-right">
        Total: {currencyPrefix(currency)} {total.toFixed(2)}
      </div>
    </div>
  );
}

export default function CostToFinishPage() {
  // Next 15 requires a Suspense boundary when using useSearchParams()
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto p-6">Loading…</div>}>
      <InnerCostToFinish />
    </Suspense>
  );
}
