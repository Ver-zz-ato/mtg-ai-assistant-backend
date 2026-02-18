import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCommanderBySlug, getFirst50CommanderSlugs } from "@/lib/commanders";
import {
  renderCommanderIntro,
  deriveCommanderSnapshot,
  renderHowDeckWins,
  renderCommonMistakes,
} from "@/lib/seo/commander-content";
import { RelatedTools } from "@/components/RelatedTools";
import { CommanderActionBar } from "@/components/commander/CommanderActionBar";
import { CommanderHero } from "@/components/commander/CommanderHero";
import { CommanderSynergyTeaser, getSynergyBullets } from "@/components/commander/CommanderSynergyTeaser";
import { CoreStaples } from "@/components/commander/CoreStaples";
import { CommunityBuildsTabs } from "@/components/commander/CommunityBuildsTabs";
import { SimilarCommanders } from "@/components/commander/SimilarCommanders";
import { DeepDiveLinks } from "@/components/commander/DeepDiveLinks";
import { getImagesForNamesCached } from "@/lib/server/scryfallCache";
import { getCommanderAggregates } from "@/lib/commander-aggregates";
import { getCommanderMetaBadge } from "@/lib/commander-meta-badge";
import { getCostLandingData } from "@/lib/seo/cost-landing-data";
import { getCommanderFromDecksBySlug } from "@/lib/commander-fallback";

export async function generateStaticParams() {
  return getFirst50CommanderSlugs().map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

const BASE = "https://www.manatap.ai";

function breadcrumbJsonLd(slug: string, name: string) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: BASE },
      { "@type": "ListItem", position: 2, name: "Commanders", item: `${BASE}/commanders` },
      { "@type": "ListItem", position: 3, name, item: `${BASE}/commanders/${slug}` },
    ],
  });
}

function webPageJsonLd(slug: string, name: string, description: string) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${name} Commander Tools`,
    description,
    url: `${BASE}/commanders/${slug}`,
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const profile = getCommanderBySlug(slug);
  if (profile) {
    return {
      title: `${profile.name} Commander Tools: Mulligan, Cost, Swaps | ManaTap`,
      description: `Tools for ${profile.name} Commander decks: mulligan simulator, cost to finish, budget swaps. Browse ${profile.name} decks. Try ManaTap's free EDH tools.`,
      alternates: { canonical: `${BASE}/commanders/${slug}` },
    };
  }
  const fallback = await getCommanderFromDecksBySlug(slug);
  if (fallback) {
    return {
      title: `${fallback.name} Commander Tools: Mulligan, Cost, Swaps | ManaTap`,
      description: `Tools for ${fallback.name} Commander decks: mulligan simulator, cost to finish, budget swaps. Browse ${fallback.deckCount} community decks. Try ManaTap's free EDH tools.`,
      alternates: { canonical: `${BASE}/commanders/${slug}` },
    };
  }
  return { title: "Commander Not Found | ManaTap AI" };
}

