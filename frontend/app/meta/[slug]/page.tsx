import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMetaSignal, META_SLUGS, getMetaTitle, type MetaSlug } from "@/lib/meta-signals";
import { getCommanderBySlug } from "@/lib/commanders";

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function generateStaticParams() {
  return META_SLUGS.map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

const BASE = "https://www.manatap.ai";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!META_SLUGS.includes(slug as MetaSlug)) return { title: "Not Found | ManaTap AI" };
  return {
    title: `${getMetaTitle(slug as MetaSlug)} | ManaTap`,
    description: `Discover ${getMetaTitle(slug as MetaSlug).toLowerCase()} in Commander. Based on public deck data.`,
    alternates: { canonical: `${BASE}/meta/${slug}` },
  };
}

export default async function MetaPage({ params }: Props) {
  const { slug } = await params;
  if (!META_SLUGS.includes(slug as MetaSlug)) notFound();

  const data = await getMetaSignal(slug);
  const title = getMetaTitle(slug as MetaSlug);

  const isCommander = slug.includes("commander");
  const isCard = slug.includes("card");

  return (
    <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <article className="text-neutral-200">
        <nav className="text-sm text-neutral-400 mb-4">
          <Link href="/" className="hover:text-white">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/meta" className="hover:text-white">Meta</Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-200">{title}</span>
        </nav>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">{title}</h1>
        <p className="text-neutral-300 mb-8 text-lg">
          Based on public Commander deck data. Updated daily.
        </p>

        {data && Array.isArray(data) && data.length > 0 ? (
          <ul className="space-y-2">
            {data.map((item: Record<string, unknown>, i: number) => {
              const name = item.name as string;
              const count = item.count as number | undefined;
              const medianCost = item.medianCost as number | undefined;
              const itemSlug = item.slug as string | undefined;

              if (isCommander && name) {
                const cmdSlug = itemSlug ?? getCommanderBySlug(toSlug(name))?.slug ?? toSlug(name);
                return (
                  <li key={i}>
                    <Link href={`/commanders/${cmdSlug}`} className="text-blue-400 hover:underline">
                      {name}
                    </Link>
                    {count != null && <span className="text-neutral-500 text-sm ml-2">({count} decks)</span>}
                    {medianCost != null && <span className="text-neutral-500 text-sm ml-2">~${Math.round(medianCost).toLocaleString()}</span>}
                  </li>
                );
              }
              if (isCard && name) {
                const cardSlug = toSlug(name);
                return (
                  <li key={i}>
                    <Link href={`/cards/${cardSlug}`} className="text-blue-400 hover:underline">
                      {name}
                    </Link>
                    {count != null && <span className="text-neutral-500 text-sm ml-2">({count})</span>}
                  </li>
                );
              }
              return null;
            })}
          </ul>
        ) : (
          <p className="text-neutral-400">No data yet. Check back after the daily meta refresh.</p>
        )}

        <div className="mt-8 pt-6 border-t border-neutral-700">
          <Link href="/meta" className="text-blue-400 hover:underline">
            Browse all meta pages
          </Link>
          <span className="mx-2 text-neutral-500">|</span>
          <Link href="/commanders" className="text-blue-400 hover:underline">
            Commanders
          </Link>
          <span className="mx-2 text-neutral-500">|</span>
          <Link href="/cards" className="text-blue-400 hover:underline">
            Cards
          </Link>
        </div>
      </article>
    </main>
  );
}
