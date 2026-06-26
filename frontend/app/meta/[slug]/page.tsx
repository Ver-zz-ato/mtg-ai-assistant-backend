import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMetaTitle, META_SLUGS, type MetaSlug } from "@/lib/meta-signals";
import { MetaLayout } from "@/components/meta/MetaLayout";
import { MetaSectionHeader } from "@/components/meta/MetaSectionHeader";
import { MetaStatStrip } from "@/components/meta/MetaStatStrip";
import { CommanderCard } from "@/components/meta/CommanderCard";
import { CardMetaCard } from "@/components/meta/CardMetaCard";
import { formatRelative } from "@/lib/meta/getMetaSnapshot";
import { getMetaSourceSummary } from "@/lib/meta/sourceSummary";
import { MetaSourceCallout } from "@/components/meta/MetaSourceCallout";
import { META_DESCRIPTIONS } from "@/lib/seo/metadata";
import {
  getExternalBudgetCommanders,
  getExternalMostPlayedCards,
  getExternalMostPlayedCommanders,
  getExternalTrendingCards,
  getExternalTrendingCommanders,
} from "@/lib/meta/externalDailyMeta";

const BASE = "https://www.manatap.ai";

function norm(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateStaticParams() {
  return META_SLUGS.map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!META_SLUGS.includes(slug as MetaSlug))
    return { title: "Not Found | ManaTap AI" };
  return {
    title: `${getMetaTitle(slug as MetaSlug)} | ManaTap`,
    description: META_DESCRIPTIONS[slug as MetaSlug],
    alternates: { canonical: `${BASE}/meta/${slug}` },
  };
}

// Revalidate every hour - meta data refreshed daily by cron
export const revalidate = 3600;
export const dynamic = "force-dynamic";

export default async function MetaPage({ params }: Props) {
  const { slug } = await params;
  if (!META_SLUGS.includes(slug as MetaSlug)) notFound();

  const title = getMetaTitle(slug as MetaSlug);
  const hideExternalMetaChrome = slug === "trending-commanders";
  const isCommander =
    slug === "trending-commanders" ||
    slug === "most-played-commanders" ||
    slug === "budget-commanders";

  let items: unknown[] = [];
  let imageMap = new Map<string, string>();
  let updatedAt: string | null = null;
  let description = "Based on external EDHREC-order global Commander signals. Updated daily.";
  const sourceSummary = await getMetaSourceSummary();

  if (slug === "trending-commanders") {
    const data = await getExternalTrendingCommanders();
    items = data.items;
    imageMap = data.imageMap;
    updatedAt = data.updatedAt;
    description = "";
  } else if (slug === "most-played-commanders") {
    const data = await getExternalMostPlayedCommanders();
    items = data.items;
    imageMap = data.imageMap;
    updatedAt = data.updatedAt;
    description = "Top commanders by external EDHREC-order global popularity.";
  } else if (slug === "budget-commanders") {
    const data = await getExternalBudgetCommanders();
    items = data.items;
    imageMap = data.imageMap;
    updatedAt = data.updatedAt;
    description = "Budget-friendly commanders from external Scryfall price filters, ranked by EDHREC-order popularity.";
  } else if (slug === "trending-cards") {
    const data = await getExternalTrendingCards();
    items = data.items;
    imageMap = data.imageMap;
    updatedAt = data.updatedAt;
    description = "Cards climbing in external EDHREC-order daily rank snapshots.";
  } else if (slug === "most-played-cards") {
    const data = await getExternalMostPlayedCards();
    items = data.items;
    imageMap = data.imageMap;
    updatedAt = data.updatedAt;
    description = "Most-played Commander cards by external EDHREC-order global popularity.";
  }

  const statStripStats = [
    ...(updatedAt
      ? [{ label: "Updated", value: formatRelative(updatedAt) }]
      : []),
    ...(items.length > 0
      ? [
          {
            label: isCommander ? "Commanders tracked" : "Cards tracked",
            value: items.length.toString(),
          },
        ]
      : []),
    { label: "Data source", value: "External EDHREC-order signals" },
  ];

  return (
    <MetaLayout narrow={items.length === 0}>
      <article className="text-neutral-200">
        <nav className="text-sm text-neutral-400 mb-6">
          <Link href="/" className="hover:text-white">
            Home
          </Link>
          <span className="mx-2">/</span>
          <Link href="/meta" className="hover:text-white">
            Meta
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-200">{title}</span>
        </nav>

        <MetaSectionHeader
          title={title}
          description={hideExternalMetaChrome ? undefined : description}
          stats={
            !hideExternalMetaChrome && statStripStats.length > 0 ? (
              <MetaStatStrip stats={statStripStats} />
            ) : undefined
          }
        />

        {!hideExternalMetaChrome ? (
          <div className="mb-8">
            <MetaSourceCallout summary={sourceSummary} compact scope="external" />
          </div>
        ) : null}

        {items.length > 0 ? (
          <>
            {isCommander ? (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {(items as Array<{
                  name: string;
                  slug: string;
                  count?: number;
                  medianCost?: number;
                  rank?: number;
                  metaLabel?: string;
                }>).map((item) => (
                  <CommanderCard
                    key={item.slug}
                    item={{
                      name: item.name,
                      slug: item.slug,
                      count: item.count,
                      medianCost: item.medianCost,
                      rank: item.rank,
                      metaLabel: item.metaLabel,
                    }}
                    imageUrl={imageMap.get(norm(item.name))}
                  />
                ))}
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {(items as Array<{ name: string; count?: number; rank?: number; metaLabel?: string }>).map(
                  (item) => (
                    <CardMetaCard
                      key={item.name}
                      item={{
                        name: item.name,
                        count: item.count,
                        rank: item.rank,
                        metaLabel: item.metaLabel,
                      }}
                      imageUrl={imageMap.get(norm(item.name))}
                    />
                  )
                )}
              </div>
            )}

            <div className="mt-10 pt-6 border-t border-neutral-700 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <Link href="/meta" className="text-blue-400 hover:underline">
                Browse all meta pages
              </Link>
              <span className="text-neutral-500">|</span>
              <Link href="/commanders" className="text-blue-400 hover:underline">
                Commanders
              </Link>
              <span className="text-neutral-500">|</span>
              <Link href="/cards" className="text-blue-400 hover:underline">
                Cards
              </Link>
            </div>
          </>
        ) : (
          <p className="text-neutral-400">
            No data yet. Check back after the daily meta refresh.
          </p>
        )}
      </article>
    </MetaLayout>
  );
}
