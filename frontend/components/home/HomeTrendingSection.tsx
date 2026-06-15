import { Suspense } from "react";
import nextDynamic from "next/dynamic";
import RecentPublicDecks from "@/components/RecentPublicDecks";
import RecentPublicDecksSkeleton from "@/components/RecentPublicDecksSkeleton";
import PopularCommanderGuides from "@/components/PopularCommanderGuides";

const MetaDeckPanel = nextDynamic(() => import("@/components/MetaDeckPanel"), {
  loading: () => (
    <div className="animate-pulse rounded-2xl border border-purple-800/30 bg-purple-900/20 p-4 h-64" />
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
          Meta movers, popular guides, and recent public decks from the community.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MetaDeckPanel />
        <Suspense fallback={<RecentPublicDecksSkeleton />}>
          <RecentPublicDecks limit={5} />
        </Suspense>
      </div>

      <div className="-mx-4 mt-2 sm:mx-0">
        <PopularCommanderGuides />
      </div>
    </section>
  );
}
