// components/LeftSidebar.tsx
import { Suspense } from "react";
import RecentPublicDecks from "./RecentPublicDecks";
import RecentPublicDecksSkeleton from "./RecentPublicDecksSkeleton";
import FeedbackFab from "./FeedbackFab";

export default function LeftSidebar() {
  return (
    <div className="w-full flex flex-col gap-4">
      <Suspense fallback={<RecentPublicDecksSkeleton />}>
        <RecentPublicDecks />
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
