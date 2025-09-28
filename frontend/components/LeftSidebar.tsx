// components/LeftSidebar.tsx
import { Suspense } from "react";
import RecentPublicDecks from "./RecentPublicDecks";
import RecentPublicDecksSkeleton from "./RecentPublicDecksSkeleton";
import FeedbackFab from "./FeedbackFab";
import MostLikedPublicDecks from "./MostLikedPublicDecks";

export default function LeftSidebar() {
  return (
    <div className="w-full flex flex-col gap-4">
      <Suspense fallback={<RecentPublicDecksSkeleton />}>
        <RecentPublicDecks />
      </Suspense>

      <Suspense>
        {/* Most liked public decks under recent */}
        <MostLikedPublicDecks />
      </Suspense>

      {/* Ad box (unchanged placeholder) */}
      <div className="rounded-xl border border-dashed border-gray-700 p-6 text-center text-xs text-gray-500">
        AD PLACEHOLDER
      </div>

      {/* FAB is fixed-position; rendering here mounts it globally */}
      <FeedbackFab />
    </div>
  );
}

      <a href="/collections/cost-to-finish" className="block rounded-xl border border-gray-700 p-4 hover:border-gray-500 transition">
        <div className="text-sm font-medium">Cost to Finish</div>
        <div className="text-xs text-gray-400">Estimate price gaps; subtract owned from collection.</div>
      </a>
    