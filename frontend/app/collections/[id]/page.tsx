"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";

type CardRow = { id?: string; name: string; qty: number };

export default function CollectionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();

  const collectionId = decodeURIComponent(String(params.id));
  const [cards, setCards] = useState<CardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  // form state
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState<number | "">("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // optional backlink from Cost-to-Finish
  const backTo = useMemo(() => search.get("back") || "/collections", [search]);

  async function refresh() {
    setErr("");
    setLoading(true);
    try {
      const res = await fetch(`/api/collections/cards?collectionId=${encodeURIComponent(collectionId)}`, {
        cache: "no-store",
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || res.statusText);
      setCards((j.cards || []).map((r: any) => ({
        id: r.id,
        name: String(r.name),
        qty: Number(r.qty || 0),
      })));
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [collectionId]);

  /** Add one card (upsert) */
  async function addOne() {
    const name = newName.trim();
    const qty = typeof newQty === "number" ? newQty : Number(newQty || 0);
    if (!name || qty <= 0) return;
    setErr("");
    try {
      const res = await fetch("/api/collections/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId, name, qty }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || res.statusText);
      setNewName("");
      setNewQty("");
      await refresh();
    } catch (e: any) {
      setErr(e.message || String(e));
    }
  }

  /** Update qty inline; qty<=0 will delete */
  async function updateQty(row: CardRow, next: number) {
    setErr("");
    try {
      const res = await fetch("/api/collections/cards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, collectionId, name: row.name, qty: next }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || res.statusText);
      await refresh();
    } catch (e: any) {
      setErr(e.message || String(e));
    }
  }

  /** Delete row */
  async function delRow(row: CardRow) {
    setErr("");
    try {
      const url = new URL(location.origin + "/api/collections/cards");
      if (row.id) url.searchParams.set("id", row.id);
      else {
        url.searchParams.set("collectionId", collectionId);
        url.searchParams.set("name", row.name);
      }
      const res = await fetch(url.toString(), { method: "DELETE" });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || res.statusText);
      await refresh();
    } catch (e: any) {
      setErr(e.message || String(e));
    }
  }

  /** CSV upload: accepts headers name + (qty | count | owned). Ignores rows with qty<=0 */
  async function uploadCsv(f: File) {
    setErr("");
    setUploading(true);
    try {
      const text = await f.text();
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) {
        setUploading(false);
        return;
      }
      const [headerLine, ...rows] = lines;
      const headers = headerLine.split(",").map(h => h.trim().toLowerCase());

      const idxName = headers.findIndex(h => h === "name");
      const idxQty  = headers.findIndex(h => ["qty","count","owned"].includes(h));

      // If the CSV is a cost-to-finish export (name,need,unit,...), idxQty will be -1
      // -> We’ll import with qty=0 and server will ignore (so no UI hang).
      const parsed = rows
        .map(line => line.split(","))
        .map(cols => ({
          name: (cols[idxName] || "").trim(),
          qty: idxQty >= 0 ? Number(cols[idxQty] || 0) : 0,
        }))
        .filter(r => r.name); // keep only with a name

      const res = await fetch("/api/collections/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId, rows: parsed }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || res.statusText);
      if (fileRef.current) fileRef.current.value = "";
      await refresh();
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Collection</h1>
        <Link href={backTo} className="text-sm underline underline-offset-4">← Back to Collections</Link>
      </div>

      <div className="text-xs opacity-70 break-all">ID: {collectionId}</div>

      {err && <div className="rounded-md border border-red-600 bg-red-900/20 text-red-300 p-3 text-sm">{String(err)}</div>}

      {/* Add card & CSV */}
      <div className="rounded-xl border p-4 space-y-3">
        <div className="text-sm font-medium">Add card</div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border bg-black/20 px-3 py-2"
            placeholder="Card name (e.g., Sol Ring)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <input
            className="w-28 rounded-md border bg-black/20 px-3 py-2 text-right"
            placeholder="Qty"
            inputMode="numeric"
            value={newQty}
            onChange={e => setNewQty(e.target.value.replace(/[^\d]/g, "") as any)}
          />
          <button
            className="rounded-md border px-3 py-2 hover:bg-white/10"
            onClick={addOne}
          >
            Add
          </button>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs opacity-70">
            CSV headers accepted: <code>name,qty</code> (also <code>count</code>, <code>owned</code>). Bare lines like <code>2,Sol Ring</code> also work.
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadCsv(f);
            }}
          />
          <span className="text-xs opacity-70">{uploading ? "Uploading…" : ""}</span>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="rounded-xl border p-4 text-sm opacity-75">Loading…</div>
      ) : cards.length === 0 ? (
        <div className="rounded-xl border p-4 text-sm">No cards in this collection yet — add one above or upload a CSV.</div>
      ) : (
        <div className="rounded-xl border">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3">Card</th>
                <th className="text-right py-2 px-3">Qty</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {cards.map((r) => (
                <tr key={r.id ?? r.name} className="border-b">
                  <td className="py-1 px-3">{r.name}</td>
                  <td className="py-1 px-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        className="rounded border px-2 py-0.5"
                        onClick={() => updateQty(r, Math.max(0, r.qty - 1))}
                        title="Decrease"
                      >–</button>
                      <span className="min-w-6 text-center">{r.qty}</span>
                      <button
                        className="rounded border px-2 py-0.5"
                        onClick={() => updateQty(r, r.qty + 1)}
                        title="Increase"
                      >+</button>
                    </div>
                  </td>
                  <td className="py-1 px-3 text-right">
                    <button
                      className="rounded-md border px-2 py-1 hover:bg-white/10"
                      onClick={() => delRow(r)}
                    >
                      delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Quick link back into cost-to-finish */}
      <div className="pt-2">
        <Link
          href={`/collections/cost-to-finish?deck=${encodeURIComponent(search.get("deck") || "")}`}
          className="text-sm underline underline-offset-4"
        >
          Use in Cost to Finish →
        </Link>
      </div>
    </main>
  );
}
