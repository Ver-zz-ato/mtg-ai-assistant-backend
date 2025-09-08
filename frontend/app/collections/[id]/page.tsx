"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

type CardRow = { id?: string; name: string; qty: number };
type ListResp = { ok: boolean; cards: CardRow[]; error?: string };

export default function CollectionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const collectionId = decodeURIComponent(String(params.id || ""));

  // table
  const [cards, setCards] = useState<CardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // add/edit form
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState<number | "">("");
  const [busyAdd, setBusyAdd] = useState(false);

  // search
  const [q, setQ] = useState("");

  // csv
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);

  // fetch
  useEffect(() => {
    let stop = false;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const res = await fetch(
          `/api/collections/cards?collectionId=${encodeURIComponent(collectionId)}`,
          { cache: "no-store" }
        );
        const j: ListResp = await res.json();
        if (!res.ok || !j.ok) throw new Error(j.error || res.statusText);
        if (!stop) setCards(j.cards ?? []);
      } catch (e: any) {
        if (!stop) setErr(e.message || String(e));
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, [collectionId]);

  // filter
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return cards;
    return cards.filter((c) => c.name.toLowerCase().includes(needle));
  }, [q, cards]);

  // add
  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    const qty = typeof newQty === "number" ? newQty : parseInt(String(newQty || "0"), 10);

    if (!name) return;
    if (!Number.isFinite(qty) || qty < 0) return;

    setBusyAdd(true);
    setErr("");

    // optimistic add (if same name exists, we replace qty to keep in-sync with API behavior)
    const prev = cards;
    const idx = prev.findIndex((r) => r.name.toLowerCase() === name.toLowerCase());
    let optimistic: CardRow[];
    if (idx >= 0) {
      optimistic = [...prev];
      optimistic[idx] = { ...optimistic[idx], qty };
    } else {
      optimistic = [{ id: undefined, name, qty }, ...prev];
    }
    setCards(optimistic);

    try {
      const res = await fetch("/api/collections/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId, rows: [{ name, qty }] }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || res.statusText);
      // refresh from server to get real ids/normalized names
      await hardRefresh();
      setNewName("");
      setNewQty("");
    } catch (e: any) {
      setErr(e.message || String(e));
      setCards(prev);
    } finally {
      setBusyAdd(false);
    }
  }

  // edit qty (inline)
  async function onChangeQty(row: CardRow, nextQty: number) {
    if (!Number.isFinite(nextQty) || nextQty < 0) return;

    // optimistic
    const prev = cards;
    setCards((cs) =>
      cs.map((c) => (c.id === row.id ? { ...c, qty: nextQty } : c))
    );

    try {
      const res = await fetch("/api/collections/cards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, collectionId, name: row.name, qty: nextQty }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || res.statusText);
    } catch (e: any) {
      setErr(e.message || String(e));
      setCards(prev); // revert
    }
  }

  // delete
  async function onDelete(row: CardRow) {
    if (!confirm(`Remove "${row.name}" from this collection?`)) return;

    const prev = cards;
    setCards((cs) => cs.filter((c) => c.id !== row.id));

    try {
      const res = await fetch("/api/collections/cards", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, collectionId, name: row.name }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || res.statusText);
    } catch (e: any) {
      setErr(e.message || String(e));
      setCards(prev); // revert
    }
  }

  // CSV upload
  async function onPickFile() {
    fileRef.current?.click();
  }
  async function onCsvChosen(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    setCsvBusy(true);
    setErr("");
    try {
      const text = await f.text();
      const rows = parseCsvToRows(text);

      if (rows.length === 0) throw new Error("No valid rows found in CSV.");
      const res = await fetch("/api/collections/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId, rows }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || res.statusText);

      await hardRefresh();
      ev.target.value = "";
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setCsvBusy(false);
    }
  }

  function parseCsvToRows(csv: string): CardRow[] {
    // super forgiving:
    // - header row optional
    // - accepted keys: name | card | card_name , qty | count | owned
    // - also accepts bare lines: "2, Sol Ring" or "Sol Ring, 2"
    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];

    // detect header (commas → assume first row header if contains alpha keys)
    let cursor = 0;
    let header: string[] | null = null;
    const first = lines[0].split(",").map((s) => s.trim().toLowerCase());
    if (first.some((h) => /name|card|card_name|qty|count|owned/.test(h))) {
      header = first;
      cursor = 1;
    }

    const out: CardRow[] = [];
    for (; cursor < lines.length; cursor++) {
      const raw = lines[cursor];
      const parts = raw.split(",").map((s) => s.trim());
      let name = "";
      let qty = 0;

      if (header) {
        const kv: Record<string, string> = {};
        header.forEach((h, i) => (kv[h] = parts[i] ?? ""));
        name = kv["name"] || kv["card"] || kv["card_name"] || "";
        qty = parseInt(kv["qty"] || kv["count"] || kv["owned"] || "0", 10) || 0;
      } else {
        // 2-col loose: either "2, Sol Ring" or "Sol Ring, 2"
        if (parts.length === 1) {
          name = parts[0];
          qty = 1;
        } else {
          const a = parts[0];
          const b = parts[1];
          if (/^\d+$/.test(a)) {
            qty = parseInt(a, 10);
            name = b;
          } else if (/^\d+$/.test(b)) {
            qty = parseInt(b, 10);
            name = a;
          } else {
            name = parts.join(", ");
            qty = 1;
          }
        }
      }

      name = name.trim();
      if (!name) continue;
      if (!Number.isFinite(qty) || qty < 0) qty = 0;
      out.push({ name, qty });
    }
    return out;
  }

  async function hardRefresh() {
    const res = await fetch(
      `/api/collections/cards?collectionId=${encodeURIComponent(collectionId)}`,
      { cache: "no-store" }
    );
    const j: ListResp = await res.json();
    if (j.ok) setCards(j.cards ?? []);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Collection</h1>
        <div className="flex items-center gap-4">
          <Link
            href={`/collections/cost-to-finish?collection=${encodeURIComponent(collectionId)}`}
            className="text-sm underline underline-offset-4"
          >
            Use in Cost to Finish →
          </Link>
          <Link href="/collections" className="text-sm underline underline-offset-4">
            ← Back to Collections
          </Link>
        </div>
      </div>

      <div className="text-xs opacity-70 break-all">ID: {collectionId}</div>

      {err && <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm">{err}</div>}
      {loading && <div className="rounded-xl border p-4 text-sm opacity-75">Loading…</div>}

      {/* add + csv */}
      <div className="rounded-xl border p-4 space-y-3">
        <form onSubmit={onAdd} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="block text-xs opacity-70 mb-1">Add card</label>
            <input
              className="w-full rounded-md border bg-transparent px-3 py-2"
              placeholder="Card name (e.g., Sol Ring)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />
          </div>
          <div className="w-28">
            <label className="block text-xs opacity-70 mb-1">Qty</label>
            <input
              type="number"
              min={0}
              className="w-full rounded-md border bg-transparent px-3 py-2"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value === "" ? "" : Number(e.target.value))}
              required
            />
          </div>
          <button
            type="submit"
            disabled={busyAdd}
            className="rounded-md border px-4 py-2 text-sm"
          >
            {busyAdd ? "Adding…" : "Add"}
          </button>
        </form>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPickFile}
              disabled={csvBusy}
              className="rounded-md border px-3 py-2 text-sm"
            >
              {csvBusy ? "Uploading…" : "Upload CSV"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onCsvChosen}
              className="hidden"
            />
            <span className="text-xs opacity-70">
              CSV headers accepted: <code>name,qty</code> (also <code>count</code>, <code>owned</code>). Bare lines like <code>2, Sol Ring</code> also work.
            </span>
          </div>

          <div className="w-full sm:w-60">
            <input
              placeholder="Search in collection…"
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* table */}
      {filtered.length > 0 ? (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3">Card</th>
                <th className="text-right py-2 px-3">Qty</th>
                <th className="w-24 py-2 px-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id ?? r.name} className="border-b">
                  <td className="py-1 px-3">{r.name}</td>
                  <td className="py-1 px-3 text-right">
                    <input
                      type="number"
                      min={0}
                      value={r.qty}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (!Number.isNaN(v)) onChangeQty(r, v);
                      }}
                      className="w-20 rounded-md border bg-transparent px-2 py-1 text-right"
                    />
                  </td>
                  <td className="py-1 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => onDelete(r)}
                      className="rounded-md border px-2 py-1 text-xs"
                    >
                      delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !loading && !err ? (
        <div className="rounded-xl border p-4 text-sm">
          No cards in this collection yet — add one above or upload a CSV.
        </div>
      ) : null}
    </main>
  );
}
