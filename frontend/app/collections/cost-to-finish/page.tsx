"use client";

import React from "react";

// ---- Helpers (kept inline so this file is truly drop-in)
type Currency = "USD" | "EUR" | "GBP";

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function currencyPrefix(c: Currency) {
  switch (c) {
    case "EUR":
      return "EUR ";
    case "GBP":
      return "GBP ";
    default:
      return "USD ";
  }
}

type Collection = {
  id: string;
  name: string;
  created_at?: string;
};

type CollectionCard = {
  name: string; // raw typed name as saved
  qty: number; // owned quantity
};

type Row = {
  name: string;
  need: number;
  unit: number;
  subtotal: number;
};

// ---- UI
export default function CostToFinishPage() {
  const [collections, setCollections] = React.useState<Collection[]>([]);
  const [collectionId, setCollectionId] = React.useState<string>(""); // empty = not linked in MVP
  const [ownedByName, setOwnedByName] = React.useState<Record<string, number>>({});
  const [currency, setCurrency] = React.useState<Currency>("USD");
  const [deckText, setDeckText] = React.useState<string>(
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
  const [rows, setRows] = React.useState<Row[]>([]);
  const [total, setTotal] = React.useState<number>(0);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [loadingCollections, setLoadingCollections] = React.useState<boolean>(false);
  const [errorMsg, setErrorMsg] = React.useState<string>("");

  // Load collections on mount
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCollections(true);
      try {
        const r = await fetch("/api/collections/list", { cache: "no-store" });
        const j = await r.json();
        if (!cancelled && Array.isArray(j.collections)) {
          setCollections(j.collections as Collection[]);
          // If there is at least one collection, default-select the first one.
          if ((j.collections as Collection[]).length > 0) {
            setCollectionId(j.collections[0].id);
          }
        }
      } catch (e) {
        // silently ignore; user can still compute without a linked collection
      } finally {
        setLoadingCollections(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load owned cards when a collection is chosen
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!collectionId) {
        setOwnedByName({});
        return;
      }
      try {
        const r = await fetch(`/api/collections/cards?collection_id=${encodeURIComponent(collectionId)}`, {
          cache: "no-store",
        });
        const j = await r.json();
        if (!j.ok || !Array.isArray(j.cards)) {
          if (!cancelled) setOwnedByName({});
          return;
        }
        const map: Record<string, number> = {};
        for (const c of j.cards as CollectionCard[]) {
          const norm = normalizeName(c.name);
          map[norm] = (map[norm] ?? 0) + (Number(c.qty) || 0);
        }
        if (!cancelled) setOwnedByName(map);
      } catch {
        if (!cancelled) setOwnedByName({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  async function compute() {
    setErrorMsg("");
    setLoading(true);
    try {
      // 1) parse decklist -> entries { qty, name }
      const lines = deckText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      type Entry = { qty: number; name: string };
      const entries: Entry[] = lines.map((line) => {
        const m = line.match(/^(\d+)\s+(.+)$/);
        if (!m) return { qty: 1, name: line };
        return { qty: Number(m[1]), name: m[2] };
      });

      // 2) compute "need" per name vs collection-owned
      const withNeed = entries.map((e) => {
        const norm = normalizeName(e.name);
        const owned = ownedByName[norm] ?? 0;
        const need = Math.max(0, e.qty - owned);
        return { ...e, need };
      });

      // filter out rows that need 0
      const needing = withNeed.filter((e) => e.need > 0);

      if (needing.length === 0) {
        setRows([]);
        setTotal(0);
        return;
      }

      // 3) call price API with **raw names** (server normalizes internally)
      const res = await fetch("/api/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          names: needing.map((e) => e.name),
          currency,
        }),
      });
      const json = await res.json();

      if (!json.ok) {
        setErrorMsg(json.error ?? "Price lookup failed");
        setRows([]);
        setTotal(0);
        return;
      }

      const priceMap: Record<string, number> = json.prices ?? {};

      // 4) build rows
      const nextRows: Row[] = needing.map((e) => {
        const norm = normalizeName(e.name);
        const unit = priceMap[norm] ?? 0;
        const subtotal = +(unit * e.need).toFixed(2);
        return { name: e.name, need: e.need, unit, subtotal };
      });

      setRows(nextRows);
      const t = nextRows.reduce((acc, r) => acc + r.subtotal, 0);
      setTotal(+t.toFixed(2));
    } catch (e) {
      setErrorMsg((e as Error)?.message ?? "Compute failed");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold mb-6">Cost to finish</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left panel */}
        <div className="rounded-lg border border-neutral-700/50 p-4 space-y-4">
          <div className="space-y-1">
            <label className="text-sm opacity-80">Your collection</label>
            <select
              className="w-full rounded-md bg-black border border-neutral-700 px-3 py-2"
              value={collectionId}
              onChange={(e) => setCollectionId(e.target.value)}
              disabled={loadingCollections}
            >
              {collections.length === 0 ? (
                <option value="">(Not linked in MVP)</option>
              ) : null}
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm opacity-80">Currency</label>
            <select
              className="w-full rounded-md bg-black border border-neutral-700 px-3 py-2"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm opacity-80">Decklist</label>
            <textarea
              className="w-full h-64 rounded-md bg-black border border-neutral-700 px-3 py-2 font-mono text-sm"
              value={deckText}
              onChange={(e) => setDeckText(e.target.value)}
              placeholder={`1 Lightning Bolt\n4 Counterspell\n...`}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={compute}
              disabled={loading}
              className="rounded-md bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 disabled:opacity-60"
            >
              {loading ? "Computing..." : "Compute cost"}
            </button>
            {errorMsg ? <span className="text-red-400 text-sm">{errorMsg}</span> : null}
          </div>
        </div>

        {/* Right panel - results */}
        <div className="rounded-lg border border-neutral-700/50 p-4 space-y-4">
          <div className="text-sm opacity-80">
            Missing <b>{rows.length}</b> unique card{rows.length === 1 ? "" : "s"}. Estimated total:{" "}
            <b>
              {currencyPrefix(currency)}
              {total.toFixed(2)}
            </b>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left opacity-80">
                <tr className="border-b border-neutral-800">
                  <th className="py-2 pr-2">Card</th>
                  <th className="py-2 pr-2">Need</th>
                  <th className="py-2 pr-2">Unit</th>
                  <th className="py-2 pr-2">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center opacity-60">
                      No missing cards (or not computed yet).
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.name} className="border-b border-neutral-900/60">
                      <td className="py-2 pr-2">{r.name}</td>
                      <td className="py-2 pr-2">{r.need}</td>
                      <td className="py-2 pr-2">
                        {currencyPrefix(currency)}
                        {r.unit.toFixed(2)}
                      </td>
                      <td className="py-2 pr-2">
                        {currencyPrefix(currency)}
                        {r.subtotal.toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
