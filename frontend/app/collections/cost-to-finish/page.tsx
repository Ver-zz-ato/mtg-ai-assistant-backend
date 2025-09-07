"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { normalizeName } from "@/lib/mtg/normalize";
import { Currency, currencyPrefix } from "@/lib/currency";

type Collection = { id: string; name: string; created_at?: string | null };

// UI row
type Row = {
  name: string;
  need: number;
  unit: number;
  subtotal: number;
  unpriced?: boolean;
};

type DeckEntry = { name: string; qty: number };

// Try to read a variety of response shapes from /api/collections/cards
function extractOwnedMap(json: any): Record<string, number> {
  const rows: any[] =
    json?.cards ?? json?.rows ?? json?.data ?? json?.items ?? [];
  const map: Record<string, number> = {};
  for (const r of rows) {
    const name: string =
      r.name ??
      r.card_name ??
      r.title ??
      r.card ??
      (typeof r[0] === "string" ? r[0] : "");
    if (!name) continue;
    const qty: number =
      Number(
        r.qty ??
          r.quantity ??
          r.count ??
          r.owned ??
          r.amount ??
          r.total ??
          r[1]
      ) || 0;
    map[normalizeName(name)] = (map[normalizeName(name)] ?? 0) + qty;
  }
  return map;
}

function parseDeckText(deckText: string): DeckEntry[] {
  const lines = deckText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: DeckEntry[] = [];
  for (const line of lines) {
    const m = line.match(/^(\d+)\s+(.+)$/);
    if (m) out.push({ qty: Number(m[1]), name: m[2] });
    else out.push({ qty: 1, name: line });
  }
  return out;
}

export default function CostToFinishPage() {
  const search = useSearchParams();
  const deckIdParam = search.get("deck") || "";

  const [currency, setCurrency] = React.useState<Currency>("USD");
  const [collections, setCollections] = React.useState<Collection[]>([]);
  const [collectionId, setCollectionId] = React.useState<string>("");
  const [deckText, setDeckText] = React.useState<string>(
    "1 Treasure Cruise\n1 Dig Through Time\n10 Island\n8 Mountain"
  );

  const [rows, setRows] = React.useState<Row[]>([]);
  const [total, setTotal] = React.useState<number>(0);
  const [missingCount, setMissingCount] = React.useState<number>(0);
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState("");

  // Load collections list
  React.useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/collections/list", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        const cols: Collection[] = j?.collections ?? j?.rows ?? [];
        setCollections(cols);
        if (!collectionId && cols.length) setCollectionId(cols[0].id);
      } catch {
        // non-fatal
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If ?deck=<id> present, load that deck’s text once
  React.useEffect(() => {
    if (!deckIdParam) return;
    (async () => {
      try {
        const r = await fetch(`/api/decks/get?id=${encodeURIComponent(deckIdParam)}`, {
          cache: "no-store",
        });
        const j = await r.json().catch(() => ({}));
        // Try a few shapes
        const d = j?.deck ?? j?.data ?? j;
        const txt =
          d?.deck_text ??
          d?.meta?.deck_text ??
          d?.data?.text ??
          d?.text ??
          "";
        if (typeof txt === "string" && txt.trim()) {
          setDeckText(txt);
        }
      } catch {
        // ignore
      }
    })();
  }, [deckIdParam]);

  async function getOwnedMap(): Promise<Record<string, number>> {
    if (!collectionId) return {};
    try {
      const r = await fetch(
        `/api/collections/cards?collection_id=${encodeURIComponent(collectionId)}`,
        { cache: "no-store" }
      );
      const j = await r.json().catch(() => ({}));
      return extractOwnedMap(j);
    } catch {
      return {};
    }
  }

  async function compute() {
    setLoading(true);
    setErrorMsg("");
    setMissingCount(0);
    try {
      // 1) Parse deck text to entries, aggregate required counts
      const entries = parseDeckText(deckText);
      const required: Record<string, number> = {};
      for (const e of entries) {
        const k = normalizeName(e.name);
        required[k] = (required[k] ?? 0) + e.qty;
      }

      // 2) Load owned map (if any collection selected)
      const owned = await getOwnedMap();

      // 3) Compute NEED = max(0, required - owned)
      const needMap: Record<string, number> = {};
      const namesToPrice: string[] = [];
      for (const e of entries) {
        const k = normalizeName(e.name);
        if (needMap[k] !== undefined) continue; // already computed for this card name
        const need = Math.max(0, (required[k] ?? 0) - (owned[k] ?? 0));
        needMap[k] = need;
        if (need > 0) namesToPrice.push(e.name);
      }

      // 4) Price only the needed names
      let prices: Record<string, number> = {};
      if (namesToPrice.length) {
        const res = await fetch("/api/price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names: namesToPrice, currency }),
        });
        const j = await res.json();
        if (!j.ok) throw new Error(j.error || "Price lookup failed");
        prices = (j.prices ?? {}) as Record<string, number>;
      }

      // 5) Make the table rows
      const newRows: Row[] = [];
      let missing = 0;
      for (const e of entries) {
        const k = normalizeName(e.name);
        if (needMap[k] === undefined) continue; // safety
        const need = needMap[k];
        if (need === 0) continue;
        const unit = Number(prices[k] ?? 0);
        const unpriced = !prices.hasOwnProperty(k) || unit <= 0;
        if (unpriced) missing++;
        const subtotal = +(unit * need).toFixed(2);
        newRows.push({ name: e.name, need, unit, subtotal, unpriced });
        // mark processed to avoid duplicate lines for duplicate names in deck text
        needMap[k] = -1;
      }

      newRows.sort((a, b) => b.subtotal - a.subtotal || a.name.localeCompare(b.name));
      setRows(newRows);
      setMissingCount(missing);
      setTotal(+newRows.reduce((acc, r) => acc + r.subtotal, 0).toFixed(2));
    } catch (e: any) {
      setErrorMsg(e?.message || "Computation failed");
      setRows([]);
      setTotal(0);
      setMissingCount(0);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Cost to Finish</h1>
        {deckIdParam ? (
          <div className="text-xs opacity-70">Loaded from deck: <code>{deckIdParam}</code></div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <label className="text-sm">
          Currency{" "}
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
            className="border p-2 rounded text-sm"
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </label>

        <label className="text-sm">
          Collection{" "}
          <select
            value={collectionId}
            onChange={(e) => setCollectionId(e.target.value)}
            className="border p-2 rounded text-sm"
          >
            <option value="">None</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={compute}
          disabled={loading}
          className="bg-orange-600 text-white px-4 py-2 rounded disabled:opacity-60"
          title="Compute missing card costs"
        >
          {loading ? "Computing..." : "Compute cost"}
        </button>
      </div>

      <textarea
        value={deckText}
        onChange={(e) => setDeckText(e.target.value)}
        className="w-full h-60 border rounded p-2 font-mono"
        spellCheck={false}
      />

      {errorMsg && <div className="text-red-500">{errorMsg}</div>}

      <div className="text-sm opacity-80">
        {rows.length ? (
          <>
            {missingCount > 0 ? (
              <div className="mb-2">
                ⚠️ {missingCount} item{missingCount === 1 ? "" : "s"} had no price; they’re shown with “— unpriced”.
              </div>
            ) : null}
          </>
        ) : null}
      </div>

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
                {r.unpriced ? (
                  <span className="opacity-60">— unpriced</span>
                ) : (
                  <>
                    {currencyPrefix(currency)} {r.unit.toFixed(2)}
                  </>
                )}
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
