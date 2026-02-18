"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type TrendingCommander = {
  name: string;
  count: number;
  slug?: string;
};

export function TrendingCommandersStrip() {
  const [commanders, setCommanders] = useState<TrendingCommander[]>([]);
  const [artMap, setArtMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchTrending() {
      try {
        const res = await fetch("/api/meta/trending?window=today", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && data?.ok && Array.isArray(data.topCommanders)) {
          const list = data.topCommanders.slice(0, 12);
          setCommanders(list);
          const map: Record<string, string> = {};
          await Promise.all(
            list.map(async (cmd: TrendingCommander) => {
              try {
                const r = await fetch(
                  `/api/commander-art?name=${encodeURIComponent(cmd.name)}`,
                  { cache: "force-cache" }
                );
                const j = await r.json();
                if (j?.ok && j?.art) map[cmd.name] = j.art;
              } catch {}
            })
          );
          if (!cancelled) setArtMap(map);
        }
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchTrending();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleAnalyze(name: string, slug?: string) {
    const message = `Build a Commander deck for ${name}`;
    window.dispatchEvent(
      new CustomEvent("quiz-build-deck", { detail: { message } })
    );
    // Optionally scroll chat into view
    const chatArea = document.querySelector('[data-chat-area]');
    chatArea?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (loading) {
    return (
      <section
        className="max-w-[1600px] mx-auto px-4 pt-4 pb-2"
        aria-label="Trending commanders"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-200">
              🔥 Trending Commanders Right Now
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Based on decks analyzed and built today.
            </p>
          </div>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="shrink-0 w-44 h-28 rounded-lg bg-neutral-800/60 animate-pulse"
            />
          ))}
        </div>
      </section>
    );
  }

  if (commanders.length === 0) {
    return null;
  }

  return (
    <section
      className="max-w-[1600px] mx-auto px-4 pt-4 pb-2"
      aria-labelledby="trending-commanders-heading"
    >
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-3">
        <div>
          <h2
            id="trending-commanders-heading"
            className="text-lg font-semibold text-neutral-200"
          >
            🔥 Trending Commanders Right Now
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Based on decks analyzed and built today.
          </p>
        </div>
        <Link
          href="/commanders"
          className="text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors shrink-0"
        >
          View all commanders →
        </Link>
      </div>

      <div className="relative">
        <div
          className="flex gap-3 overflow-x-auto overflow-y-hidden pb-2 -mx-1 px-1 scrollbar-hide"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {commanders.map((cmd) => (
            <div
              key={cmd.name}
              className="shrink-0 w-44 min-w-[11rem] rounded-lg bg-neutral-800/80 border border-neutral-700 hover:bg-neutral-700/90 hover:border-neutral-600 transition-all duration-200 overflow-hidden flex flex-col"
            >
              {/* Art pill */}
              <div className="h-20 bg-neutral-800 relative overflow-hidden">
                {artMap[cmd.name] ? (
                  <img
                    src={artMap[cmd.name]}
                    alt=""
                    className="w-full h-full object-cover object-top"
                  />
                ) : (
                  <div className="w-full h-full bg-neutral-700 flex items-center justify-center text-neutral-500 text-2xl">
                    🃏
                  </div>
                )}
              </div>
              <div className="p-3 flex flex-col flex-1">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="font-bold text-white text-sm truncate flex-1">
                  {cmd.name}
                </span>
                <span className="text-xs text-neutral-400 shrink-0 bg-neutral-700/80 px-2 py-0.5 rounded">
                  {cmd.count} deck{cmd.count !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="mt-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => handleAnalyze(cmd.name, cmd.slug)}
                  className="flex-1 px-3 py-1.5 text-xs font-medium bg-neutral-600 hover:bg-neutral-500 text-white rounded-md transition-colors"
                >
                  Analyze this commander
                </button>
                {cmd.slug && (
                  <Link
                    href={`/commanders/${cmd.slug}`}
                    className="px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white border border-neutral-600 hover:border-neutral-500 rounded-md transition-all duration-200 shrink-0"
                  >
                    View
                  </Link>
                )}
              </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
