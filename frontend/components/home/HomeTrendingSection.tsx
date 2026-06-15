import nextDynamic from "next/dynamic";
import { TrendingCommandersStrip } from "@/components/TrendingCommandersStrip";
import PopularCommanderGuides from "@/components/PopularCommanderGuides";
import HomeCommanderGuideRotator from "@/components/home/HomeCommanderGuideRotator";

const MetaDeckPanel = nextDynamic(() => import("@/components/MetaDeckPanel"), {
  loading: () => (
    <div className="h-32 animate-pulse rounded-xl border border-purple-800/30 bg-purple-900/20 p-3" />
  ),
});

export default function HomeTrendingSection() {
  return (
    <section className="mt-8 sm:mt-10">
      <div className="mb-4">
        <h2 className="text-2xl font-black text-white sm:text-3xl">
          What&apos;s trending in Commander
        </h2>
        <p className="mt-1.5 text-sm text-neutral-400 sm:text-base">
          Meta movers, featured guides, and commanders to explore.
        </p>
      </div>

      <div className="-mx-4 sm:mx-0">
        <TrendingCommandersStrip mode="marketing" />
      </div>

      <div className="mt-4">
        <HomeCommanderGuideRotator />
      </div>

      <div className="-mx-4 mt-4 sm:mx-0">
        <PopularCommanderGuides />
      </div>

      <div className="mt-4 max-w-xl">
        <MetaDeckPanel compact />
      </div>
    </section>
  );
}
