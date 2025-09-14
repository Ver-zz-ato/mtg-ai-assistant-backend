// app/my-decks/[id]/CardsPane.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import EditorAddBar from "@/components/EditorAddBar";

type CardRow = { id: string; deck_id: string; name: string; qty: number; created_at: string };

export default function CardsPane({ deckId }: { deckId?: string }) {
  const [cards, setCards] = useState<CardRow[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    if (!deckId) return;
    const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, { cache: "no-store" });
    let json: any = {};
    try { json = await res.json(); } catch { json = { ok: false, error: "Bad JSON" }; }
    if (!json?.ok) { setStatus(json?.error || `Error ${res.status}`); return; }
    setCards(json.cards || []);
    setStatus(null);
  }

  useEffect(() => { load(); }, [deckId]);

  async function add(name: string | { name: string }, qty: number) {
    if (!deckId) return;
    const n = (typeof name === "string" ? name : name?.name)?.trim();
    const q = Math.max(1, Number(qty) || 1);
    if (!n) return;

    const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n, qty: q }),
    });
    const json = await res.json().catch(() => ({ ok: false, error: "Bad JSON" }));
    if (!json.ok) { alert(json.error || "Failed to add"); return; }

    window.dispatchEvent(new CustomEvent("toast", { detail: `Added x${q} ${n}` }));
    await load();
  }

  async function delta(id: string, d: number) {
    if (!deckId) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, delta: d }),
      });
      const json = await res.json().catch(() => ({ ok: false, error: "Bad JSON" }));
      if (!json.ok) throw new Error(json.error || "Update failed");
      window.dispatchEvent(new CustomEvent("toast", { detail: d > 0 ? "Added +1" : "Removed -1" }));
      await load();
    } catch (e: any) {
      alert(e?.message || "Error");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string, name: string) {
    if (!deckId) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/decks/cards?id=${encodeURIComponent(id)}&deckid=${encodeURIComponent(deckId)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({ ok: false, error: "Bad JSON" }));
      if (!json.ok) throw new Error(json.error || "Delete failed");
      window.dispatchEvent(new CustomEvent("toast", { detail: `Deleted ${name}` }));
      await load();
    } catch (e: any) {
      alert(e?.message || "Error");
    } finally {
      setBusyId(null);
    }
  }

  // render each actual row (not grouped), sorted by name for a stable view
  const rows = useMemo(() => [...cards].sort((a, b) => a.name.localeCompare(b.name)), [cards]);

  return (
    <div className="mt-2">
      {/* Search + quick add */}
      <div className="max-w-xl"><EditorAddBar onAdd={add} /></div>

      {status && <p className="text-red-400 text-sm mt-2">{status}</p>}

      <div className="mt-3 flex flex-col gap-2">
        {rows.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between rounded border border-neutral-700 px-2 py-1"
          >
            <span className="truncate pr-2">{c.name}</span>

            <div className="flex items-center gap-2">
              <button
                className="px-2 py-0.5 rounded border border-neutral-600 hover:bg-neutral-800 disabled:opacity-50"
                onClick={() => delta(c.id, -1)}
                disabled={busyId === c.id}
                aria-label={`Remove one ${c.name}`}
              >
                −
              </button>
              <span className="w-10 text-center opacity-80 select-none">x{c.qty}</span>
              <button
                className="px-2 py-0.5 rounded border border-neutral-600 hover:bg-neutral-800 disabled:opacity-50"
                onClick={() => delta(c.id, +1)}
                disabled={busyId === c.id}
                aria-label={`Add one ${c.name}`}
              >
                +
              </button>

              <button
                className="ml-3 px-2 py-0.5 text-red-300 border border-red-400 rounded hover:bg-red-950/40 disabled:opacity-50"
                onClick={() => remove(c.id, c.name)}
                disabled={busyId === c.id}
              >
                delete
              </button>
            </div>
          </div>
        ))}

        {rows.length === 0 && !status && (
          <p className="text-sm opacity-70">No cards yet — try adding <em>Sol Ring</em>?</p>
        )}
      </div>
    </div>
  );
}
