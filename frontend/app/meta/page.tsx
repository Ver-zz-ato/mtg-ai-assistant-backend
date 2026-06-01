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
import { formatRelative } from "@/lib/meta/getMetaSnapshot";
import { getMetaSourceSummary } from "@/lib/meta/sourceSummary";
import { MetaSourceCallout } from "@/components/meta/MetaSourceCallout";
import { META_DESCRIPTIONS } from "@/lib/seo/metadata";
import { getExternalTrendingCommanders } from "@/lib/meta/externalDailyMeta";

export const metadata: Metadata = {
  title: "Meta | Trending Commanders & Cards | ManaTap",
  description: META_DESCRIPTIONS.index,
  alternates: { canonical: "https://www.manatap.ai/meta" },
};

// Revalidate every hour - meta data refreshed daily by cron
export const revalidate = 3600;

function norm(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const TILES = [
  {
    href: "/meta/trending-commanders",
    title: "Trending Commanders",
    description: "Commanders climbing in external EDHREC-order rank snapshots.",
    statHint: "Rising in popularity",
    icon: TrendingUp,
  },
  {
    href: "/meta/most-played-commanders",
    title: "Most Played Commanders",
    description: "Top commanders by external EDHREC-order popularity.",
    statHint: "Community favorites",
    icon: Users,
  },
  {
    href: "/meta/budget-commanders",
    title: "Budget Commanders",
    description: "Low-price commanders ranked by external EDHREC-order popularity.",
    statHint: "Budget meta",
    icon: Wallet,
  },
  {
    href: "/meta/trending-cards",
    title: "Trending Cards",
    description: "Cards climbing in external EDHREC-order rank snapshots.",
    statHint: "Hot picks",
    icon: Zap,
  },
  {
    href: "/meta/most-played-cards",
    title: "Most Played Cards",
    description: "Most-played Commander cards by external EDHREC-order popularity.",
    statHint: "Staples & staples",
    icon: BarChart3,
  },
];

export default async function MetaIndexPage() {
  const [topTrending, sourceSummary] = await Promise.all([
    getExternalTrendingCommanders(1),
    getMetaSourceSummary(),
  ]);
  const topCommander = topTrending.items[0] ?? null;
  const topCommanderImage = topCommander ? topTrending.imageMap.get(norm(topCommander.name)) : null;

  const stats = [
    ...(sourceSummary.globalCommanderRows != null || sourceSummary.globalCardRows != null
      ? [
          {
            label: "Global signals",
            value: `${(sourceSummary.globalCommanderRows ?? 0).toLocaleString()} commanders / ${(sourceSummary.globalCardRows ?? 0).toLocaleString()} cards`,
          },
        ]
      : []),
    ...(sourceSummary.lastUpdated
      ? [
          {
            label: "Last updated",
            value: formatRelative(sourceSummary.lastUpdated),
          },
        ]
      : []),
    { label: "Data source", value: "External EDHREC-order signals" },
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
          subtext="Updated daily from Scryfall card data and EDHREC-order global Commander popularity signals."
        >
          <MetaStatStrip stats={stats} />
        </MetaHero>

        <div className="mb-10">
          <MetaSourceCallout summary={sourceSummary} scope="external" />
        </div>

        {/* Feature panel: Top Trending Commander */}
        {topCommander && (
          <section className="mb-10 rounded-xl border border-neutral-700 bg-neutral-800/90 p-6 hover:border-blue-500/40 transition-colors">
            <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-3">
              Top Trending Commander
            </h2>
            <Link
              href={`/commanders/${topCommander.slug}`}
              className="flex flex-col sm:flex-row items-start sm:items-center gap-4 group"
            >
              <div className="relative w-32 aspect-[488/680] rounded-lg overflow-hidden bg-neutral-700 shrink-0">
                {topCommanderImage ? (
                  <img
                    src={topCommanderImage}
                    alt={topCommander.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-full h-full bg-neutral-700 flex items-center justify-center text-neutral-500 text-xs">
                    No art
                  </div>
                )}
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 text-white text-xs font-bold">
                  #1 mover
                </span>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white group-hover:text-blue-300 transition-colors">
                  {topCommander.name}
                </h3>
                <p className="text-neutral-400 text-sm mt-1">
                  {topCommander.metaLabel}
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
