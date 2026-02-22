import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCommanderBySlug, getFirst50CommanderSlugs } from "@/lib/commanders";
import {
  renderBestCardsContent,
  BEST_CARDS_FAQ,
} from "@/lib/seo/commander-content";
import { RelatedTools } from "@/components/RelatedTools";
import { CommanderArtBanner } from "@/components/CommanderArtBanner";
import { CommanderStatsRibbon } from "@/components/commander/CommanderStatsRibbon";
import { CommanderToolActions } from "@/components/commander/CommanderToolActions";
import { getImagesForNamesCached } from "@/lib/server/scryfallCache";
import { getCommanderAggregates } from "@/lib/commander-aggregates";

export async function generateStaticParams() {
  return getFirst50CommanderSlugs().map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

const BASE = "https://www.manatap.ai";

function faqJsonLd(slug: string, name: string) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: BEST_CARDS_FAQ.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  });
}

function breadcrumbJsonLd(slug: string, name: string) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: BASE },
      { "@type": "ListItem", position: 2, name: "Commanders", item: `${BASE}/commanders` },
      { "@type": "ListItem", position: 3, name, item: `${BASE}/commanders/${slug}` },
      { "@type": "ListItem", position: 4, name: "Best Cards", item: `${BASE}/commanders/${slug}/best-cards` },
    ],
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const profile = getCommanderBySlug(slug);
  if (!profile) return { title: "Not Found | ManaTap" };
  
  // Color identity snippet for richer description
  const colorNames: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
  const colors = profile.colors?.map(c => colorNames[c] || c).join("/") || "";
  const colorSnippet = colors ? ` (${colors})` : "";
  
  // Tags for archetype hint
  const archetype = profile.tags?.[0] || "synergy";
  
  return {
    title: `Top 50 Best Cards for ${profile.name} | EDH Staples 2026`,
    description: `Must-have cards for ${profile.name}${colorSnippet} Commander. Essential ramp, card draw, removal & ${archetype} payoffs ranked by win rate. Updated for 2026.`,
    alternates: { canonical: `${BASE}/commanders/${slug}/best-cards` },
    openGraph: {
      title: `Best Cards for ${profile.name} - EDH/Commander Guide`,
      description: `Discover the highest win-rate cards for ${profile.name} decks. Includes budget alternatives and synergy breakdowns.`,
      type: "article",
    },
  };
}

export default async function BestCardsPage({ params }: Props) {
  const { slug } = await params;
  const profile = getCommanderBySlug(slug);
  if (!profile) notFound();

  const { name } = profile;
  const content = renderBestCardsContent(profile);

  const cleanName = name.replace(/\s*\(.*?\)\s*$/, "").trim();
  const [imgMap, aggregates] = await Promise.all([
    getImagesForNamesCached([cleanName]),
    getCommanderAggregates(slug),
  ]);
  function norm(s: string) {
    return String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  }
  const cmdImg = imgMap.get(norm(cleanName));
  const commanderArt = cmdImg?.art_crop || cmdImg?.normal || cmdImg?.small;

  return (
    <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd(slug, name) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd(slug, name) }} />
      <article className="text-neutral-200">
        <nav className="text-sm text-neutral-400 mb-4">
          <Link href="/" className="hover:text-white">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/commanders" className="hover:text-white">Commanders</Link>
          <span className="mx-2">/</span>
          <Link href={`/commanders/${slug}`} className="hover:text-white">{name}</Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-200">Best Cards</span>
        </nav>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
          Best Cards for {name}
        </h1>
        {commanderArt && (
          <CommanderArtBanner artUrl={commanderArt} name={name} subtitle="Best Cards" className="mb-6" />
        )}
        <CommanderStatsRibbon profile={profile} aggregates={aggregates} />
        <h2 className="text-xl font-semibold text-neutral-100 mb-4">Try tools with this commander</h2>
        <CommanderToolActions
          commanderName={name}
          tools={[
            { href: `/tools/mulligan?commander=${encodeURIComponent(slug)}`, label: "Mulligan Simulator", description: "Simulate keep rates for your opener" },
            { href: `/collections/cost-to-finish?commander=${encodeURIComponent(slug)}`, label: "Cost to Finish", description: "Estimate cost to complete your deck" },
            { href: `/deck/swap-suggestions?commander=${encodeURIComponent(slug)}`, label: "Budget Swaps", description: "Find cheaper alternatives" },
            { href: `/decks/browse?search=${encodeURIComponent(name)}`, label: "Browse Decks", description: `Explore public ${name} decks`, isRecommended: true },
          ]}
        />
        <div className="space-y-6 text-neutral-300 leading-relaxed">
          {content.map((block, i) => (
            <section key={i}>
              {block.heading && (
                <h2 className="text-xl font-semibold text-neutral-100 mb-3">{block.heading}</h2>
              )}
              <p>{block.body}</p>
            </section>
          ))}
        </div>
        <h2 className="text-xl font-semibold text-neutral-100 mt-10 mb-3">FAQ</h2>
        <dl className="space-y-3 text-neutral-300">
          {BEST_CARDS_FAQ.map(({ q, a }) => (
            <div key={q}>
              <dt className="font-medium text-neutral-100">{q}</dt>
              <dd className="ml-0 mt-1 text-sm">{a}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-8">
          <Link
            href={`/commanders/${slug}`}
            className="text-cyan-400 hover:underline"
          >
            ← Back to {name} commander hub
          </Link>
        </div>
        <RelatedTools
          tools={[
            { href: "/tools/mulligan", label: "Mulligan Simulator" },
            { href: "/collections/cost-to-finish", label: "Cost to Finish" },
            { href: "/deck/swap-suggestions", label: "Budget Swaps" },
            { href: "/tools/probability", label: "Probability Calculator" },
            { href: "/price-tracker", label: "Price Tracker" },
          ]}
        />
      </article>
    </main>
  );
}
