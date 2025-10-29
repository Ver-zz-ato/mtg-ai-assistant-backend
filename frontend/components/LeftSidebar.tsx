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

      {/* FAB is fixed-position; rendering here mounts it globally */}
      <FeedbackFab />
    </div>
  );
}

    
