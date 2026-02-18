import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMetaTitle, META_SLUGS, type MetaSlug } from "@/lib/meta-signals";
import { MetaLayout } from "@/components/meta/MetaLayout";
import { MetaSectionHeader } from "@/components/meta/MetaSectionHeader";
import { MetaStatStrip } from "@/components/meta/MetaStatStrip";
import { CommanderCard } from "@/components/meta/CommanderCard";
import { CardMetaCard } from "@/components/meta/CardMetaCard";
import { getTrendingCommanders } from "@/lib/meta/getTrendingCommanders";
import { getMostPlayedCommanders } from "@/lib/meta/getMostPlayedCommanders";
import { getBudgetCommanders } from "@/lib/meta/getBudgetCommanders";
import { getTrendingCards } from "@/lib/meta/getTrendingCards";
import { getMostPlayedCards } from "@/lib/meta/getMostPlayedCards";
import { formatRelative } from "@/lib/meta/getMetaSnapshot";

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
    description: `Discover ${getMetaTitle(slug as MetaSlug).toLowerCase()} in Commander. Based on public deck data.`,
    alternates: { canonical: `${BASE}/meta/${slug}` },
  };
}

// Revalidate every hour - meta data refreshed daily by cron
export const revalidate = 3600;

export default async function MetaPage({ params }: Props) {
  const { slug } = await params;
  if (!META_SLUGS.includes(slug as MetaSlug)) notFound();

  const title = getMetaTitle(slug as MetaSlug);
  const isCommander =
    slug === "trending-commanders" ||
    slug === "most-played-commanders" ||
    slug === "budget-commanders";
  const isCard = slug === "trending-cards" || slug === "most-played-cards";

  let items: unknown[] = [];
  let imageMap = new Map<string, string>();
  let updatedAt: string | null = null;
  let description = "Based on public Commander deck data. Updated daily.";

  if (slug === "trending-commanders") {
    const data = await getTrendingCommanders();
    items = data.items;
    imageMap = data.imageMap;
    updatedAt = data.updatedAt;
    description = "Commanders with the most new decks in the last 30 days.";
  } else if (slug === "most-played-commanders") {
    const data = await getMostPlayedCommanders();
    items = data.items;
    imageMap = data.imageMap;
    updatedAt = data.updatedAt;
    description = "Top commanders by total public deck count.";
  } else if (slug === "budget-commanders") {
    const data = await getBudgetCommanders();
    items = data.items;
    imageMap = data.imageMap;
    updatedAt = data.updatedAt;
    description = "Lowest median deck cost. Build on a budget.";
  } else if (slug === "trending-cards") {
    const data = await getTrendingCards();
    items = data.items;
    imageMap = data.imageMap;
    updatedAt = data.updatedAt;
    description = "Cards appearing most in recently created decks.";
  } else if (slug === "most-played-cards") {
    const data = await getMostPlayedCards();
    items = data.items;
    imageMap = data.imageMap;
    updatedAt = data.updatedAt;
    description = "Most included cards across all public Commander decks.";
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
          description={description}
          stats={
            statStripStats.length > 0 ? (
              <MetaStatStrip stats={statStripStats} />
            ) : undefined
          }
        />

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
                }>).map((item) => (
                  <CommanderCard
                    key={item.slug}
                    item={{
                      name: item.name,
                      slug: item.slug,
                      count: item.count,
                      medianCost: item.medianCost,
                      rank: item.rank,
                    }}
                    imageUrl={imageMap.get(norm(item.name))}
                  />
                ))}
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {(items as Array<{ name: string; count: number; rank?: number }>).map(
                  (item) => (
                    <CardMetaCard
                      key={item.name}
                      item={{
                        name: item.name,
                        count: item.count,
                        rank: item.rank,
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
