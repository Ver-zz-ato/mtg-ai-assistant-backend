// frontend/app/collections/cost-to-finish/Client.tsx
"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

type CostRowIn = { name?: string; card?: string; need: number; unit: number; subtotal: number; source?: string };
type CostRow = { name: string; need: number; unit: number; subtotal: number; source?: string };
type CostResponseIn = {
  ok: boolean; error?: string; currency?: string;
  rows?: CostRowIn[]; total?: number; usedOwned?: boolean; fx_date?: string; unpriced?: string[];
};

type DeckRow = { id: string; title: string | null };
type DeckWithText = { id: string; title: string | null; deck_text: string | null };
type CollectionRow = { id: string; name: string | null };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BACKEND_UI_ROUTE = "/api/collections/cost-to-finish";
const LS_KEY_COLLECTION = "mtgcoach_cost_collectionId";

function fmtMoney(x: number, c?: string) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: c || "USD", maximumFractionDigits: 2 }).format(x); }
  catch { return `${c ?? "$"} ${x.toFixed(2)}`; }
}

function toCSV(headers: string[], rows: Array<Record<string, string | number>>) {
  const esc = (s: string | number) => {
    const t = String(s ?? "");
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [headers.join(","), ...rows.map(r => headers.map(h => esc(r[h] ?? "")).join(","))].join("\n");
}

async function loggedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const t0 = performance.now();
  const res = await fetch(input, init);
  // eslint-disable-next-line no-console
  console.log(`[cost-to-finish] ${typeof input === "string" ? input : (input as URL).toString()} -> ${res.status} in ${Math.round(performance.now()-t0)}ms`);
  return res;
}

