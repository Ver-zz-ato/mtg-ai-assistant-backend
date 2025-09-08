"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Deck = { id: string; title: string | null };
type Coll = { id: string; name: string | null };
type CostRow = { card: string; need: number; unit: number; subtotal: number };

export default function Client() {
  const supabase = React.useMemo(() => createBrowserSupabaseClient(), []);
  const search = useSearchParams();
  const router = useRouter();

  const [decks, setDecks] = React.useState<Deck[]>([]);
  const [collections, setCollections] = React.useState<Coll[]>([]);

  const [deckId, setDeckId] = React.useState<string | "">("");
  const [deckText, setDeckText] = React.useState("");
  const [currency, setCurrency] = React.useState<"USD" | "GBP">("USD");

  const [useOwned, setUseOwned] = React.useState(false);
  const [collectionId, setCollectionId] = React.useState<string | "">("");

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<CostRow[]>([]);
  const [total, setTotal] = React.useState<number>(0);

  // load decks & collections
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const { data: d } = await supabase
        .from("decks")
        .select("id,title")
        .order("created_at", { ascending: false })
        .limit(100);
      if (alive) setDecks(d ?? []);

      const { data: c } = await supabase
        .from("collections")
        .select("id,name")
        .order("name", { ascending: true })
        .limit(100);
      if (alive) setCollections(c ?? []);
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  // deep link (?deck=...) -> select that deck, fetch its text to textarea
  React.useEffect(() => {
    const qDeck = search.get("deck");
    if (!qDeck) return;
    setDeckId(qDeck);

    (async () => {
      const { data, error } = await supabase
        .from("decks")
        .select("deck_text")
        .eq("id", qDeck)
        .single();
      if (!error && data?.deck_text) setDeckText(String(data.deck_text));
    })();
  }, [search, supabase]);

  async function onPickDeck(id: string) {
    setDeckId(id);
    setError(null);
    setRows([]);
    setTotal(0);

    if (!id) return;

    const { data, error } = await supabase
      .from("decks")
      .select("deck_text")
      .eq("id", id)
      .single();
    if (!error && data?.deck_text) setDeckText(String(data.deck_text));

    // reflect in the URL a bit (nice UX)
    const u = new URL(window.location.href);
    u.searchParams.set("deck", id);
    router.replace(u.pathname + "?" + u.searchParams.toString());
  }

  async function compute() {
    try {
      setBusy(true);
      setError(null);
      setRows([]);
      setTotal(0);

      const payload: any = {
        currency,
        useOwned,
      };

      if (deckId) payload.deckId = deckId;
      if (deckText.trim()) payload.deckText = deckText.trim();
      if (useOwned && collectionId) payload.collectionId = collectionId;

      const r = await fetch("/api/collections/cost-to-finish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json();
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || r.statusText || "Cost failed");
      }

      setRows(j.rows ?? []);
      setTotal(Number(j.total ?? 0));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  // auto-run when a deck is chosen (handy)
  React.useEffect(() => {
    if (deckId) compute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: deck text */}
      <div className="space-y-3">
        <label className="block text-sm font-medium">Choose one of your decks</label>
        <select
          className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
          value={deckId}
          onChange={(e) => onPickDeck(e.target.value)}
        >
          <option value="">— None (paste below) —</option>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title || d.id.slice(0, 8)}
            </option>
          ))}
        </select>

        <label className="block text-sm font-medium mt-4">Deck text</label>
        <textarea
          className="h-56 w-full rounded-md border bg-transparent px-3 py-2 text-sm font-mono"
          value={deckText}
          onChange={(e) => setDeckText(e.target.value)}
          placeholder="1 Sol Ring&#10;1 Arcane Signet&#10;1 Swamp"
        />
      </div>

      {/* Right: options & results */}
      <div className="space-y-4">
        <div className="rounded-lg border p-3 space-y-3">
          <div className="space-y-2">
            <label className="block text-sm font-medium">Collection</label>
            <div className="flex items-center gap-2">
              <select
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                value={collectionId}
                onChange={(e) => setCollectionId(e.target.value)}
                disabled={!useOwned}
              >
                <option value="">— None —</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useOwned}
              onChange={(e) => setUseOwned(e.target.checked)}
            />
            Subtract cards I already own
          </label>

          <div className="space-y-2">
            <label className="block text-sm font-medium">Currency</label>
            <select
              className="w-40 rounded-md border bg-transparent px-3 py-2 text-sm"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as any)}
            >
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
            </select>
          </div>

          <button
            onClick={compute}
            disabled={busy}
            className="rounded-md bg-white/10 hover:bg-white/20 px-3 py-1.5 text-sm disabled:opacity-60"
          >
            {busy ? "Computing…" : "Compute cost"}
          </button>

          {error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs mt-2">
              {error}
            </div>
          )}
        </div>

        {rows.length > 0 && (
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b bg-black/20">
                <tr>
                  <th className="text-left py-2 px-3">Card</th>
                  <th className="text-right py-2 px-3">Need</th>
                  <th className="text-right py-2 px-3">Unit</th>
                  <th className="text-right py-2 px-3">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.card}-${i}`} className="border-b">
                    <td className="py-1.5 px-3">{r.card}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums">{r.need}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums">
                      {currency === "USD" ? `US$${r.unit.toFixed(2)}` : `£${r.unit.toFixed(2)}`}
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums">
                      {currency === "USD" ? `US$${r.subtotal.toFixed(2)}` : `£${r.subtotal.toFixed(2)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t">
                  <td className="py-2 px-3 font-medium">Total</td>
                  <td />
                  <td />
                  <td className="py-2 px-3 text-right font-medium tabular-nums">
                    {currency === "USD" ? `US$${total.toFixed(2)}` : `£${total.toFixed(2)}`}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
