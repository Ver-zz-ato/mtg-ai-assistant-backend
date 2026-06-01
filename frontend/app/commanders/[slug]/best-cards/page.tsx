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
import { CoreStaples } from "@/components/commander/CoreStaples";
import { GuideInlineText } from "@/components/commander/GuideInlineText";
import { CommanderLandingShowcase } from "@/components/commander/CommanderLandingShowcase";
import { getCommanderShowcase } from "@/lib/seo/commander-showcases";
import { getImagesForNamesCached } from "@/lib/server/scryfallCache";
import { getCommanderAggregates } from "@/lib/commander-aggregates";

export async function generateStaticParams() {
  return getFirst50CommanderSlugs().map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

const BASE = "https://www.manatap.ai";

function norm(s: string) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function faqJsonLd() {
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
  const showcase = getCommanderShowcase(slug, "best-cards");
  
  return {
    title: showcase
      ? showcase.metadata.title
      : `Top 50 Best Cards for ${profile.name} | EDH Staples 2026`,
    description: showcase
      ? showcase.metadata.description
      : `Must-have cards for ${profile.name}${colorSnippet} Commander. Essential ramp, card draw, removal & ${archetype} payoffs ranked by win rate. Updated for 2026.`,
    alternates: { canonical: `${BASE}/commanders/${slug}/best-cards` },
    openGraph: {
      title: showcase
        ? showcase.metadata.openGraphTitle
        : `Best Cards for ${profile.name} - EDH/Commander Guide`,
      description: showcase
        ? showcase.metadata.openGraphDescription
        : `Discover the highest win-rate cards for ${profile.name} decks. Includes budget alternatives and synergy breakdowns.`,
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
  const focusTags = (profile.tags ?? []).slice(0, 4);
  const traps = (profile.avoid ?? []).slice(0, 3);

  const cleanName = name.replace(/\s*\(.*?\)\s*$/, "").trim();
  const [imgMap, aggregates] = await Promise.all([
    getImagesForNamesCached([cleanName]),
    getCommanderAggregates(slug),
  ]);
  const topCards = aggregates?.topCards?.slice(0, 12) ?? [];
  const cmdImg = imgMap.get(norm(cleanName));
  const commanderArt = cmdImg?.art_crop || cmdImg?.normal || cmdImg?.small;
  const showcase = getCommanderShowcase(slug, "best-cards");

  return (
    <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd() }} />
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
        {showcase && (
          <CommanderLandingShowcase showcase={showcase} deckCount={aggregates?.deckCount ?? 0} />
        )}
        <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-5 mb-8">
          <h2 className="text-xl font-semibold text-neutral-100 mb-3">What actually matters in a {name} list</h2>
          <p className="text-neutral-300 leading-relaxed">
            {profile.blurb ?? `${name} rewards a tight, role-based build.`} Start with cards that help the deck function every game, then add narrower payoffs once your ramp, draw, and interaction are already doing their jobs.
          </p>
          {(focusTags.length > 0 || traps.length > 0) && (
            <div className="grid gap-4 md:grid-cols-2 mt-4">
              {focusTags.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-2">Build Around</h3>
                  <div className="flex flex-wrap gap-2">
                    {focusTags.map((tag) => (
                      <span key={tag} className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-sm text-amber-200">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {traps.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-2">Usually Cut First</h3>
                  <ul className="space-y-2 text-sm text-neutral-300">
                    {traps.map((trap) => (
                      <li key={trap}>- {trap}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
        {topCards.length > 0 && (
          <CoreStaples cards={topCards} commanderName={name} deckCount={aggregates?.deckCount ?? 0} />
        )}
        <div className="space-y-6 text-neutral-300 leading-relaxed">
          {content.map((block, i) => (
            <section key={i}>
              {block.heading && (
                <h2 className="text-xl font-semibold text-neutral-100 mb-3">{block.heading}</h2>
              )}
              <p><GuideInlineText text={block.body} /></p>
            </section>
          ))}
        </div>
        <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-5 mt-8">
          <h2 className="text-xl font-semibold text-neutral-100 mb-3">Keep moving</h2>
          <div className="grid gap-3 md:grid-cols-3 text-sm">
            <Link href={`/commanders/${slug}`} className="rounded-lg border border-neutral-700 bg-neutral-800/70 p-4 hover:border-neutral-500">
              <div className="text-neutral-100 font-medium mb-1">{name} hub</div>
              <div className="text-neutral-400">Overview, stats, decks, and related strategy links.</div>
            </Link>
            <Link href={`/commanders/${slug}/mulligan-guide`} className="rounded-lg border border-neutral-700 bg-neutral-800/70 p-4 hover:border-neutral-500">
              <div className="text-neutral-100 font-medium mb-1">Mulligan guide</div>
              <div className="text-neutral-400">Figure out what openers are worth keeping.</div>
            </Link>
            <Link href={`/commanders/${slug}/budget-upgrades`} className="rounded-lg border border-neutral-700 bg-neutral-800/70 p-4 hover:border-neutral-500">
              <div className="text-neutral-100 font-medium mb-1">Budget upgrades</div>
              <div className="text-neutral-400">Find cheaper improvements without breaking the shell.</div>
            </Link>
          </div>
        </section>
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
