"use client";

import Link from "next/link";

/**
 * Popular Commander Guides - Internal linking component for SEO
 * Shows high-value commander pages to boost their internal link equity
 */

interface CommanderGuide {
  slug: string;
  name: string;
  colors: string;
}

// Top commanders by search volume/popularity - prioritize these for indexing
const POPULAR_COMMANDERS: CommanderGuide[] = [
  { slug: "the-ur-dragon", name: "The Ur-Dragon", colors: "WUBRG" },
  { slug: "edgar-markov", name: "Edgar Markov", colors: "WBR" },
  { slug: "atraxa-praetors-voice", name: "Atraxa", colors: "WUBG" },
  { slug: "krenko-mob-boss", name: "Krenko", colors: "R" },
  { slug: "kaalia-of-the-vast", name: "Kaalia", colors: "WBR" },
  { slug: "muldrotha-the-gravetide", name: "Muldrotha", colors: "UBG" },
  { slug: "korvold-fae-cursed-king", name: "Korvold", colors: "BRG" },
  { slug: "yuriko-the-tigers-shadow", name: "Yuriko", colors: "UB" },
];

const COLOR_MAP: Record<string, string> = {
  W: "bg-amber-100 text-amber-900",
  U: "bg-blue-500 text-white",
  B: "bg-neutral-800 text-neutral-200",
  R: "bg-red-600 text-white",
  G: "bg-green-600 text-white",
};

function ColorPips({ colors }: { colors: string }) {
  return (
    <span className="inline-flex gap-0.5 ml-1">
      {colors.split("").map((c, i) => (
        <span
          key={i}
          className={`w-3 h-3 rounded-full text-[8px] flex items-center justify-center font-bold ${COLOR_MAP[c] || "bg-gray-500"}`}
        >
          {c}
        </span>
      ))}
    </span>
  );
}

export default function PopularCommanderGuides() {
  return (
    <section className="max-w-[1600px] mx-auto px-4 py-4 border-t border-neutral-800">
      <h2 className="text-sm font-semibold text-neutral-400 mb-3 uppercase tracking-wide">
        Popular Commander Guides
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {POPULAR_COMMANDERS.map((cmd) => (
          <div key={cmd.slug} className="group">
            <div className="text-xs text-neutral-300 font-medium mb-1 flex items-center">
              {cmd.name}
              <ColorPips colors={cmd.colors} />
            </div>
            <div className="flex flex-wrap gap-1 text-[10px]">
              <Link
                href={`/commanders/${cmd.slug}/best-cards`}
                className="px-1.5 py-0.5 bg-violet-900/40 text-violet-300 rounded hover:bg-violet-800/60 transition-colors"
              >
                Best Cards
              </Link>
              <Link
                href={`/commanders/${cmd.slug}/budget-upgrades`}
                className="px-1.5 py-0.5 bg-emerald-900/40 text-emerald-300 rounded hover:bg-emerald-800/60 transition-colors"
              >
                Budget
              </Link>
              <Link
                href={`/commanders/${cmd.slug}/mulligan-guide`}
                className="px-1.5 py-0.5 bg-amber-900/40 text-amber-300 rounded hover:bg-amber-800/60 transition-colors"
              >
                Mulligan
              </Link>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-center">
        <Link
          href="/commanders"
          className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          View all 50+ commander guides →
        </Link>
      </div>
    </section>
  );
}
