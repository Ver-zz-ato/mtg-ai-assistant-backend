"use client";

import RecentPublicDecks from "@/components/RecentPublicDecks";

export default function HomeRecentDecksSection() {
  return (
    <section className="max-w-7xl mx-auto px-4 my-8">
      <h2 className="text-lg font-semibold mb-3">Recent public decks</h2>
      <RecentPublicDecks />
    </section>
  );
}
