// components/LeftSidebar.tsx
import { Suspense } from "react";
import RecentPublicDecks from "./RecentPublicDecks";
import RecentPublicDecksSkeleton from "./RecentPublicDecksSkeleton";

export default function LeftSidebar() {
  return (
    <div className="w-full flex flex-col gap-4">
      <Suspense fallback={<RecentPublicDecksSkeleton />}>
        {/* @ts-expect-error Async Server Component */}
        <RecentPublicDecks />
      </Suspense>

      {/* Ad box (unchanged placeholder) */}
      <div className="rounded-xl border border-dashed border-gray-700 p-6 text-center text-xs text-gray-500">
        AD PLACEHOLDER
      </div>

      {/* Your left-rail tools, untouched below… */}
    </div>
  );
}
