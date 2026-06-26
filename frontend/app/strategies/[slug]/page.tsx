import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStrategyBySlug, getAllStrategySlugs, getCommandersByStrategy } from "@/lib/archetypes";
import { getGlobalMetaCommanders } from "@/lib/meta/global-meta-entities";
import { getImagesForNamesCached } from "@/lib/server/scryfallCache";
import { CommanderCard } from "@/components/meta/CommanderCard";

const BASE = "https://www.manatap.ai";

function norm(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function faqJsonLd(questions: Array<{ q: string; a: string }>) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  });
}

export async function generateStaticParams() {
  return getAllStrategySlugs().map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const strategy = getStrategyBySlug(slug);
  if (!strategy) return { title: "Strategy Not Found | ManaTap AI" };
  return {
    title: `${strategy.title} Commander Decks | ManaTap`,
    description: `Commander decks for the ${strategy.title} strategy. Mulligan simulator, cost to finish, budget swaps. Free EDH tools.`,
    alternates: { canonical: `${BASE}/strategies/${slug}` },
  };
}

export default async function StrategyPage({ params }: Props) {
  const { slug } = await params;
  const strategy = getStrategyBySlug(slug);
  if (!strategy) notFound();

  const commanders = await getCommandersByStrategy(slug);
  const [metaRows, imageMap] = await Promise.all([
    getGlobalMetaCommanders(150).catch(() => []),
    getImagesForNamesCached(commanders.map((c) => c.name)),
  ]);
  const metaBySlug = new Map(metaRows.map((row) => [row.slug, row]));

  const faqs = [
    {
      q: `What is the ${strategy.title} strategy in Commander?`,
      a: strategy.intro,
    },
    {
      q: `Which commanders use the ${strategy.title} strategy?`,
      a: commanders.length > 0
        ? `Popular ${strategy.title} commanders include ${commanders.slice(0, 3).map((c) => c.name).join(", ")}. Use ManaTap's tools to optimize your deck.`
        : `Many commanders support ${strategy.title}. Browse our commander list and tools to find the right fit.`,
    },
  ];

  return (
    <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd(faqs) }} />
      <article className="text-neutral-200">
        <nav className="text-sm text-neutral-400 mb-4">
          <Link href="/" className="hover:text-white">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/strategies" className="hover:text-white">Strategies</Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-200">{strategy.title}</span>
        </nav>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
          {strategy.title} Commander Decks
        </h1>
        <div className="mb-8 flex flex-wrap gap-2">
          {strategy.tagMatches.slice(0, 8).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-amber-100"
            >
              {tag}
            </span>
          ))}
        </div>

        {commanders.length > 0 && (
          <section className="mb-10">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <h2 className="text-xl font-semibold text-neutral-100">
                {strategy.title} Commanders
              </h2>
              <span className="text-sm text-neutral-400">
                {commanders.length} commander{commanders.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
              {commanders.map((c) => {
                const meta = metaBySlug.get(c.slug);
                const badge = meta?.trendingRank
                  ? `Trending #${meta.trendingRank}`
                  : meta?.mostPlayedRank
                    ? `Meta #${meta.mostPlayedRank}`
                    : null;
                const img = imageMap.get(norm(c.name));
                const url = img?.art_crop ?? img?.normal ?? img?.small;
                return (
                  <CommanderCard
                    key={c.slug}
                    item={{
                      name: c.name,
                      slug: c.slug,
                      metaLabel: badge ?? strategy.title,
                    }}
                    imageUrl={url}
                  />
                );
              })}
            </div>
          </section>
        )}

        <h2 className="text-xl font-semibold text-neutral-100 mb-4">Related Tools</h2>
        <div className="grid gap-4 sm:grid-cols-3 mb-8">
          <Link
            href="/tools/mulligan"
            className="block p-4 rounded-lg bg-neutral-800/80 border border-neutral-700 hover:border-blue-600 transition-colors"
          >
            <h3 className="font-semibold text-white mb-1">Mulligan Simulator</h3>
            <p className="text-sm text-neutral-400">Test your opener</p>
          </Link>
          <Link
            href="/collections/cost-to-finish"
            className="block p-4 rounded-lg bg-neutral-800/80 border border-neutral-700 hover:border-blue-600 transition-colors"
          >
            <h3 className="font-semibold text-white mb-1">Cost to Finish</h3>
            <p className="text-sm text-neutral-400">Estimate deck cost</p>
          </Link>
          <Link
            href="/deck/swap-suggestions"
            className="block p-4 rounded-lg bg-neutral-800/80 border border-neutral-700 hover:border-blue-600 transition-colors"
          >
            <h3 className="font-semibold text-white mb-1">Budget Swaps</h3>
            <p className="text-sm text-neutral-400">Find cheaper alternatives</p>
          </Link>
        </div>

        <Link href="/strategies" className="text-blue-400 hover:underline">
          Browse all strategies
        </Link>
      </article>
    </main>
  );
}
