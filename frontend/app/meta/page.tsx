import type { Metadata } from "next";
import Link from "next/link";
import {
  TrendingUp,
  Users,
  Wallet,
  Zap,
  BarChart3,
} from "lucide-react";
import { MetaLayout } from "@/components/meta/MetaLayout";
import { MetaHero } from "@/components/meta/MetaHero";
import { MetaStatStrip } from "@/components/meta/MetaStatStrip";
import { MetaTileGrid } from "@/components/meta/MetaTileGrid";
import { getMetaSnapshot, formatRelative } from "@/lib/meta/getMetaSnapshot";

export const metadata: Metadata = {
  title: "Meta | Trending Commanders & Cards | ManaTap",
  description:
    "Discover trending commanders, most-played cards, and budget commanders. Based on public deck data. Updated daily.",
  alternates: { canonical: "https://www.manatap.ai/meta" },
};

// Revalidate every hour - meta data refreshed daily by cron
export const revalidate = 3600;

const TILES = [
  {
    href: "/meta/trending-commanders",
    title: "Trending Commanders",
    description: "Commanders with the most new decks in the last 30 days.",
    statHint: "Rising in popularity",
    icon: TrendingUp,
  },
  {
    href: "/meta/most-played-commanders",
    title: "Most Played Commanders",
    description: "Top commanders by total public deck count.",
    statHint: "Community favorites",
    icon: Users,
  },
  {
    href: "/meta/budget-commanders",
    title: "Budget Commanders",
    description: "Lowest median deck cost. Build on a budget.",
    statHint: "Affordable builds",
    icon: Wallet,
  },
  {
    href: "/meta/trending-cards",
    title: "Trending Cards",
    description: "Cards appearing most in recently created decks.",
    statHint: "Hot picks",
    icon: Zap,
  },
  {
    href: "/meta/most-played-cards",
    title: "Most Played Cards",
    description: "Most included cards across all public Commander decks.",
    statHint: "Staples & staples",
    icon: BarChart3,
  },
];

export default async function MetaIndexPage() {
  const snapshot = await getMetaSnapshot();

  const stats = [
    ...(snapshot.decksAnalyzed != null
      ? [{ label: "Decks analyzed", value: snapshot.decksAnalyzed.toLocaleString() }]
      : []),
    ...(snapshot.lastUpdated
      ? [
          {
            label: "Last updated",
            value: formatRelative(snapshot.lastUpdated),
          },
        ]
      : []),
    { label: "Data source", value: "Scryfall API" },
  ];

  return (
    <MetaLayout>
      <article className="text-neutral-200">
        <nav className="text-sm text-neutral-400 mb-6">
          <Link href="/" className="hover:text-white">
            Home
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-200">Meta</span>
        </nav>

        <MetaHero
          headline="Stay Ahead of the Commander Meta"
          subtext="Updated daily from public deck data."
        >
          <MetaStatStrip stats={stats} />
        </MetaHero>

        {/* Feature panel: Top Trending Commander */}
        {snapshot.topCommander && (
          <section className="mb-10 rounded-xl border border-neutral-700 bg-neutral-800/90 p-6 hover:border-blue-500/40 transition-colors">
            <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-3">
              Top Trending Commander
            </h2>
            <Link
              href={`/commanders/${snapshot.topCommander.slug}`}
              className="flex flex-col sm:flex-row items-start sm:items-center gap-4 group"
            >
              <div className="relative w-32 aspect-[488/680] rounded-lg overflow-hidden bg-neutral-700 shrink-0">
                {snapshot.topCommander.imageUrl ? (
                  <img
                    src={snapshot.topCommander.imageUrl}
                    alt={snapshot.topCommander.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-full h-full bg-neutral-700 flex items-center justify-center text-neutral-500 text-xs">
                    No art
                  </div>
                )}
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 text-white text-xs font-bold">
                  #1 this week
                </span>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white group-hover:text-blue-300 transition-colors">
                  {snapshot.topCommander.name}
                </h3>
                <p className="text-neutral-400 text-sm mt-1">
                  {snapshot.topCommander.count} new deck
                  {snapshot.topCommander.count !== 1 ? "s" : ""} in last 30 days
                </p>
              </div>
            </Link>
          </section>
        )}

        {/* Rich tiles grid */}
        <section>
          <h2 className="text-xl font-semibold text-white mb-4">
            Explore Meta Data
          </h2>
          <MetaTileGrid tiles={TILES} />
        </section>
      </article>
    </MetaLayout>
  );
}
