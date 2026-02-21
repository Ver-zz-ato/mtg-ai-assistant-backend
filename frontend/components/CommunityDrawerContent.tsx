// components/CommunityDrawerContent.tsx
// Server component: Shoutbox + Meta Snapshot + deck lists (no FeedbackFab)
import { Suspense } from "react";
import Shoutbox from "./Shoutbox";
import MetaDeckPanel from "./MetaDeckPanel";
import RecentPublicDecks from "./RecentPublicDecks";
import RecentPublicDecksSkeleton from "./RecentPublicDecksSkeleton";
import MostLikedPublicDecks from "./MostLikedPublicDecks";

export default function CommunityDrawerContent() {
  return (
    <div className="space-y-4">
      <Shoutbox />
      <MetaDeckPanel />
      <div className="flex flex-col gap-6">
        <Suspense fallback={<RecentPublicDecksSkeleton />}>
          <RecentPublicDecks />
        </Suspense>
        <Suspense>
          <MostLikedPublicDecks />
        </Suspense>
      </div>
    </div>
  );
}