export default function Client() {
  const router = useRouter();
  const params = useSearchParams();

  // Inputs
  const [deckText, setDeckText] = React.useState("");
  const [deckId, setDeckId] = React.useState("");
  const [currency, setCurrency] = React.useState("USD");
  const [useOwned, setUseOwned] = React.useState(false);
  const [collectionId, setCollectionId] = React.useState<string | null>(null);

  // Lists
  const [decks, setDecks] = React.useState<DeckRow[] | null>(null);
  const [collections, setCollections] = React.useState<CollectionRow[] | null>(null);
  const [collectionsErr, setCollectionsErr] = React.useState<string | null>(null);

  // Results
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [resp, setResp] = React.useState<{
    ok: boolean; error?: string; currency?: string;
    rows?: CostRow[]; total?: number; usedOwned?: boolean; fx_date?: string; unpriced?: string[];
  } | null>(null);

  // Track whether run() was manual or autorun, so we can suppress noisy errors
  const lastTrigger = React.useRef<"idle" | "manual" | "autorun">("idle");

  // Hydrate from URL + localStorage
  React.useEffect(() => {
    const qDeck = params.get("deck");
    const qCollection = params.get("collection");
    const lsCollection = typeof window !== "undefined" ? localStorage.getItem(LS_KEY_COLLECTION) : null;

    if (qDeck) setDeckId(qDeck);
    if (qCollection) { setCollectionId(qCollection); setUseOwned(true); }
    else if (lsCollection) {
      setCollectionId(lsCollection); setUseOwned(true);
      const np = new URLSearchParams(params.toString()); np.set("collection", lsCollection);
      router.replace(`?${np.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load user's decks (for selector)
  React.useEffect(() => {
    let ok = true;
    (async () => {
      const { data, error } = await supabase
        .from("decks")
        .select("id,title")
        .order("created_at", { ascending: false })
        .limit(100);
      if (!ok) return;
      if (!error) setDecks((data ?? []) as DeckRow[]);
    })();
    return () => { ok = false; };
  }, []);

  // When deckId changes, fetch its deck_text to show in textarea
  React.useEffect(() => {
    if (!deckId) return;
    let ok = true;
    (async () => {
      const { data, error } = await supabase
        .from("decks")
        .select("id,title,deck_text")
        .eq("id", deckId)
        .maybeSingle<DeckWithText>();
      if (!ok) return;
      if (!error && data?.deck_text != null) setDeckText(data.deck_text);
      // Debounced autorun to avoid race with deck_text fetch
      lastTrigger.current = "autorun";
      setTimeout(() => { if (ok) void run(); }, 50);
    })();
    return () => { ok = false; };
  }, [deckId]);

  // Load collections if table exists
  React.useEffect(() => {
    let ok = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("collections")
          .select("id,name")
          .order("name", { ascending: true });
        if (!ok) return;
        if (error) { setCollectionsErr("No collections table yet (manual ID for now)."); setCollections(null); }
        else setCollections((data ?? []) as CollectionRow[]);
      } catch { if (ok) { setCollectionsErr("Could not load collections (manual ID fallback)."); setCollections(null); } }
    })();
    return () => { ok = false; };
  }, []);

  // Keep collection in URL + localStorage
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const np = new URLSearchParams(params.toString());
    if (collectionId) { localStorage.setItem(LS_KEY_COLLECTION, collectionId); np.set("collection", collectionId); }
    else { localStorage.removeItem(LS_KEY_COLLECTION); np.delete("collection"); }
    router.replace(np.toString() ? `?${np.toString()}` : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId]);

  async function run(manual = false) {
    lastTrigger.current = manual ? "manual" : lastTrigger.current === "idle" ? "autorun" : lastTrigger.current;
    setLoading(true); setError(null); setResp(null);

    if (!deckText.trim() && !deckId.trim()) {
      setLoading(false);
      // Only show this error if the user clicked the button
      if (manual) setError("Please paste deck text or choose a deck.");
      return;
    }

    const payload = {
      deckText: deckText.trim() || undefined,
      deckId: deckId.trim() || undefined,
      collectionId: collectionId || undefined,
      useOwned: useOwned && !!collectionId,
      currency,
    };

    try {
      const r = await loggedFetch(BACKEND_UI_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      const json = (await r.json()) as CostResponseIn;

      if (!r.ok || !json.ok) {
        // Suppress the “missing deck” error if this was autorun noise
        const msg = json.error ?? `Upstream error (${r.status})`;
        if (lastTrigger.current === "autorun" && /Missing.*deck_text/i.test(msg)) {
          setError(null);
        } else {
          setError(msg);
        }
        setResp(null);
      } else {
        // Normalize rows and clear any stale error
        const rows: CostRow[] = (json.rows ?? []).map((row) => ({
          name: (row.name ?? row.card ?? "").toString(),
          need: Number(row.need ?? 0),
          unit: Number(row.unit ?? 0),
          subtotal: Number(row.subtotal ?? 0),
          source: row.source,
        }));
        setError(null);
        setResp({ ...json, rows });
      }
    } catch (e: any) {
      if (lastTrigger.current === "autorun") {
        // Silent on autorun; show only on manual
        setError(null);
      } else {
        setError(e?.message ?? "Unexpected error");
      }
      setResp(null);
    } finally {
      setLoading(false);
    }
  }

  function onExportCSV() {
    if (!resp?.rows?.length) return;
    const rows = resp.rows.map(r => ({
      name: r.name, need: r.need, unit: r.unit, subtotal: r.subtotal, source: r.source ?? ""
    }));
    const csv = toCSV(["name","need","unit","subtotal","source"], rows);
    const fname = `cost_to_finish_${new Date().toISOString().slice(0,10)}.csv`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = fname; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 400);
  }

  const totalFmt = resp?.total != null ? fmtMoney(resp.total, resp.currency) : null;

  return (
    <div className="space-y-6">
      {/* Inputs */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm text-gray-400">Choose one of your decks</label>
            <select
              className="w-full rounded-md border border-white/10 bg-white text-black px-2 py-1.5 text-sm outline-none"
              value={deckId}
              onChange={(e) => setDeckId(e.target.value)}
            >
              <option value="">— None (paste below) —</option>
              {(decks ?? []).map(d => (
                <option key={d.id} value={d.id}>{d.title ?? d.id}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500">Picking a deck will auto-run the calculator.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-gray-400">Deck text</label>
            <textarea
              value={deckText}
              onChange={(e) => setDeckText(e.target.value)}
              placeholder={`1 Sol Ring\n1 Arcane Signet\n1 Swamp`}
              className="h-40 w-full resize-y rounded-lg border border-white/10 bg-white/5 p-3 font-mono text-sm outline-none placeholder:text-gray-500"
            />
            <p className="text-xs text-gray-500">
              Or deep-link a public deck with <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px]">?deck=&lt;id&gt;</span> in the URL.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-gray-400">Options</label>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-3">
            {/* Collection dropdown moved to the top */}
            <div className="flex items-center gap-2">
              <label htmlFor="collectionIdSelect" className="w-32 text-sm text-gray-400">Collection</label>
              {collections && collections.length > 0 ? (
                <select
                  id="collectionIdSelect"
                  className="flex-1 rounded-md border border-white/10 bg-white text-black px-2 py-1.5 text-sm outline-none"
                  value={collectionId ?? ""}
                  onChange={(e) => { setCollectionId(e.target.value || null); setUseOwned(!!e.target.value); }}
                >
                  <option value="">— None —</option>
                  {collections.map(c => (<option key={c.id} value={c.id}>{c.name ?? c.id}</option>))}
                </select>
              ) : (
                <input
                  id="collectionIdSelect"
                  type="text"
                  value={collectionId ?? ""}
                  onChange={(e) => { setCollectionId(e.target.value ? e.target.value : null); setUseOwned(!!e.target.value); }}
                  placeholder="paste your collection id"
                  className="flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none placeholder:text-gray-500"
                />
              )}
            </div>
            {collectionsErr ? <div className="text-xs text-amber-400">{collectionsErr}</div> : null}

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <input id="useOwned" type="checkbox" className="h-4 w-4" checked={useOwned} onChange={(e) => setUseOwned(e.target.checked)} />
                <label htmlFor="useOwned" className="text-sm">Subtract cards I already own</label>
              </div>
              <p className="text-xs text-gray-500">We’ll price only the copies you still need to buy.</p>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="currency" className="w-32 text-sm text-gray-400">Currency</label>
              <select
                id="currency"
                className="flex-1 rounded-md border border-white/10 bg-white text-black px-2 py-1.5 text-sm outline-none"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="EUR">EUR</option>
              </select>
            </div>

            <div className="pt-2">
              <button
                onClick={() => run(true)}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-60"
              >
                {loading ? "Calculating…" : "Compute cost"}
              </button>
            </div>

            {/* show error only when we don't already have results */}
            {error && !resp ? (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* Using-owned banner */}
      {useOwned && collectionId ? (
        <div className="sticky top-0 z-10 mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 backdrop-blur">
          <div className="text-sm">
            Subtracting cards you already own from <span className="font-medium">
              {collections?.find(c => c.id === collectionId)?.name ?? `collection ${collectionId}`}
            </span>. Only missing copies are priced.
          </div>
        </div>
      ) : null}

      {/* Results */}
      <section className="space-y-3">
        {!resp && !loading ? (
          <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-gray-300">
            Paste a deck, choose one above, or open a shared deck — then click <span className="font-semibold">Compute cost</span>.
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-2">
            <div className="h-8 w-48 animate-pulse rounded bg-white/10" />
            <div className="h-10 w-full animate-pulse rounded bg-white/10" />
            <div className="h-10 w-full animate-pulse rounded bg-white/10" />
            <div className="h-10 w-full animate-pulse rounded bg-white/10" />
          </div>
        ) : null}

        {resp?.ok && resp.rows && resp.rows.length > 0 ? (
          <div className="relative overflow-auto rounded-lg border border-white/10">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-black/60 backdrop-blur">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left">
                  <th className="w-1/2">Card</th>
                  <th className="w-20">Need</th>
                  <th className="w-32">Unit</th>
                  <th className="w-36">Subtotal</th>
                  <th className="w-40">Source</th>
                </tr>
              </thead>
              <tbody>
                {resp.rows.map((r, i) => (
                  <tr key={`${r.name}-${i}`} className="odd:bg-white/[0.03] [&>td]:px-3 [&>td]:py-2">
                    <td className="font-medium">{r.name}</td>
                    <td className="tabular-nums">{r.need}</td>
                    <td className="tabular-nums">{fmtMoney(r.unit, resp.currency)}</td>
                    <td className="tabular-nums font-semibold">{fmtMoney(r.subtotal, resp.currency)}</td>
                    <td className="text-xs text-gray-400">{r.source ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-black/60 backdrop-blur">
                <tr className="[&>td]:px-3 [&>td]:py-2">
                  <td className="text-right font-semibold" colSpan={3}>Total</td>
                  <td className="tabular-nums font-bold">{totalFmt}</td>
                  <td className="text-xs text-gray-400">{resp.fx_date ? `FX: ${resp.fx_date}` : ""}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : null}

        {resp?.ok && (!resp.rows || resp.rows.length === 0) && !loading ? (
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="text-sm">No purchasable items detected. If you subtracted owned, you might already have everything. 🎉</div>
          </div>
        ) : null}

        {resp?.unpriced && resp.unpriced.length > 0 ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <div className="text-sm font-medium">Unpriced cards</div>
            <ul className="mt-1 list-disc pl-5 text-sm text-amber-100">
              {resp.unpriced.map((n) => (<li key={n}>{n}</li>))}
            </ul>
          </div>
        ) : null}

        {resp?.rows && resp.rows.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <button onClick={onExportCSV} className="rounded-lg border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10">
              Export CSV
            </button>
            <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="rounded-lg border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10">
              Back to top
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
