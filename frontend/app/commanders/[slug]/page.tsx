import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
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
import { CommunityProfileSection } from "@/components/commander/CommunityProfileSection";
import { CommunityBuildsTabs } from "@/components/commander/CommunityBuildsTabs";
import { SimilarCommanders } from "@/components/commander/SimilarCommanders";
import { DeepDiveLinks } from "@/components/commander/DeepDiveLinks";
import { GuideInlineText } from "@/components/commander/GuideInlineText";
import { getImagesForNamesCached } from "@/lib/server/scryfallCache";
import { getCommanderAggregates } from "@/lib/commander-aggregates";
import { getCommanderMetaBadge } from "@/lib/commander-meta-badge";
import { getCommanderPageCommunityProfile } from "@/lib/external-deck-meta/commanderPageProfile";
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

function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
  return { title: "Commander Not Found | ManaTap" };
}

export default async function CommanderHubPage({ params }: Props) {
  const { slug } = await params;
  const profile = getCommanderBySlug(slug);
  const fallback = !profile ? await getCommanderFromDecksBySlug(slug) : null;
  if (!profile && !fallback) {
    const cardName = humanizeSlug(slug);
    redirect(`/price-tracker?card=${encodeURIComponent(cardName)}`);
  }

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
  const [imgMap, aggregates, metaBadge, costLanding, communityProfile] = await Promise.all([
    getImagesForNamesCached([cleanName]).catch(() => new Map<string, { art_crop?: string; normal?: string; small?: string }>()),
    getCommanderAggregates(slug).catch(() => null),
    getCommanderMetaBadge(slug, name).catch(() => null),
    profile ? getCostLandingData(slug).catch(() => ({ costSnapshot: null, costDrivers: [], deckCount: 0 })) : Promise.resolve({ costSnapshot: null, costDrivers: [], deckCount: 0 }),
    getCommanderPageCommunityProfile(name).catch(() => null),
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

        <section className="mb-6 rounded-2xl border border-fuchsia-400/20 bg-gradient-to-br from-fuchsia-950/20 via-neutral-950/50 to-cyan-950/20 p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-fuchsia-200/80 mb-2">Commander Guide</p>
          <h1 className="text-3xl lg:text-4xl font-bold text-white mb-3">
            {name} Commander Guide
          </h1>
          <p className="text-neutral-300 text-base max-w-3xl leading-relaxed">
            <GuideInlineText text={intro.split(/(?<=\.)\s+/).slice(0, 2).join(" ")} />
          </p>
        </section>

        {/* Content thickness: Commander overview, how deck wins, key synergies, common mistakes - SSR for indexability */}
        <section className="rounded-2xl border border-fuchsia-400/20 bg-gradient-to-br from-neutral-950/75 via-fuchsia-950/15 to-neutral-900/60 p-5 mb-6 space-y-5 shadow-lg shadow-fuchsia-950/10">
          <h2 className="text-xl font-semibold text-fuchsia-100">Commander overview</h2>
          <p className="text-neutral-300 text-sm leading-relaxed"><GuideInlineText text={intro} /></p>
          {profile && (
            <>
              <h2 className="text-lg font-semibold text-cyan-100 pt-2">How this deck wins</h2>
              <p className="text-neutral-300 text-sm leading-relaxed"><GuideInlineText text={renderHowDeckWins(profile)} /></p>
              <h2 className="text-lg font-semibold text-amber-100 pt-2">Common mistakes</h2>
              <p className="text-neutral-300 text-sm leading-relaxed"><GuideInlineText text={renderCommonMistakes(profile)} /></p>
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

        {communityProfile && <CommunityProfileSection profile={communityProfile} />}

        {profile && <CommanderSynergyTeaser profile={profile} />}

        <CommunityBuildsTabs
          commanderName={name}
          browseUrl={browseUrl}
          recentDecks={recentDecks}
        />

        <SimilarCommanders currentSlug={slug} />

        {/* Popular Archetypes / Strategies - internal links for crawlability */}
        <section className="rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/20 via-neutral-950/60 to-neutral-900/50 p-5 mb-6">
          <h2 className="text-lg font-semibold text-cyan-100 mb-3">
            Popular Archetypes & Strategies
          </h2>
          <p className="text-neutral-400 text-sm mb-3">
            Explore commanders by playstyle and archetype.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/commander-archetypes" className="inline-block px-4 py-2 rounded-lg bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-200 hover:text-cyan-100 text-sm font-medium border border-cyan-400/30">
              Commander Archetypes
            </Link>
            <Link href="/strategies" className="inline-block px-4 py-2 rounded-lg bg-fuchsia-950/35 hover:bg-fuchsia-900/45 text-fuchsia-200 hover:text-fuchsia-100 text-sm font-medium border border-fuchsia-400/30">
              Deck Strategies
            </Link>
            <Link href="/meta/trending-commanders" className="inline-block px-4 py-2 rounded-lg bg-amber-950/35 hover:bg-amber-900/45 text-amber-200 hover:text-amber-100 text-sm font-medium border border-amber-400/30">
              Trending Commanders
            </Link>
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
