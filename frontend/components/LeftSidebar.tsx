// components/LeftSidebar.tsx
import { Suspense } from "react";
import RecentPublicDecks from "./RecentPublicDecks";
import RecentPublicDecksSkeleton from "./RecentPublicDecksSkeleton";
import FeedbackFab from "./FeedbackFab";

export default function LeftSidebar() {
  return (
    <div className="w-full flex flex-col gap-6">
      <Suspense fallback={<RecentPublicDecksSkeleton />}>
        <RecentPublicDecks />
      </Suspense>

      {/* FAB is fixed-position; rendering here mounts it globally */}
      <FeedbackFab />
    </div>
  );
}

    
