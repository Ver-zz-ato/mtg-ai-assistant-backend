"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

type CostRow = {
  name: string;
  need: number;
  unit: number;
  subtotal: number;
  source?: string;
};

type CostResponse = {
  ok: boolean;
  error?: string;
  currency?: string;
  rows?: CostRow[];
  total?: number;
  usedOwned?: boolean;
  fx_date?: string;
  unpriced?: string[];
};

type CollectionRow = {
  id: string;
  name: string | null;
};

const BACKEND_UI_ROUTE = "/api/collections/cost-to-finish";
const LS_KEY = "mtgcoach_cost_collectionId";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function formatCurrency(amount: number, currency: string | undefined) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency ?? "$"} ${amount.toFixed(2)}`;
  }
}

function buildCsv(rows: Array<Record<string, string | number>>, headers: string[]) {
  const line = (cells: (string | number)[]) =>
    cells
      .map((c) => {
        const s = String(c ?? "");
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      })
      .join(",");
  return [headers.join(","), ...rows.map((r) => line(headers.map((h) => r[h] ?? "")))]
    .join("\n");
}

function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

async function loggedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const start = performance.now();
  const res = await fetch(input, init);
  const ms = Math.round(performance.now() - start);
  console.log(`[cost-to-finish] ${typeof input === "string" ? input : (input as URL).toString()} -> ${res.status} in ${ms}ms`);
  return res;
}

export default function Client() {
  const router = useRouter();
  const params = useSearchParams();

  // inputs
  const [deckText, setDeckText] = React.useState<string>("");
  const [deckId, setDeckId] = React.useState<string>("");
  const [collectionId, setCollectionId] = React.useState<string | null>(null);
  const [currency, setCurrency] = React.useState<string>("USD");
  const [useOwned, setUseOwned] = React.useState<boolean>(false);

  // collections (optional)
  const [collections, setCollections] = React.useState<CollectionRow[] | null>(null);
  const [collectionsErr, setCollectionsErr] = React.useState<string | null>(null);

  // results
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [resp, setResp] = React.useState<CostResponse | null>(null);

  // hydrate from query + localStorage
  React.useEffect(() => {
    const qDeck = params.get("deck");
    const qCollection = params.get("collection");
    const lsCollection = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null;

    if (qDeck) setDeckId(qDeck);
    if (qCollection) {
      setCollectionId(qCollection);
      setUseOwned(true);
    } else if (lsCollection) {
      setCollectionId(lsCollection);
      setUseOwned(true);
      const newParams = new URLSearchParams(params.toString());
      newParams.set("collection", lsCollection);
      router.replace(`?${newParams.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Try to load user's collections (if the table exists)
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("collections")
          .select("id,name")
          .order("name", { ascending: true });

        if (!alive) return;

        if (error) {
          // If the table doesn't exist yet, that's fine—fallback to manual input.
          setCollectionsErr("No collections table found (fallback to manual ID).");
          setCollections(null);
        } else {
          setCollections((data ?? []) as CollectionRow[]);
        }
      } catch {
        if (!alive) return;
        setCollectionsErr("Could not load collections (fallback to manual ID).");
        setCollections(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // sync URL + localStorage with collection selection
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const newParams = new URLSearchParams(params.toString());
    if (collectionId) {
      localStorage.setItem(LS_KEY, collectionId);
      newParams.set("collection", collectionId);
      router.replace(`?${newParams.toString()}`);
    } else {
      localStorage.removeItem(LS_KEY);
      newParams.delete("collection");
      router.replace(newParams.toString() ? `?${newParams.toString()}` : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId]);

  async function run() {
    setLoading(true);
    setError(null);
    setResp(null);

    if (!deckText.trim() && !deckId.trim()) {
      setLoading(false);
      setError("Please paste deck text or provide a deck id in the URL.");
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

      const json = (await r.json()) as CostResponse;

      if (!r.ok || !json.ok) {
        setError(json.error ?? `Upstream error (${r.status})`);
        setResp(null);
      } else {
        setResp(json);
      }
    } catch (e: any) {
      setError(e?.message ?? "Unexpected error");
      setResp(null);
    } finally {
      setLoading(false);
    }
  }

  function onExportCSV() {
    if (!resp?.rows?.length) return;
    const data = resp.rows.map((r) => ({
      name: String(r.name ?? ""),
      need: r.need ?? 0,
      unit: r.unit ?? 0,
      subtotal: r.subtotal ?? 0,
      source: r.source ?? "",
    }));
    const csv = buildCsv(data, ["name", "need", "unit", "subtotal", "source"]);
    const fname = `cost_to_finish_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCSV(fname, csv);
  }

  const totalFmt =
    resp && resp.total != null ? formatCurrency(resp.total, resp.currency) : null;

  const usingOwnedBanner =
    useOwned && collectionId ? (
      <div className="sticky top-0 z-10 mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm">
            Subtracting cards you already own from{" "}
            <span className="font-medium">
              {collections?.find((c) => c.id === collectionId)?.name ?? `collection ${collectionId}`}
            </span>
            . Only missing copies are priced.
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setUseOwned(false)}
              className="rounded-md border border-white/20 px-2 py-1 text-xs hover:bg-white/10"
            >
              Disable
            </button>
            <button
              onClick={() => {
                const el = document.getElementById("collectionId");
                if (el) (el as HTMLSelectElement).focus();
              }}
              className="rounded-md border border-white/20 px-2 py-1 text-xs hover:bg-white/10"
            >
              Change
            </button>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <div className="space-y-6">
      {/* Inputs */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm text-gray-400">Deck text</label>
          <textarea
            value={deckText}
            onChange={(e) => setDeckText(e.target.value)}
            placeholder={`1 Sol Ring
1 Arcane Signet
1 Swamp`}
            className="h-40 w-full resize-y rounded-lg border border-white/10 bg-white/5 p-3 font-mono text-sm outline-none placeholder:text-gray-500"
          />
          <p className="text-xs text-gray-500">
            Or deep-link a public deck with{" "}
            <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px]">
              ?deck=&lt;id&gt;
            </span>{" "}
            in the URL.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-gray-400">Options</label>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <input
                  id="useOwned"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={useOwned}
                  onChange={(e) => setUseOwned(e.target.checked)}
                />
                <label htmlFor="useOwned" className="text-sm">
                  Subtract cards I already own
                </label>
              </div>
              <p className="text-xs text-gray-500">
                Pick your collection. We’ll price only the copies you still need to buy.
              </p>
            </div>

            {/* Dropdown if we have collections; otherwise text input fallback */}
            {collections && collections.length > 0 ? (
              <div className="flex items-center gap-2">
                <label htmlFor="collectionId" className="w-32 text-sm text-gray-400">
                  Collection
                </label>
                <select
                  id="collectionId"
                  className="flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none"
                  value={collectionId ?? ""}
                  onChange={(e) => setCollectionId(e.target.value || null)}
                  disabled={!useOwned}
                >
                  <option value="">— Select —</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name ?? c.id}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <label htmlFor="collectionId" className="w-32 text-sm text-gray-400">
                  Collection ID
                </label>
                <input
                  id="collectionId"
                  type="text"
                  value={collectionId ?? ""}
                  onChange={(e) => setCollectionId(e.target.value ? e.target.value : null)}
                  placeholder="paste your collection id"
                  className="flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none placeholder:text-gray-500"
                  disabled={!useOwned}
                />
              </div>
            )}

            {collectionsErr ? (
              <div className="text-xs text-amber-400">{collectionsErr}</div>
            ) : null}

            <div className="flex items-center gap-2">
              <label htmlFor="currency" className="w-32 text-sm text-gray-400">
                Currency
              </label>
              <select
                id="currency"
                className="flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none"
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
                onClick={run}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-60"
              >
                {loading ? "Calculating…" : "Compute cost"}
              </button>
            </div>

            {error ? (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {usingOwnedBanner}

      {/* Results */}
      <section className="space-y-3">
        {!resp && !loading ? (
          <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-gray-300">
            Paste a deck or open a shared deck and click <span className="font-semibold">Compute cost</span>.
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
                    <td className="tabular-nums">{formatCurrency(r.unit, resp.currency)}</td>
                    <td className="tabular-nums font-semibold">{formatCurrency(r.subtotal, resp.currency)}</td>
                    <td className="text-xs text-gray-400">{r.source ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-black/60 backdrop-blur">
                <tr className="[&>td]:px-3 [&>td]:py-2">
                  <td className="text-right font-semibold" colSpan={3}>
                    Total
                  </td>
                  <td className="tabular-nums font-bold">{totalFmt}</td>
                  <td className="text-xs text-gray-400">{resp.fx_date ? `FX: ${resp.fx_date}` : ""}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : null}

        {resp?.ok && (!resp.rows || resp.rows.length === 0) && !loading ? (
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="text-sm">
              No purchasable items detected. If you subtracted owned, you might already have everything. 🎉
            </div>
          </div>
        ) : null}

        {resp?.unpriced && resp.unpriced.length > 0 ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <div className="text-sm font-medium">Unpriced cards</div>
            <ul className="mt-1 list-disc pl-5 text-sm text-amber-100">
              {resp.unpriced.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {resp?.rows && resp.rows.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onExportCSV}
              className="rounded-lg border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10"
            >
              Export CSV
            </button>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="rounded-lg border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10"
            >
              Back to top
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