export default async function CommanderHubPage({ params }: Props) {
  const { slug } = await params;
  const profile = getCommanderBySlug(slug);
  const fallback = !profile ? await getCommanderFromDecksBySlug(slug) : null;
  if (!profile && !fallback) notFound();

  const name = profile?.name ?? fallback!.name;
  const isFallback = !!fallback && !profile;
  const intro = profile
    ? renderCommanderIntro(profile, "hub")
    : `${name} Commander decks get better with the right tools. Browse community decks for inspiration and use ManaTap's free mulligan simulator, cost estimator, and budget swap finder.`;
  const description = `Tools for ${name} Commander decks: mulligan simulator, cost to finish, budget swaps. Browse ${name} decks.`;
  const snapshot = profile ? deriveCommanderSnapshot(profile) : { gameplan: "Build around your commander's strengths.", themes: "flexible", powerStyle: "Value" as const, difficulty: "Intermediate" as const };

  const browseUrl = `/decks/browse?search=${encodeURIComponent(name)}`;
  const mulliganUrl = `/tools/mulligan?commander=${encodeURIComponent(slug)}`;
  const costUrl = `/collections/cost-to-finish?commander=${encodeURIComponent(slug)}`;
  const swapsUrl = `/deck/swap-suggestions?commander=${encodeURIComponent(slug)}`;

  const cleanName = name.replace(/\s*\(.*?\)\s*$/, "").trim();
  // Guard DB calls: on failure, render fallback so page returns 200 (avoid 5xx)
  const [imgMap, aggregates, metaBadge, costLanding] = await Promise.all([
    getImagesForNamesCached([cleanName]).catch(() => new Map<string, { art_crop?: string; normal?: string; small?: string }>()),
    getCommanderAggregates(slug).catch(() => null),
    getCommanderMetaBadge(slug, name).catch(() => null),
    profile ? getCostLandingData(slug).catch(() => ({ costSnapshot: null, costDrivers: [], deckCount: 0 })) : Promise.resolve({ costSnapshot: null, costDrivers: [], deckCount: 0 }),
  ]);
  const medianCostFallback =
    aggregates?.medianDeckCost == null && costLanding?.costSnapshot?.mid != null
      ? costLanding.costSnapshot.mid
      : null;

  const deckCount = aggregates?.deckCount ?? fallback?.deckCount ?? 0;
  const medianDeckCostUSD =
    (aggregates?.medianDeckCost != null && aggregates.medianDeckCost > 0
      ? Math.round(aggregates.medianDeckCost)
      : medianCostFallback != null && medianCostFallback > 0
        ? Math.round(medianCostFallback)
        : null) ?? null;

  const statsData = {
    deckCount: deckCount > 0 ? deckCount : null,
    medianDeckCostUSD,
    metaBadge,
    difficultyLabel: snapshot.difficulty,
    powerTier: snapshot.powerStyle,
  };

  function norm(s: string) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  const cmdImg = imgMap.get(norm(cleanName));
  const commanderArt = cmdImg?.art_crop || cmdImg?.normal || cmdImg?.small;

  const winPlanBullets = profile
    ? getSynergyBullets(profile)
    : ["Ramp and card draw form the foundation", "Removal and interaction answer threats", "Browse community decks for strategy inspiration"];
  const recentDecks = aggregates?.recentDecks ?? fallback?.recentDecks ?? [];

  return (
    <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <CommanderActionBar commanderSlug={slug} commanderName={name} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd(slug, name) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: webPageJsonLd(slug, name, description) }} />
      <article className="text-neutral-200">
        <nav className="text-sm text-neutral-400 mb-3">
          <Link href="/" className="hover:text-white">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/commanders" className="hover:text-white">Commanders</Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-200">{name}</span>
        </nav>

        <h1 className="text-2xl lg:text-3xl font-bold text-white mb-3">
          {name} Commander Tools
        </h1>
        <p className="text-neutral-400 text-base mb-6 max-w-2xl">
          {intro.split(/(?<=\.)\s+/).slice(0, 2).join(" ")}
        </p>

        {/* Content thickness: Commander overview, how deck wins, key synergies, common mistakes - SSR for indexability */}
        <section className="rounded-xl border border-neutral-700 bg-neutral-800/40 p-5 mb-6 space-y-4">
          <h2 className="text-lg font-semibold text-neutral-100">Commander overview</h2>
          <p className="text-neutral-300 text-sm leading-relaxed">{intro}</p>
          {profile && (
            <>
              <h2 className="text-lg font-semibold text-neutral-100 pt-2">How this deck wins</h2>
              <p className="text-neutral-300 text-sm leading-relaxed">{renderHowDeckWins(profile)}</p>
              <h2 className="text-lg font-semibold text-neutral-100 pt-2">Common mistakes</h2>
              <p className="text-neutral-300 text-sm leading-relaxed">{renderCommonMistakes(profile)}</p>
            </>
          )}
        </section>

        <CommanderHero
          commanderName={name}
          commanderSlug={slug}
          artUrl={commanderArt ?? null}
          statsData={statsData}
          winPlanBullets={winPlanBullets}
          mulliganUrl={mulliganUrl}
          costUrl={costUrl}
          browseUrl={browseUrl}
          swapsUrl={swapsUrl}
        />

        {aggregates && aggregates.topCards.length > 0 && (
          <CoreStaples
            cards={aggregates.topCards.slice(0, 12)}
            commanderName={name}
            deckCount={aggregates.deckCount}
          />
        )}

        {profile && <CommanderSynergyTeaser profile={profile} />}

        <CommunityBuildsTabs
          commanderName={name}
          browseUrl={browseUrl}
          recentDecks={recentDecks}
        />

        <SimilarCommanders currentSlug={slug} />

        {/* Popular Archetypes / Strategies - internal links for crawlability */}
        <section className="rounded-xl border border-neutral-700 bg-neutral-800/60 p-5 mb-6">
          <h2 className="text-lg font-semibold text-neutral-100 mb-3">
            Popular Archetypes & Strategies
          </h2>
          <p className="text-neutral-400 text-sm mb-3">
            Explore commanders by playstyle and archetype.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href="/commander-archetypes" className="inline-block px-4 py-2 rounded-lg bg-neutral-700/80 hover:bg-neutral-600 text-cyan-400 hover:text-cyan-300 text-sm font-medium border border-neutral-600">
              Commander Archetypes
            </a>
            <a href="/strategies" className="inline-block px-4 py-2 rounded-lg bg-neutral-700/80 hover:bg-neutral-600 text-cyan-400 hover:text-cyan-300 text-sm font-medium border border-neutral-600">
              Deck Strategies
            </a>
            <a href="/meta/trending-commanders" className="inline-block px-4 py-2 rounded-lg bg-neutral-700/80 hover:bg-neutral-600 text-cyan-400 hover:text-cyan-300 text-sm font-medium border border-neutral-600">
              Trending Commanders
            </a>
          </div>
        </section>

        <DeepDiveLinks commanderSlug={slug} showCommanderGuides={!isFallback} />

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
