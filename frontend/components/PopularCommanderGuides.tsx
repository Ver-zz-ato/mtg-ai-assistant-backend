"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchCommanderArtBatch } from "@/lib/commander-art-batch";

/**
 * Popular Commander Guides - Internal linking component for SEO
 * Shows high-value commander pages with art pills to boost their internal link equity
 */

import { FLAGSHIP_COMMANDER_GUIDES } from "@/lib/home/commanderGuides";
import { HOME_COMMANDER_GUIDE_COUNT } from "@/lib/home/commanderGuideCount";

interface CommanderGuide {
  slug: string;
  name: string;
  colors: string;
}

const POPULAR_COMMANDERS: CommanderGuide[] = FLAGSHIP_COMMANDER_GUIDES.map(
  ({ slug, name, colors }) => ({ slug, name, colors }),
);

const COLOR_STYLES: Record<string, string> = {
  W: "bg-amber-100 text-amber-900 border-amber-300",
  U: "bg-blue-500 text-white border-blue-400",
  B: "bg-neutral-800 text-neutral-200 border-neutral-600",
  R: "bg-red-600 text-white border-red-500",
  G: "bg-green-600 text-white border-green-500",
};

function ColorPips({ colors }: { colors: string }) {
  return (
    <span className="inline-flex gap-0.5">
      {colors.split("").map((c, i) => (
        <span
          key={i}
          className={`w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold border ${COLOR_STYLES[c] || "bg-gray-500"}`}
        >
          {c}
        </span>
      ))}
    </span>
  );
}

export default function PopularCommanderGuides({ embedded = false }: { embedded?: boolean }) {
  const [artMap, setArtMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchArt() {
      const map = await fetchCommanderArtBatch(
        POPULAR_COMMANDERS.map((cmd) => cmd.name)
      );
      if (!cancelled) {
        setArtMap(map);
        setLoading(false);
      }
    }
    fetchArt();
    return () => { cancelled = true; };
  }, []);

  return (
    <section
      className={
        embedded
          ? "pt-1"
          : "max-w-[1600px] mx-auto px-4 py-4 border-t border-neutral-800"
      }
    >
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-3">
        <div>
          <h2 className="text-lg font-semibold text-neutral-200">
            📚 Popular Commander Guides
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Best cards, budget upgrades & mulligan strategy for top commanders
          </p>
        </div>
        <Link
          href="/commanders"
          className="text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors shrink-0"
        >
          View all {HOME_COMMANDER_GUIDE_COUNT}+ guides →
        </Link>
      </div>

      <div className="relative min-w-0 overflow-hidden">
        <div
          className="flex gap-3 overflow-x-auto overflow-y-hidden pb-2 -mx-1 px-1 custom-scrollbar"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {POPULAR_COMMANDERS.map((cmd) => (
            <div
              key={cmd.slug}
              className="shrink-0 w-48 min-w-[12rem] rounded-xl bg-neutral-800/80 border border-neutral-700 hover:border-neutral-600 transition-all duration-200 overflow-hidden flex flex-col"
            >
              {/* Art header - clickable to commander page */}
              <Link
                href={`/commanders/${cmd.slug}`}
                className="block h-20 bg-neutral-800 relative overflow-hidden hover:opacity-90 transition-opacity"
              >
                {loading ? (
                  <div className="w-full h-full bg-neutral-700 animate-pulse" />
                ) : artMap[cmd.name] ? (
                  <img
                    src={artMap[cmd.name]}
                    alt={cmd.name}
                    className="w-full h-full object-cover object-top"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-neutral-700 to-neutral-800 flex items-center justify-center text-neutral-500 text-2xl">
                    🃏
                  </div>
                )}
                {/* Gradient overlay for text readability */}
                <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
              </Link>

              {/* Content */}
              <div className="p-3 flex flex-col flex-1 -mt-6 relative z-10">
                {/* Name + colors row */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Link 
                    href={`/commanders/${cmd.slug}`}
                    className="font-bold text-white text-sm truncate flex-1 hover:text-cyan-300 transition-colors"
                    title={cmd.name}
                  >
                    {cmd.name.split(",")[0]}
                  </Link>
                  <ColorPips colors={cmd.colors} />
                </div>

                {/* Guide links as pills */}
                <div className="flex flex-wrap gap-1.5 mt-auto">
                  <Link
                    href={`/commanders/${cmd.slug}/best-cards`}
                    className="px-2.5 py-1 text-[11px] font-medium bg-violet-600/80 hover:bg-violet-500 text-white rounded-full transition-colors"
                  >
                    Best Cards
                  </Link>
                  <Link
                    href={`/commanders/${cmd.slug}/budget-upgrades`}
                    className="px-2.5 py-1 text-[11px] font-medium bg-emerald-600/80 hover:bg-emerald-500 text-white rounded-full transition-colors"
                  >
                    Budget
                  </Link>
                  <Link
                    href={`/commanders/${cmd.slug}/mulligan-guide`}
                    className="px-2.5 py-1 text-[11px] font-medium bg-amber-600/80 hover:bg-amber-500 text-white rounded-full transition-colors"
                  >
                    Mulligan
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
