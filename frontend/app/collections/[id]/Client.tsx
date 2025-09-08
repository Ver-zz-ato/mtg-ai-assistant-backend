"use client";

import * as React from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Item = { id: string; card_name: string; qty: number; created_at: string | null };
type Collection = { id: string; name: string };

type ScryfallCard = {
  id: string;
  name: string;
  set_name?: string;
  image_uris?: { small?: string };
};

export default function Client({ collectionId }: { collectionId: string }) {
  const supabase = React.useMemo(() => createBrowserSupabaseClient(), []);
  const [collection, setCollection] = React.useState<Collection | null>(null);
  const [items, setItems] = React.useState<Item[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // UI state
  const [filter, setFilter] = React.useState("");
  const [pending, setPending] = React.useState<Record<string, boolean>>({});
  const [addOpen, setAddOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [results, setResults] = React.useState<ScryfallCard[]>([]);
  const [addError, setAddError] = React.useState<string | null>(null);

  // Load collection + items
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: col, error: colErr } = await supabase
          .from("collections")
          .select("id,name")
          .eq("id", collectionId)
          .single();
        if (colErr) throw colErr;
        if (!alive) return;
        setCollection(col as Collection);

        const { data: it, error: itErr } = await supabase
          .from("collection_items")
          .select("id, card_name, qty, created_at")
          .eq("collection_id", collectionId)
          .order("card_name", { ascending: true });
        if (itErr) throw itErr;
        if (!alive) return;
        setItems((it ?? []) as Item[]);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Failed to load collection");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [collectionId, supabase]);

  // Derived
  const filtered = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i => i.card_name.toLowerCase().includes(q));
  }, [items, filter]);

  // Helpers
  const mark = (id: string, v: boolean) => setPending(p => ({ ...p, [id]: v }));

  const updateQty = async (row: Item, next: number) => {
    if (next < 0) next = 0;
    mark(row.id, true);
    try {
      const { error } = await supabase
        .from("collection_items")
        .update({ qty: next })
        .eq("id", row.id)
        .eq("collection_id", collectionId);
      if (error) throw error;
      setItems(prev => prev.map(it => it.id === row.id ? { ...it, qty: next } : it));
    } catch (e: any) {
      alert(e?.message ?? "Failed to update");
    } finally {
      mark(row.id, false);
    }
  };

  const removeRow = async (row: Item) => {
    if (!confirm(`Remove "${row.card_name}" from this collection?`)) return;
    mark(row.id, true);
    try {
      const { error } = await supabase
        .from("collection_items")
        .delete()
        .eq("id", row.id)
        .eq("collection_id", collectionId);
      if (error) throw error;
      setItems(prev => prev.filter(it => it.id !== row.id));
    } catch (e: any) {
      alert(e?.message ?? "Failed to delete");
    } finally {
      mark(row.id, false);
    }
  };

  const addCard = async (card: ScryfallCard) => {
    setAddError(null);
    try {
      const name = card.name.trim();
      const { data, error } = await supabase
        .from("collection_items")
        .insert({ collection_id: collectionId, card_name: name, qty: 1 })
        .select("id, card_name, qty, created_at")
        .single();
      if (error) throw error;
      setItems(prev => [...prev, data as Item].sort((a,b) => a.card_name.localeCompare(b.card_name)));
      setAddOpen(false);
      setSearch("");
      setResults([]);
    } catch (e: any) {
      setAddError(e?.message ?? "Failed to add card");
    }
  };

  // Scryfall search (debounced)
  React.useEffect(() => {
    let alive = true;
    const run = async () => {
      const q = search.trim();
      if (!q) { setResults([]); return; }
      try {
        setSearching(true);
        const r = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&unique=cards&include_extras=false&include_variations=false`);
        const js = await r.json();
        if (!alive) return;
        setResults(Array.isArray(js?.data) ? js.data.slice(0, 10) : []);
      } catch {
        if (!alive) return;
        setResults([]);
      } finally {
        if (alive) setSearching(false);
      }
    };
    const t = setTimeout(run, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [search]);

  // Render
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Collection</h1>
          <Link href="/collections" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-white/5">Back</Link>
        </div>
        <div className="h-10 w-full rounded bg-white/10 animate-pulse" />
        <div className="h-72 w-full rounded bg-white/10 animate-pulse" />
      </div>
    );
  }

  if (error || !collection) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Collection</h1>
          <Link href="/collections" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-white/5">Back</Link>
        </div>
        <div className="rounded border border-red-500/50 bg-red-900/30 text-red-200 px-3 py-2">
          {error ?? "Not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{collection.name}</h1>
          <div className="text-xs text-gray-500 break-all">ID: {collection.id}</div>
        </div>
        <Link href="/collections" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-white/5">
          Back to Collections
        </Link>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-2 md:items-center">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search in this collection…"
          className="flex-1 rounded-lg border border-white/20 bg-neutral-900 text-white px-3 py-2"
        />
        <button
          onClick={() => setAddOpen(v => !v)}
          className="rounded-lg border px-3 py-2 text-sm hover:bg-white/5"
        >
          {addOpen ? "Close add" : "Add cards"}
        </button>
      </div>

      {/* Add panel */}
      {addOpen && (
        <div className="rounded-lg border border-white/20 bg-neutral-900 p-4 space-y-3">
          <div className="flex gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Scryfall (e.g., Sol Ring)"
              className="flex-1 rounded-lg border border-white/20 bg-neutral-800 text-white px-3 py-2"
            />
            <button className="rounded-lg border px-3 py-2 text-sm hover:bg-white/5">
              {searching ? "Searching…" : "Search"}
            </button>
          </div>
          {addError && (
            <div className="rounded border border-red-500/50 bg-red-900/30 text-red-200 px-3 py-2 text-sm">
              {addError}
            </div>
          )}
          {results.length > 0 && (
            <ul className="divide-y divide-white/10 rounded-lg border border-white/10 overflow-hidden">
              {results.map(card => (
                <li key={card.id} className="flex items-center gap-3 p-2 hover:bg-white/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {card.image_uris?.small
                    ? <img src={card.image_uris.small} alt={card.name} className="h-10 w-7 rounded" />
                    : <div className="h-10 w-7 bg-white/10 rounded" />}
                  <div className="flex-1">
                    <div className="text-sm text-white">{card.name}</div>
                    {card.set_name && <div className="text-xs text-gray-400">{card.set_name}</div>}
                  </div>
                  <button
                    onClick={() => addCard(card)}
                    className="rounded border px-2 py-1 text-xs hover:bg-white/10"
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          )}
          {search && results.length === 0 && !searching && (
            <div className="text-sm text-gray-400">No results.</div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-gray-300">
            <tr>
              <th className="text-left px-3 py-2">Card</th>
              <th className="text-right px-3 py-2 w-36">Qty</th>
              <th className="text-right px-3 py-2 w-28">Actions</th>
            </tr>
          </thead>
          <tbody className="[&>tr:nth-child(odd)]:bg-white/5">
            {filtered.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2 text-white">{row.card_name}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      disabled={pending[row.id]}
                      onClick={() => updateQty(row, row.qty - 1)}
                      className="rounded border px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-50"
                      title="Decrease"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={row.qty}
                      onChange={(e) => {
                        const v = parseInt(e.target.value || "0", 10);
                        setItems(prev => prev.map(it => it.id === row.id ? { ...it, qty: v } : it));
                      }}
                      onBlur={(e) => {
                        const v = parseInt(e.target.value || "0", 10);
                        updateQty(row, isNaN(v) ? 0 : v);
                      }}
                      className="w-16 rounded border border-white/20 bg-neutral-900 text-white px-2 py-1 text-right"
                    />
                    <button
                      disabled={pending[row.id]}
                      onClick={() => updateQty(row, row.qty + 1)}
                      className="rounded border px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-50"
                      title="Increase"
                    >
                      +
                    </button>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end">
                    <button
                      disabled={pending[row.id]}
                      onClick={() => removeRow(row)}
                      className="rounded border border-red-500/60 px-2 py-1 text-xs text-red-200 hover:bg-red-900/30 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-gray-400">
                  No cards found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        Tip: card names should match the names used by the Cost-to-Finish API for best results.
      </p>
    </div>
  );
}
