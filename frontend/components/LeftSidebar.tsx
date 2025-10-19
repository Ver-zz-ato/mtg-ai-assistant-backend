// components/LeftSidebar.tsx
import { Suspense } from "react";
import RecentPublicDecks from "./RecentPublicDecks";
import RecentPublicDecksSkeleton from "./RecentPublicDecksSkeleton";
import FeedbackFab from "./FeedbackFab";
import MostLikedPublicDecks from "./MostLikedPublicDecks";
import BadgeProgressWidget from "./BadgeProgressWidget";
import CompareDecksWidget from "./CompareDecksWidget";

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

      {/* Achievement Progress Widget - shows for logged in users */}
      <BadgeProgressWidget />

      {/* Deck Comparison Widget */}
      <CompareDecksWidget />

      {/* FAB is fixed-position; rendering here mounts it globally */}
      <FeedbackFab />
    </div>
  );
}

    
