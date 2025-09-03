"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import SaveDeckButton from "@/components/SaveDeckButton";
import { normalizeName } from "@/lib/mtg/normalize";
import { Currency, currencyPrefix } from "@/lib/currency";

type Row = { name: string; need: number; unit: number; subtotal: number };
type CollectionInfo = { id: string; name: string };

function parseDecklist(deckText: string): { qty: number; name: string }[] {
  return deckText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(\d+)\s+(.+)$/);
      return { qty: m ? Number(m[1]) : 1, name: m ? m[2] : line };
    });
}

async function fetchCollections(): Promise<CollectionInfo[]> {
  const res = await fetch("/api/collections/list", { method: "GET", cache: "no-store" });
  if (!res.ok) return [];
  const j = await res.json();
  if (Array.isArray(j)) return j as CollectionInfo[];
  if (Array.isArray(j?.collections)) return j.collections as CollectionInfo[];
  if (Array.isArray(j?.data)) return j.data as CollectionInfo[];
  return [];
}

type OwnedMap = Record<string, number>;
async function fetchOwned(collectionId: string): Promise<OwnedMap> {
  if (!collectionId) return {};
  let res = await fetch(`/api/collections/cards?collectionId=${encodeURIComponent(collectionId)}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) {
    res = await fetch("/api/collections/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collectionId }),
    });
  }
  if (!res.ok) return {};
  const j = await res.json();
  const arr: any[] =
    Array.isArray(j) ? j :
    Array.isArray(j?.cards) ? j.cards :
    Array.isArray(j?.data) ? j.data : [];
  const map: OwnedMap = {};
  for (const c of arr) {
    const name: string = c.name ?? c.card_name ?? c.CardName ?? "";
    const qty: number = Number(c.qty ?? c.quantity ?? c.count ?? 0) || 0;
    if (!name) continue;
    map[normalizeName(name)] = (map[normalizeName(name)] ?? 0) + qty;
  }
  return map;
}

function CostToFinishInner() {
  const searchParams = useSearchParams();
  const deckIdParam = searchParams.get("deckId");

  const [collections, setCollections] = React.useState<CollectionInfo[]>([]);
  const [collectionId, setCollectionId] = React.useState<string>("");
  const [owned, setOwned] = React.useState<OwnedMap>({});

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
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState("");

  React.useEffect(() => {
    (async () => {
      const list = await fetchCollections();
      setCollections(list);
      if (list.length === 1) setCollectionId(list[0].id);
    })();
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setOwned({});
      if (!collectionId) return;
      const map = await fetchOwned(collectionId);
      if (!cancelled) setOwned(map);
    })();
    return () => { cancelled = true; };
  }, [collectionId]);

  React.useEffect(() => {
    let cancelled = false;
    if (!deckIdParam) return;
    (async () => {
      try {
        const r = await fetch(`/api/decks/${encodeURIComponent(deckIdParam)}`, { cache: "no-store" });
        const j = await r.json();
        if (j?.ok && j.deck?.deck_text && !cancelled) setDeckText(j.deck.deck_text);
      } catch (e) {
        console.error("[COST] failed to load deckId", e);
      }
    })();
    return () => { cancelled = true; };
  }, [deckIdParam]);

  async function compute() {
    setLoading(true);
    setErrorMsg("");
    try {
      const entries = parseDecklist(deckText);
      const needEntries = entries
        .map((e) => {
          const have = owned[normalizeName(e.name)] ?? 0;
          const need = Math.max(e.qty - have, 0);
          return { ...e, need };
        })
        .filter((e) => e.need > 0);

      if (needEntries.length === 0) {
        setRows([]);
        setTotal(0);
        setLoading(false);
        return;
      }

      const res = await fetch("/api/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: needEntries.map((e) => e.name), currency }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Price lookup failed");

      const prices: Record<string, number> = j.prices;

      const newRows: Row[] = needEntries.map((e) => {
        const unit = prices[normalizeName(e.name)] ?? 0;
        const subtotal = +(unit * e.need).toFixed(2);
        return { name: e.name, need: e.need, unit, subtotal };
      });

      setRows(newRows);
      setTotal(+newRows.reduce((a, r) => a + r.subtotal, 0).toFixed(2));
    } catch (e: any) {
      setErrorMsg(e.message || "Something went wrong");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  const missingUnique = rows.filter((r) => r.need > 0).length;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold">Cost to finish</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm text-neutral-400">Your collection</label>
          <select
            value={collectionId}
            onChange={(e) => setCollectionId(e.target.value)}
            className="border p-2 rounded bg-neutral-900"
          >
            <option value="">{`(Not linked in MVP)`}</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {collectionId && (
            <div className="text-xs text-neutral-400">
              Owned cards loaded: {Object.keys(owned).length.toLocaleString()}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-neutral-400">Currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
            className="border p-2 rounded bg-neutral-900"
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </div>

        <div className="flex items-end">
          <button
            onClick={compute}
            disabled={loading}
            className="w-full bg-orange-600 text-white px-4 py-2 rounded h-11 disabled:opacity-60"
          >
            {loading ? "Computing..." : "Compute cost"}
          </button>
        </div>

        <div className="flex items-end justify-end">
          <SaveDeckButton getDeckText={() => deckText} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm text-neutral-400">Decklist</label>
        <textarea
          value={deckText}
          onChange={(e) => setDeckText(e.target.value)}
          className="w-full h-60 border rounded p-2 font-mono bg-neutral-950"
        />
      </div>

      {errorMsg && <div className="text-red-500">{errorMsg}</div>}

      <div className="text-sm text-neutral-300">
        Missing {missingUnique} unique {missingUnique === 1 ? "card" : "cards"}. Estimated total:{" "}
        {currency} {total.toFixed(2)}
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

export default function ClientWrappedCostToFinish() {
  return (
    <Suspense fallback={<div className="p-6">Loading…</div>}>
      <CostToFinishInner />
    </Suspense>
  );
}
