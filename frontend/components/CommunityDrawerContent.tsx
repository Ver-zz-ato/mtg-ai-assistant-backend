// components/CommunityDrawerContent.tsx
// Server component: Deck Roast + Shoutbox + Meta Snapshot + deck lists (no FeedbackFab)
import { Suspense } from "react";
import dynamic from "next/dynamic";
import Shoutbox from "./Shoutbox";
import MetaDeckPanel from "./MetaDeckPanel";
import RecentPublicDecks from "./RecentPublicDecks";
import RecentPublicDecksSkeleton from "./RecentPublicDecksSkeleton";
import MostLikedPublicDecks from "./MostLikedPublicDecks";

const DeckRoastPanel = dynamic(() => import("./DeckRoastPanel"), {
  loading: () => <div className="animate-pulse bg-amber-950/20 rounded-2xl h-24 border border-amber-800/30" />,
});

export default function CommunityDrawerContent() {
  return (
    <div className="space-y-4">
      <DeckRoastPanel variant="panel" showSignupCta={true} useModal={true} />
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
