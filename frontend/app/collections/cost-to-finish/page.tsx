// frontend/app/collections/cost-to-finish/page.tsx
"use client";

import React from "react";

type MissingRow = {
  name: string;
  need: number;
  unit: number;
  subtotal: number;
};

type Cur = "USD" | "EUR" | "GBP";

function parseList(text: string): { name: string; qty: number }[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: { name: string; qty: number }[] = [];
  for (const line of lines) {
    const m1 = line.match(/^(\d+)\s+(.+)$/); // "1 Sol Ring"
    if (m1) { rows.push({ name: m1[2].trim(), qty: parseInt(m1[1], 10) || 1 }); continue; }
    const m2 = line.match(/^(.+?)\s+x(\d+)$/i); // "Sol Ring x1"
    if (m2) { rows.push({ name: m2[1].trim(), qty: parseInt(m2[2], 10) || 1 }); continue; }
    rows.push({ name: line, qty: 1 }); // bare
  }
  return rows;
}

export default function CostToFinishPage() {
  const [collections, setCollections] = React.useState<{ id: string; name: string }[]>([]);
  const [collectionId, setCollectionId] = React.useState<string>("");
  const [currency, setCurrency] = React.useState<Cur>("USD");
  const [deckText, setDeckText] = React.useState(
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

  const [rows, setRows] = React.useState<MissingRow[]>([]);
  const [total, setTotal] = React.useState<number>(0);
  const [busy, setBusy] = React.useState(false);

  // Load user's collections into the dropdown
  React.useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/collections/list");
        if (!r.ok) return;
        const j = await r.json();
        // expecting { collections: [{id,name,created_at}, ...] }
        setCollections((j?.collections || []).map((c: any) => ({ id: c.id, name: c.name })));
      } catch {}
    })();
  }, []);

  const fmt = (n: number) => `${currency} ${n.toFixed(2)}`;

  const handleCompute = async () => {
    setBusy(true);
    try {
      const want = parseList(deckText);
      const needMap: Record<string, number> = {};
      for (const w of want) {
        const key = w.name.toLowerCase();
        needMap[key] = (needMap[key] || 0) + w.qty;
      }

      // subtract OWNED if a collection is selected
      if (collectionId) {
        const ownedRes = await fetch(`/api/collections/cards?collection_id=${encodeURIComponent(collectionId)}`);
        if (ownedRes.ok) {
          const ownedJson: { ok: boolean; owned: Record<string, number> } = await ownedRes.json();
          const owned = ownedJson?.owned || {};
          for (const key of Object.keys(needMap)) {
            const left = Math.max(0, (needMap[key] || 0) - (owned[key] || 0));
            needMap[key] = left;
          }
        }
      }

      // names that still needed
      const missingNames = Object.keys(needMap).filter((k) => needMap[k] > 0);
      if (!missingNames.length) {
        setRows([]);
        setTotal(0);
        setBusy(false);
        return;
      }

      // fetch prices
      const priceRes = await fetch("/api/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: missingNames, currency }),
      });
      if (!priceRes.ok) {
        alert("Price lookup failed");
        setBusy(false);
        return;
      }
      const priceJson: {
        ok: boolean;
        currency: Cur;
        prices: Record<string, { unit: number; found: boolean }>;
      } = await priceRes.json();

      const out: MissingRow[] = [];
      let t = 0;
      for (const key of missingNames) {
        const need = needMap[key];
        const unit = priceJson.prices[key]?.found ? priceJson.prices[key].unit : 0;
        const subtotal = need * unit;
        t += subtotal;

        const display = want.find((w) => w.name.toLowerCase() === key)?.name || key;
        out.push({ name: display, need, unit, subtotal });
      }
      out.sort((a, b) => b.subtotal - a.subtotal);

      setRows(out);
      setTotal(t);
    } catch (e: any) {
      alert(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold">Cost to finish</h1>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded border border-neutral-800 p-4 space-y-4">
          <div>
            <label className="text-sm text-neutral-300">Your collection</label>
            <select
              value={collectionId}
              onChange={(e) => setCollectionId(e.target.value)}
              className="w-full mt-1 rounded bg-neutral-900 border border-neutral-700 p-2"
            >
              <option value="">(Not linked in MVP)</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-neutral-300">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Cur)}
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
            disabled={busy}
            className="rounded bg-amber-600 hover:bg-amber-700 px-3 py-2 text-sm font-medium disabled:opacity-60"
          >
            {busy ? "Computing…" : "Compute cost"}
          </button>
        </div>

        <div className="rounded border border-neutral-800 p-4">
          <div className="mb-3 text-sm text-neutral-300">
            {rows.length
              ? `Missing ${rows.length} unique cards. Estimated total: ${fmt(total)}`
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
              <div key={r.name} className="grid grid-cols-4 py-2 text-sm">
                <div className="truncate pr-2">{r.name}</div>
                <div className="text-right">{r.need}</div>
                <div className="text-right">{fmt(r.unit)}</div>
                <div className="text-right">{fmt(r.subtotal)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
