import nextDynamic from "next/dynamic";
import { TrendingCommandersStrip } from "@/components/TrendingCommandersStrip";
import PopularCommanderGuides from "@/components/PopularCommanderGuides";
import HomeCommanderGuideRotator from "@/components/home/HomeCommanderGuideRotator";

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
        <HomeCommanderGuideRotator />
      </div>

      <div className="-mx-4 mt-4 sm:mx-0">
        <PopularCommanderGuides />
      </div>
    </section>
  );
}
