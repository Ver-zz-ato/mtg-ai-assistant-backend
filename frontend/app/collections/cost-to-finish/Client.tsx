"use client";

import React from "react";
import { normalizeName } from "@/lib/mtg/normalize";
import { Currency, currencyPrefix } from "@/lib/currency";

type Row = { name: string; need: number; unit: number; subtotal: number };
type Collection = { id: string; name: string; created_at?: string | null };

type Props = {
  deckId?: string | null;
  collectionId?: string | null;
};

export default function CostToFinishClient({ deckId, collectionId }: Props) {
  const [currency, setCurrency] = React.useState<Currency>("USD");
  const [deckText, setDeckText] = React.useState<string>(
    "1 Treasure Cruise\n1 Dig Through Time\n10 Island\n8 Mountain"
  );
  const [rows, setRows] = React.useState<Row[]>([]);
  const [total, setTotal] = React.useState<number>(0);
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState("");

  const [collections, setCollections] = React.useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = React.useState<string>("");
  const [ownedMap, setOwnedMap] = React.useState<Record<string, number>>({});
  const bootedRef = React.useRef(false);

  // Load collections once
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/collections/list", { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || "Failed to load collections");
        const cols: Collection[] = j.collections ?? j.data ?? [];
        setCollections(cols);

        // initial selection: URL ?collection=… → else first
        if (collectionId && cols.some((c) => c.id === collectionId)) {
          setSelectedCollection(collectionId);
        } else if (cols.length) {
          setSelectedCollection(cols[0].id);
        }
      } catch (e: any) {
        setErrorMsg(e.message || "Failed to load collections");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load deck text if deckId present, only once
  React.useEffect(() => {
    if (!deckId || bootedRef.current) return;
    bootedRef.current = true;

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
        if (text) setDeckText(text);
      } catch (err: any) {
        setErrorMsg(err?.message || "Failed to load deck.");
      }
    })();
  }, [deckId]);

  // Load owned cards whenever selectedCollection changes
  React.useEffect(() => {
    if (!selectedCollection) {
      setOwnedMap({});
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `/api/collections/cards?collection_id=${encodeURIComponent(selectedCollection)}`,
          { cache: "no-store" }
        );
        const j = await res.json().catch(() => ({}));

        if (!res.ok || j?.ok === false) throw new Error(j.error || "Failed to load collection cards");

        // Be defensive about shape
        const rows =
          j.cards ??
          j.data ??
          j.rows ??
          [];

        const next: Record<string, number> = {};
        for (const r of rows) {
          const name = (r.name ?? r.card_name ?? r.title ?? "").toString();
          const qty = Number(r.qty ?? r.quantity ?? r.count ?? r.owned ?? 0);
          if (!name) continue;
          const key = normalizeName(name);
          next[key] = (next[key] ?? 0) + (Number.isFinite(qty) ? qty : 0);
        }
        setOwnedMap(next);
      } catch (e: any) {
        setErrorMsg(e.message || "Failed to load collection cards");
        setOwnedMap({});
      }
    })();
  }, [selectedCollection]);

  async function compute(incomingText?: string) {
    setLoading(true);
    setErrorMsg("");
    try {
      const theText = (incomingText ?? deckText).trim();
      if (!theText) throw new Error("Paste a decklist first.");

      // Parse the deck text to entries
      const lines = theText.split("\n").map((l) => l.trim()).filter(Boolean);
      const entries = lines.map((line) => {
        const m = line.match(/^(\d+)\s+(.+)$/);
        return { qty: m ? Number(m[1]) : 1, name: m ? m[2] : line };
      });

      // Names for pricing
      const names = entries.map((e) => e.name);

      // Get prices
      const res = await fetch("/api/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names, currency }),
      });
      const j = await res.json();
      if (!res.ok || j?.ok === false) throw new Error(j.error || "Price lookup failed");

      const prices: Record<string, number> = j.prices ?? {};

      // Build rows with NEED = deck qty - owned qty
      const newRows = entries.map((e) => {
        const key = normalizeName(e.name);
        const owned = ownedMap[key] ?? 0;
        const need = Math.max(0, (e.qty || 0) - owned);
        const unit = prices[key] ?? 0;
        const subtotal = +(unit * need).toFixed(2);
        return { name: e.name, need, unit, subtotal };
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

  const selectedName = collections.find((c) => c.id === selectedCollection)?.name ?? "";

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Cost to Finish</h1>
        {deckId ? <div className="text-xs opacity-70">Deck: {deckId}</div> : null}
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="flex gap-2 items-center">
          <label className="text-sm opacity-80">Currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
            className="border p-2 rounded"
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </div>

        <div className="flex gap-2 items-center">
          <label className="text-sm opacity-80">Collection</label>
          <select
            value={selectedCollection}
            onChange={(e) => setSelectedCollection(e.target.value)}
            className="border p-2 rounded min-w-[12rem]"
          >
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            {!collections.length && <option value="">No collections</option>}
          </select>
        </div>

        <button
          onClick={() => compute()}
          disabled={loading}
          className="bg-orange-600 text-white px-4 py-2 rounded disabled:opacity-60"
        >
          {loading ? "Computing..." : "Compute cost"}
        </button>
      </div>

      {/* Deck input */}
      <textarea
        value={deckText}
        onChange={(e) => setDeckText(e.target.value)}
        className="w-full h-60 border rounded p-2 font-mono"
        placeholder="Paste a decklist, one card per line (e.g. '2 Sol Ring')"
      />

      {/* Owned summary */}
      {selectedCollection && (
        <div className="text-xs opacity-70">
          Using owned quantities from <span className="font-medium">{selectedName}</span>. Need = deck − owned (never negative).
        </div>
      )}

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
