import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCommanderBySlug, getFirst50CommanderSlugs } from "@/lib/commanders";
import {
  renderMulliganGuideContent,
  MULLIGAN_FAQ,
} from "@/lib/seo/commander-content";
import { RelatedTools } from "@/components/RelatedTools";
import { CommanderArtBanner } from "@/components/CommanderArtBanner";
import { CommanderStatsRibbon } from "@/components/commander/CommanderStatsRibbon";
import { CommanderToolActions } from "@/components/commander/CommanderToolActions";
import { getImagesForNamesCached } from "@/lib/server/scryfallCache";
import { getCommanderAggregates } from "@/lib/commander-aggregates";
import { GuideInlineText } from "@/components/commander/GuideInlineText";

export async function generateStaticParams() {
  return getFirst50CommanderSlugs().map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

const BASE = "https://www.manatap.ai";

function faqJsonLd() {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: MULLIGAN_FAQ.map(({ q, a }) => ({
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
      { "@type": "ListItem", position: 4, name: "Mulligan Guide", item: `${BASE}/commanders/${slug}/mulligan-guide` },
    ],
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const profile = getCommanderBySlug(slug);
  if (!profile) return { title: "Not Found | ManaTap" };
  
  // Color identity snippet
  const colorNames: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
  const colors = profile.colors?.map(c => colorNames[c] || c).join("/") || "";
  const colorSnippet = colors ? ` (${colors})` : "";
  
  return {
    title: `${profile.name} Mulligan Guide | Keep or Ship? EDH Strategy`,
    description: `When to keep or mulligan with ${profile.name}${colorSnippet}. Ideal opening hands, land count targets & London mulligan tips. Free hand simulator included.`,
    alternates: { canonical: `${BASE}/commanders/${slug}/mulligan-guide` },
    openGraph: {
      title: `How to Mulligan ${profile.name} - Commander Strategy`,
      description: `Master the London mulligan with ${profile.name}. Learn what makes a keepable hand and simulate 1000s of openers.`,
      type: "article",
    },
  };
}

export default async function MulliganGuidePage({ params }: Props) {
  const { slug } = await params;
  const profile = getCommanderBySlug(slug);
  if (!profile) notFound();

  const { name } = profile;
  const content = renderMulliganGuideContent(profile);
  const focusTags = (profile.tags ?? []).slice(0, 4);
  const openingPlan = (profile.flagship?.openingPlan ?? []).slice(0, 4);
  const traps = (profile.avoid ?? []).slice(0, 3);

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
          <span className="text-neutral-200">Mulligan Guide</span>
        </nav>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
          How to Mulligan {name}
        </h1>
        {commanderArt && (
          <CommanderArtBanner artUrl={commanderArt} name={name} subtitle="Mulligan Guide" className="mb-6" />
        )}
        <CommanderStatsRibbon profile={profile} aggregates={aggregates} />
        <h2 className="text-xl font-semibold text-neutral-100 mb-4">Try tools with this commander</h2>
        <CommanderToolActions
          commanderName={name}
          tools={[
            { href: `/tools/mulligan?commander=${encodeURIComponent(slug)}`, label: "Mulligan Simulator", description: "Simulate keep rates for your opener", isRecommended: true },
            { href: `/collections/cost-to-finish?commander=${encodeURIComponent(slug)}`, label: "Cost to Finish", description: "Estimate cost to complete your deck" },
            { href: `/deck/swap-suggestions?commander=${encodeURIComponent(slug)}`, label: "Budget Swaps", description: "Find cheaper alternatives" },
            { href: `/decks/browse?search=${encodeURIComponent(name)}`, label: "Browse Decks", description: `Explore public ${name} decks` },
          ]}
        />
        <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-5 mb-8">
          <h2 className="text-xl font-semibold text-neutral-100 mb-3">Opening hand priorities</h2>
          <p className="text-neutral-300 leading-relaxed">
            {profile.blurb ?? `${name} mulligans best when your opener has a clear job.`} The goal is not a pretty seven-card hand. It is a hand that develops mana, lines up colors, and actually points toward the deck first meaningful turns.
          </p>
          <div className="grid gap-4 md:grid-cols-2 mt-4">
            {openingPlan.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-2">Ideal Early Script</h3>
                <ol className="space-y-2 text-sm text-neutral-300">
                  {openingPlan.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </div>
            )}
            {(focusTags.length > 0 || traps.length > 0) && (
              <div>
                {focusTags.length > 0 && (
                  <>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-2">Your opener should support</h3>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {focusTags.map((tag) => (
                        <span key={tag} className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-sm text-amber-200">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </>
                )}
                {traps.length > 0 && (
                  <>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-2">Hands to be suspicious of</h3>
                    <ul className="space-y-2 text-sm text-neutral-300">
                      {traps.map((trap) => (
                        <li key={trap}>- {trap}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>
        </section>
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
          <h2 className="text-xl font-semibold text-neutral-100 mb-3">Related commander guides</h2>
          <div className="grid gap-3 md:grid-cols-3 text-sm">
            <Link href={`/commanders/${slug}`} className="rounded-lg border border-neutral-700 bg-neutral-800/70 p-4 hover:border-neutral-500">
              <div className="text-neutral-100 font-medium mb-1">{name} hub</div>
              <div className="text-neutral-400">Overview, stats, and supporting deck resources.</div>
            </Link>
            <Link href={`/commanders/${slug}/best-cards`} className="rounded-lg border border-neutral-700 bg-neutral-800/70 p-4 hover:border-neutral-500">
              <div className="text-neutral-100 font-medium mb-1">Best cards</div>
              <div className="text-neutral-400">Check the staples and role cards your opener is trying to find.</div>
            </Link>
            <Link href={`/commanders/${slug}/budget-upgrades`} className="rounded-lg border border-neutral-700 bg-neutral-800/70 p-4 hover:border-neutral-500">
              <div className="text-neutral-100 font-medium mb-1">Budget upgrades</div>
              <div className="text-neutral-400">Improve consistency if your keeps are failing too often.</div>
            </Link>
          </div>
        </section>
        <h2 className="text-xl font-semibold text-neutral-100 mt-10 mb-3">FAQ</h2>
        <dl className="space-y-3 text-neutral-300">
          {MULLIGAN_FAQ.map(({ q, a }) => (
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
