"use client";

import * as React from "react";
import { capture } from "@/lib/ph";

import { useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Deck = { id: string; title: string; deck_text?: string | null };
type Collection = { id: string; name: string };

type ResultRow = {
  card: string;
  need: number;
  unit: number;
  subtotal: number;
  source?: string | null;
};

export default function CostToFinishClient() {
  React.useEffect(() => { try { capture('cost_to_finish_opened'); } catch {} }, []);
  const params = useSearchParams();
  const initialDeckId = params.get("deck") || "";

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [decks, setDecks] = React.useState<Deck[]>([]);
  const [collections, setCollections] = React.useState<Collection[]>([]);

  const [deckId, setDeckId] = React.useState(initialDeckId);
  const [deckText, setDeckText] = React.useState("");
  const [currency, setCurrency] = React.useState<"USD" | "GBP">("USD");
  const [useOwned, setUseOwned] = React.useState(false);
  const [collectionId, setCollectionId] = React.useState<string>("");

  const [rows, setRows] = React.useState<ResultRow[]>([]);
  const [total, setTotal] = React.useState<number | null>(null);
  const [pricesAt, setPricesAt] = React.useState<string | null>(null);

  // Load decks & collections for the signed-in user
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = createBrowserSupabaseClient();
        const { data: userRes } = await sb.auth.getUser();
        const uid = userRes?.user?.id;
        if (!uid) return;

        // Decks
        const { data: deckData } = await sb
          .from("decks")
          .select("id, title")
          .eq("user_id", uid)
          .order("created_at", { ascending: false });

        if (alive) setDecks(deckData as Deck[] ?? []);

        // Collections
        const { data: colData } = await sb
          .from("collections")
          .select("id, name")
          .eq("user_id", uid)
          .order("name", { ascending: true });

        if (alive) setCollections(colData as Collection[] ?? []);
      } catch (e) {
        /* ignore */
      }
    })();
    return () => { alive = false; };
  }, []);

  // When a deck is chosen, fetch its text and paste it into the box
  React.useEffect(() => {
    let alive = true;
    (async () => {
      if (!deckId) return;
      try {
        const sb = createBrowserSupabaseClient();
        const { data, error } = await sb
          .from("decks")
          .select("deck_text")
          .eq("id", deckId)
          .single();
        if (!alive) return;
        if (!error && data?.deck_text) setDeckText(String(data.deck_text));
      } catch { /* noop */ }
    })();
    return () => { alive = false; };
  }, [deckId]);

  async function onCompute() {
    try {
      setBusy(true);
      setError(null);
      setRows([]);
      setTotal(null);

      const payload: any = {
        deckId: deckId || undefined,
        deckText: deckText || undefined,
        currency,
        useOwned,
      };
      if (useOwned && collectionId) payload.collectionId = collectionId;

      const res = await fetch("/api/collections/cost-to-finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await res.json();
      if (!res.ok || !j?.ok) {
        throw new Error(j?.error || res.statusText);
      }
      setRows(j.rows ?? []);
      setTotal(typeof j.total === "number" ? j.total : null);
      setPricesAt(j.prices_updated_at || null);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold">Cost to Finish</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: deck pick + text */}
        <div className="space-y-3">
          <label className="block text-sm opacity-80">Choose one of your decks</label>
          <select
            className="w-full rounded-md border bg-black/20 px-3 py-2"
            value={deckId}
            onChange={(e) => setDeckId(e.target.value)}
          >
            <option value="">— None (paste below) —</option>
            {decks.map(d => (
              <option key={d.id} value={d.id}>{d.title}</option>
            ))}
          </select>

          <label className="block text-sm opacity-80">Deck text</label>
          <textarea
            className="w-full h-48 rounded-md border bg-black/20 px-3 py-2 font-mono text-sm"
            value={deckText}
            onChange={(e) => setDeckText(e.target.value)}
            placeholder="Paste a deck list here..."
          />
          <p className="text-xs opacity-70">
            Or deep-link a public deck with <code>?deck=&lt;id&gt;</code> in the URL.
          </p>
        </div>

        {/* Right: options */}
        <div className="space-y-3">
          <div>
            <label className="block text-sm opacity-80">Collection</label>
            <div className="flex items-center gap-2">
              <select
                className="w-full rounded-md border bg-black/20 px-3 py-2"
                value={collectionId}
                disabled={!useOwned}
                onChange={(e) => setCollectionId(e.target.value)}
              >
                <option value="">— None —</option>
                {collections.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <label className="mt-2 inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useOwned}
                onChange={(e) => setUseOwned(e.target.checked)}
              />
              Subtract cards I already own
            </label>
            <p className="text-xs opacity-70">
              We’ll price only the copies you still need to buy.
            </p>
          </div>

          <div>
            <label className="block text-sm opacity-80">Currency</label>
            <select
              className="w-full rounded-md border bg-black/20 px-3 py-2"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as "USD" | "GBP")}
            >
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
            </select>
          </div>

          <button
            onClick={onCompute}
            disabled={busy}
            className={`w-full rounded-md px-4 py-2 text-black ${busy ? "bg-gray-300" : "bg-white hover:bg-gray-100"}`}
          >
            {busy ? "Computing…" : "Compute cost"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm">
          {error}
        </div>
      )}

      {rows.length > 0 && (
        <>
        <div className="flex items-center justify-between text-xs text-gray-400">
          <div>
            {pricesAt ? (
              <>Prices cached {Math.max(0, Math.floor((Date.now() - new Date(pricesAt).getTime())/3600000))}h ago</>
            ) : (
              <>Live pricing</>
            )}
          </div>
          <button
            onClick={() => {
              const list = rows.map(r => `× ${r.need} ${r.card}`).join('\n');
              navigator.clipboard?.writeText?.(list);
              try { capture('shopping_list_copied', { count: rows.length }); } catch {}
            }}
            className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
          >Copy shopping list</button>
        </div>
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-black/30">
              <tr className="border-b">
                <th className="text-left py-2 px-3">Card</th>
                <th className="text-right py-2 px-3">Need</th>
                <th className="text-right py-2 px-3">Unit</th>
                <th className="text-right py-2 px-3">Subtotal</th>
                <th className="text-left py-2 px-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.card}-${i}`} className="border-b">
                  <td className="py-1 px-3">{r.card}</td>
                  <td className="py-1 px-3 text-right">{r.need}</td>
                  <td className="py-1 px-3 text-right">
                    {new Intl.NumberFormat(undefined, { style: "currency", currency }).format(r.unit)}
                  </td>
                  <td className="py-1 px-3 text-right">
                    {new Intl.NumberFormat(undefined, { style: "currency", currency }).format(r.subtotal)}
                  </td>
                  <td className="py-1 px-3">{r.source ?? "—"}</td>
                </tr>
              ))}
              <tr>
                <td className="py-2 px-3 font-medium" colSpan={3}>Total</td>
                <td className="py-2 px-3 text-right font-medium">
                  {new Intl.NumberFormat(undefined, { style: "currency", currency }).format(total ?? 0)}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
