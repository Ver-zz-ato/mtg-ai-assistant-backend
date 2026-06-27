import type { Metadata } from "next";
import TopToolsStrip from "@/components/TopToolsStrip";
import { TrendingCommandersStrip } from "@/components/TrendingCommandersStrip";
import PopularCommanderGuides from "@/components/PopularCommanderGuides";
import ChatHomeWorkspace from "@/components/home/ChatHomeWorkspace";
import { getHomeVariant } from "@/lib/analytics/home-experiment";

export const metadata: Metadata = {
  title: "Legacy Chat Homepage | ManaTap",
  robots: { index: false, follow: false },
};

export default function OldHomePage() {
  const variant = getHomeVariant();
  const showVariantB = variant === "B";

  return (
    <div className="w-full relative">
      <div className="max-w-[1760px] mx-auto px-4 -mt-4">
        <h1 className="mb-2 pt-1 text-center text-xl font-bold tracking-tight text-white sm:text-2xl">
          ManaTap — MTG Deck Builder &amp; Assistant
        </h1>
        <TopToolsStrip />
      </div>

      <ChatHomeWorkspace showVariantB={showVariantB} />

      <TrendingCommandersStrip />

      <PopularCommanderGuides />

      <nav
        className="max-w-[1600px] mx-auto px-4 py-3 mt-2 border-t border-neutral-800 flex flex-wrap justify-center gap-x-2 gap-y-1.5 text-sm"
        aria-label="Tools and discovery"
      >
        <a href="/tools/mulligan" className="text-amber-400 hover:text-amber-300 transition-colors">
          Mulligan
        </a>
        <span className="text-neutral-600 shrink-0" aria-hidden>
          ·
        </span>
        <a
          href="/tools/probability"
          className="text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          Probability
        </a>
        <span className="text-neutral-600 shrink-0" aria-hidden>
          ·
        </span>
        <a
          href="/collections/cost-to-finish"
          className="text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          Cost to Finish
        </a>
        <span className="text-neutral-600 shrink-0" aria-hidden>
          ·
        </span>
        <a
          href="/deck/swap-suggestions"
          className="text-lime-400 hover:text-lime-300 transition-colors"
        >
          Budget Swaps
        </a>
        <span className="text-neutral-600 shrink-0" aria-hidden>
          ·
        </span>
        <a href="/price-tracker" className="text-blue-400 hover:text-blue-300 transition-colors">
          Price Tracker
        </a>
        <span className="text-neutral-600 shrink-0" aria-hidden>
          ·
        </span>
        <a href="/decks/browse" className="text-orange-400 hover:text-orange-300 transition-colors">
          Browse Decks
        </a>
        <span className="text-neutral-600 shrink-0" aria-hidden>
          |
        </span>
        <a href="/commanders" className="text-violet-400 hover:text-violet-300 transition-colors">
          Commanders
        </a>
        <span className="text-neutral-600 shrink-0" aria-hidden>
          ·
        </span>
        <a
          href="/commander-archetypes"
          className="text-pink-400 hover:text-pink-300 transition-colors"
        >
          Archetypes
        </a>
        <span className="text-neutral-600 shrink-0" aria-hidden>
          ·
        </span>
        <a href="/meta" className="text-fuchsia-400 hover:text-fuchsia-300 transition-colors">
          Meta
        </a>
      </nav>
    </div>
  );
}
