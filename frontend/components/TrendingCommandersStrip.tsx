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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchTrending() {
      try {
        const res = await fetch("/api/meta/trending?window=today", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && data?.ok && Array.isArray(data.topCommanders)) {
          setCommanders(data.topCommanders.slice(0, 12));
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
              className="shrink-0 w-44 min-w-[11rem] rounded-lg bg-neutral-800/80 border border-neutral-700 hover:bg-neutral-700/90 hover:border-neutral-600 transition-all duration-200 p-3 flex flex-col"
            >
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
                  className="flex-1 px-3 py-1.5 text-xs font-medium bg-amber-600 hover:bg-amber-500 text-black rounded-md transition-all duration-200 hover:scale-[1.02]"
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
          ))}
        </div>
      </div>
    </section>
  );
}
