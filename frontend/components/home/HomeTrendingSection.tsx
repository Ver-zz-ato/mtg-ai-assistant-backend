import nextDynamic from "next/dynamic";
import { TrendingCommandersStrip } from "@/components/TrendingCommandersStrip";
import PopularCommanderGuides from "@/components/PopularCommanderGuides";

const MetaDeckPanel = nextDynamic(() => import("@/components/MetaDeckPanel"), {
  loading: () => (
    <div className="h-48 animate-pulse rounded-2xl border border-purple-800/30 bg-purple-900/20 p-4" />
  ),
});

export default function HomeTrendingSection() {
  return (
    <section className="mt-10 sm:mt-12">
      <div className="mb-5">
        <h2 className="text-2xl font-black text-white sm:text-3xl">
          What&apos;s trending in Commander
        </h2>
        <p className="mt-2 text-sm text-neutral-400 sm:text-base">
          Recognizable commanders, meta movers, and guides to start exploring.
        </p>
      </div>

      <div className="-mx-4 sm:mx-0">
        <TrendingCommandersStrip mode="marketing" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MetaDeckPanel />
        <div className="rounded-2xl border border-white/10 bg-neutral-950/40 p-4 sm:p-5">
          <h3 className="text-lg font-bold text-neutral-200">Commander guides</h3>
          <p className="mt-1 text-sm text-neutral-500">
            Best cards, budget upgrades, and mulligan tips for popular leaders.
          </p>
          <p className="mt-4 text-sm text-neutral-400">
            Browse structured guides for 50+ commanders — a faster on-ramp than random public deck
            titles.
          </p>
          <a
            href="/commanders"
            className="mt-4 inline-flex text-sm font-semibold text-cyan-400 transition hover:text-cyan-300"
          >
            Browse all commander guides →
          </a>
        </div>
      </div>

      <div className="-mx-4 mt-2 sm:mx-0">
        <PopularCommanderGuides />
      </div>
    </section>
  );
}
