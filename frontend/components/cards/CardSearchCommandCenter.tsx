"use client";

import React from "react";
import { BarChart3, BookmarkPlus, ExternalLink, Loader2, Search, ShieldPlus, Sparkles } from "lucide-react";
import WebsiteCardDetailModal, { scryfallCardSearchUrl } from "@/components/cards/WebsiteCardDetailModal";

type CardSearchResult = {
  name: string;
  type_line?: string;
  mana_cost?: string | null;
  set?: string;
  set_name?: string;
  image?: string | null;
  prices?: {
    usd?: string | null;
    eur?: string | null;
  };
};

type SearchMode = "name" | "natural";

function priceLabel(result: CardSearchResult): string | null {
  const usd = Number(result.prices?.usd || 0);
  if (Number.isFinite(usd) && usd > 0) return `$${usd.toFixed(2)}`;
  return null;
}

async function toast(message: string, type: "success" | "error" | "info" = "info") {
  try {
    const mod = await import("@/lib/toast-client");
    mod.toast(message, type);
  } catch {
    if (type === "error") alert(message);
  }
}

export default function CardSearchCommandCenter() {
  const [mode, setMode] = React.useState<SearchMode>("name");
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<CardSearchResult[]>([]);
  const [translatedQuery, setTranslatedQuery] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<CardSearchResult | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function runSearch(event?: React.FormEvent) {
    event?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    setTranslatedQuery(null);
    try {
      const path =
        mode === "natural"
          ? `/api/search/scryfall-nl?q=${encodeURIComponent(q)}`
          : `/api/cards/search?q=${encodeURIComponent(q)}`;
      const response = await fetch(path, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.ok === false) throw new Error(json?.error || "Search failed");
      const rows = mode === "natural" ? json.results : json.cards;
      setTranslatedQuery(mode === "natural" ? String(json.scryfall_query || "") : null);
      setResults(Array.isArray(rows) ? rows.slice(0, 12) : []);
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  async function addToWishlist(name: string) {
    try {
      const response = await fetch("/api/wishlists/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ names: [name], qty: 1 }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.ok === false) {
        if (response.status === 401) {
          await toast("Sign in to add cards to your wishlist.", "info");
          return;
        }
        throw new Error(json?.error || "Wishlist add failed");
      }
      await toast(`${name} added to wishlist.`, "success");
    } catch (err) {
      await toast(err instanceof Error ? err.message : "Wishlist add failed", "error");
    }
  }

  async function addToWatchlist(name: string) {
    try {
      const response = await fetch("/api/watchlist/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.ok === false) {
        if (response.status === 401) {
          await toast("Sign in to track price targets.", "info");
          return;
        }
        if (response.status === 403 || json?.error === "pro_required") {
          await toast("Price watchlist is a Pro feature.", "info");
          return;
        }
        throw new Error(json?.error || "Watchlist add failed");
      }
      await toast(`${name} added to watchlist.`, "success");
    } catch (err) {
      await toast(err instanceof Error ? err.message : "Watchlist add failed", "error");
    }
  }

  return (
    <section className="rounded-xl border border-amber-300/20 bg-neutral-950/80 p-4 shadow-xl shadow-black/20 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-amber-300">Card command center</p>
          <h2 className="mt-2 text-2xl font-bold text-white">Search cards, then act on them</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            Find cards by name or plain-English filters, open the ManaTap detail modal, track prices, or add cards to your wishlist.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-white/10 bg-black/30 p-1">
          {(["name", "natural"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                mode === value ? "bg-amber-300 text-black" : "text-neutral-300 hover:bg-white/10"
              }`}
            >
              {value === "name" ? "Name" : "Natural"}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={runSearch} className="mt-5 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="card-command-search">
          Search cards
        </label>
        <input
          id="card-command-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={mode === "natural" ? "cheap white instant draw cmc<=2" : "Sol Ring"}
          className="min-h-11 flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-neutral-500 focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300/20"
        />
        <button
          type="submit"
          disabled={busy || !query.trim()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-amber-300 px-4 py-2 text-sm font-bold text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
          Search
        </button>
      </form>

      {translatedQuery ? (
        <p className="mt-3 text-xs text-neutral-400">
          Scryfall query: <code className="rounded border border-neutral-700 bg-black/40 px-1.5 py-0.5 text-neutral-200">{translatedQuery}</code>
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {results.map((result) => {
          const price = priceLabel(result);
          return (
            <article key={`${result.name}-${result.set || ""}`} className="rounded-lg border border-white/10 bg-neutral-900/70 p-3">
              <div className="flex gap-3">
                {result.image ? (
                  <img src={result.image} alt="" className="h-[74px] w-[52px] rounded object-cover" />
                ) : (
                  <div className="flex h-[74px] w-[52px] shrink-0 items-center justify-center rounded border border-white/10 bg-black/30 text-amber-200">
                    <Sparkles size={18} aria-hidden="true" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-white">{result.name}</h3>
                  {result.type_line ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-neutral-400">{result.type_line}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    {result.mana_cost ? <span className="rounded bg-white/5 px-2 py-1 text-neutral-300">{result.mana_cost}</span> : null}
                    {price ? <span className="rounded bg-emerald-300/10 px-2 py-1 text-emerald-200">{price}</span> : null}
                    {result.set ? <span className="rounded bg-white/5 px-2 py-1 text-neutral-300">{result.set.toUpperCase()}</span> : null}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(result)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-amber-300/25 bg-amber-300/10 px-2 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-300/20"
                >
                  <Sparkles size={14} aria-hidden="true" />
                  Details
                </button>
                <a
                  href={scryfallCardSearchUrl(result.name)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-2 text-xs font-semibold text-neutral-100 transition hover:bg-white/10"
                >
                  <ExternalLink size={14} aria-hidden="true" />
                  Scryfall
                </a>
                <a
                  href={`/price-tracker?card=${encodeURIComponent(result.name)}`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-sky-300/20 bg-sky-300/10 px-2 py-2 text-xs font-semibold text-sky-100 transition hover:bg-sky-300/20"
                >
                  <BarChart3 size={14} aria-hidden="true" />
                  Price
                </a>
                <button
                  type="button"
                  onClick={() => addToWishlist(result.name)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-violet-300/20 bg-violet-300/10 px-2 py-2 text-xs font-semibold text-violet-100 transition hover:bg-violet-300/20"
                >
                  <BookmarkPlus size={14} aria-hidden="true" />
                  Wishlist
                </button>
              </div>
              <button
                type="button"
                onClick={() => addToWatchlist(result.name)}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-emerald-300/20 bg-emerald-300/10 px-2 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-300/20"
              >
                <ShieldPlus size={14} aria-hidden="true" />
                Add to Pro watchlist
              </button>
            </article>
          );
        })}
      </div>

      {!busy && query.trim() && results.length === 0 && !error ? (
        <p className="mt-5 rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-neutral-400">No card results yet.</p>
      ) : null}

      <WebsiteCardDetailModal
        open={Boolean(selected)}
        cardName={selected?.name || ""}
        imageSmall={selected?.image || undefined}
        imageNormal={selected?.image || undefined}
        onClose={() => setSelected(null)}
      />
    </section>
  );
}
