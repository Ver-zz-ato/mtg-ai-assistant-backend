import React from "react";
import { createClient } from "@/lib/supabase/server";
import DeckComparisonTool from "@/components/DeckComparisonTool";
import GuestLandingPage from "@/components/GuestLandingPage";
import { canonicalMeta } from "@/lib/canonical";
import type { Metadata } from "next";

export function generateMetadata(): Metadata {
  return canonicalMeta("/compare-decks");
}

export default async function ComparePage() {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();

  if (!u?.user) {
    const features = [
      {
        icon: '🔍',
        title: 'Side-by-Side Comparison',
        description: 'Compare up to 3 decks simultaneously with detailed card-by-card analysis.',
      },
      {
        icon: '📊',
        title: 'Visual Diff Highlights',
        description: 'Instantly see unique cards, shared cards, and key differences between your decks.',
        highlight: true,
      },
      {
        icon: '📈',
        title: 'Stats Comparison',
        description: 'Compare mana curves, color distribution, card types, and total deck values.',
      },
      {
        icon: '📄',
        title: 'Export to PDF',
        description: 'Generate professional PDF reports of your deck comparisons to share or print.',
      },
    ];

    const demoSection = (
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-50/50 to-blue-50/50 dark:from-purple-900/10 dark:to-blue-900/10" />
        <div className="relative">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Compare & Optimize Your Decks
          </h2>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900/40 dark:to-purple-800/20 rounded-lg p-4">
              <div className="font-semibold text-purple-900 dark:text-purple-200 mb-2">
                📋 Card Analysis
              </div>
              <p className="text-purple-700 dark:text-purple-300 text-xs">
                See which cards are unique, shared, or missing across your decks
              </p>
            </div>
            <div className="bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-blue-800/20 rounded-lg p-4">
              <div className="font-semibold text-blue-900 dark:text-blue-200 mb-2">
                💰 Budget Planning
              </div>
              <p className="text-blue-700 dark:text-blue-300 text-xs">
                Compare deck values and find budget alternatives
              </p>
            </div>
          </div>
        </div>
      </div>
    );

    return (
      <GuestLandingPage
        title="Compare Your Decks"
        subtitle="Analyze differences and optimize your deck-building strategy with powerful comparison tools"
        features={features}
        demoSection={demoSection}
      />
    );
  }

  // Fetch user's decks
  const { data: decks, error } = await supabase
    .from("decks")
    .select("id, title, commander, created_at, updated_at")
    .eq("user_id", u.user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">Compare Decks</h1>
        <p className="text-red-500">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Compare Decks</h1>
        <p className="text-gray-400 text-sm">
          Select 2-3 decks to compare side-by-side with detailed analysis
        </p>
      </div>

      <React.Suspense fallback={<div className="text-center py-12 text-gray-400">Loading...</div>}>
        <DeckComparisonTool decks={decks || []} />
      </React.Suspense>
    </div>
  );
}

