// This file replaces your existing components/LeftSidebar.tsx
// It keeps the left column layout and swaps the static "Yuriko…" list
// for a live RecentPublicDecks widget that reads /api/decks/recent.
import RecentPublicDecks from "./RecentPublicDecks";

export default function LeftSidebar() {
  return (
    <div className="w-full flex flex-col gap-4">
      {/* Recent public decks - live */}
      <RecentPublicDecks />

      {/* Ad box (unchanged placeholder) */}
      <div className="rounded-xl border border-dashed border-gray-700 p-6 text-center text-xs text-gray-500">
        AD PLACEHOLDER
        <br />300 × 250
      </div>
    </div>
  );
}
