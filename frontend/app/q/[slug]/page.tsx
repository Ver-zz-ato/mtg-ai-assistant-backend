import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { getSeoPageBySlug } from "@/lib/seo-pages";
import { getCommanderBySlug, getFirst50CommanderSlugs } from "@/lib/commanders";
import { getTopCards } from "@/lib/top-cards";
import { CommanderMulliganLanding } from "@/components/seo-landing/CommanderMulliganLanding";
import { CommanderBudgetLanding } from "@/components/seo-landing/CommanderBudgetLanding";
import { CommanderCostLanding } from "@/components/seo-landing/CommanderCostLanding";
import { CommanderBestCardsLanding } from "@/components/seo-landing/CommanderBestCardsLanding";
import { CardPriceLanding } from "@/components/seo-landing/CardPriceLanding";
import { CardDecksLanding } from "@/components/seo-landing/CardDecksLanding";
import { ArchetypeLanding } from "@/components/seo-landing/ArchetypeLanding";
import { StrategyLanding } from "@/components/seo-landing/StrategyLanding";
import { ToolGenericLanding } from "@/components/seo-landing/ToolGenericLanding";
import { GuideGenericLanding } from "@/components/seo-landing/GuideGenericLanding";
import { InternalLinkBlocks } from "@/components/seo-landing/InternalLinkBlocks";
import { SeoLandingAnalytics } from "@/components/seo-landing/SeoLandingAnalytics";
import { CommanderActionBar } from "@/components/commander/CommanderActionBar";
import { getCostLandingData } from "@/lib/seo/cost-landing-data";

const BASE = "https://www.manatap.ai";

function toTitle(s: string): string {
  return s
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getSeoPageBySlug(slug);
  if (!page) return { title: "Not Found | ManaTap AI" };
  return {
    title: `${page.title} | ManaTap`,
    description: page.description,
    alternates: { canonical: `${BASE}/q/${slug}` },
    robots: page.indexing === "noindex" ? { index: false } : undefined,
  };
}

export default async function QueryLandingPage({ params }: Props) {
  const { slug } = await params;
  const page = await getSeoPageBySlug(slug);
  if (!page) notFound();

  if (page.resolved_url) {
    const url = page.resolved_url.startsWith("/") ? `${BASE}${page.resolved_url}` : page.resolved_url;
    permanentRedirect(url);
  }

  const p = page;

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: BASE },
      { "@type": "ListItem", position: 2, name: "Guides", item: `${BASE}/q` },
      { "@type": "ListItem", position: 3, name: p.title, item: `${BASE}/q/${slug}` },
    ],
  };

  const commanderName = p.commander_slug ? (getCommanderBySlug(p.commander_slug)?.name ?? toTitle(p.commander_slug)) : null;

  const commanderSlugs = getFirst50CommanderSlugs();
  const topCards = await getTopCards();
  const commanderNames = new Map(commanderSlugs.map((s) => [s, getCommanderBySlug(s)?.name ?? toTitle(s)]));

  const costData = p.template === "commander_cost" && p.commander_slug
    ? await getCostLandingData(p.commander_slug)
    : { costSnapshot: null, costDrivers: [], deckCount: 0 };

  function renderContent() {
    switch (p.template) {
      case "commander_mulligan":
        return commanderName && p.commander_slug ? (
          <CommanderMulliganLanding commanderSlug={p.commander_slug} commanderName={commanderName} query={p.query} slug={slug} />
        ) : (
          <GuideGenericLanding query={p.query} slug={slug} />
        );
      case "commander_budget":
        return commanderName && p.commander_slug ? (
          <CommanderBudgetLanding commanderSlug={p.commander_slug} commanderName={commanderName} query={p.query} slug={slug} />
        ) : (
          <GuideGenericLanding query={p.query} slug={slug} />
        );
      case "commander_cost":
        return commanderName && p.commander_slug ? (
          <CommanderCostLanding commanderSlug={p.commander_slug} commanderName={commanderName} query={p.query} slug={slug} costData={costData} />
        ) : (
          <GuideGenericLanding query={p.query} slug={slug} />
        );
      case "commander_best_cards":
        return commanderName && p.commander_slug ? (
          <CommanderBestCardsLanding commanderSlug={p.commander_slug} commanderName={commanderName} query={p.query} slug={slug} />
        ) : (
          <GuideGenericLanding query={p.query} slug={slug} />
        );
      case "card_price":
        return p.card_name ? (
          <CardPriceLanding cardName={p.card_name} cardSlug={slug.replace(/-price$/, "")} query={p.query} slug={slug} />
        ) : (
          <GuideGenericLanding query={p.query} slug={slug} />
        );
      case "card_decks":
        return p.card_name ? (
          <CardDecksLanding cardName={p.card_name} cardSlug={slug.replace(/-decks$/, "")} query={p.query} slug={slug} />
        ) : (
          <GuideGenericLanding query={p.query} slug={slug} />
        );
      case "archetype":
        return p.archetype_slug ? <ArchetypeLanding archetypeSlug={p.archetype_slug} query={p.query} slug={slug} /> : <GuideGenericLanding query={p.query} slug={slug} />;
      case "strategy":
        return p.strategy_slug ? <StrategyLanding strategySlug={p.strategy_slug} query={p.query} slug={slug} /> : <GuideGenericLanding query={p.query} slug={slug} />;
      case "tool_generic":
        return <ToolGenericLanding query={p.query} slug={slug} />;
      default:
        return <GuideGenericLanding query={p.query} slug={slug} />;
    }
  }

  const showActionBar = p.commander_slug && commanderName && ["commander_cost", "commander_budget", "commander_mulligan", "commander_best_cards"].includes(p.template ?? "");

  return (
    <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {showActionBar && p.commander_slug && (
        <CommanderActionBar commanderSlug={p.commander_slug} commanderName={commanderName} />
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <SeoLandingAnalytics page={p} slug={slug} />
      <article className="text-neutral-200">
        <nav className="text-sm text-neutral-400 mb-4">
          <Link href="/" className="hover:text-white">Home</Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-200">{p.title}</span>
        </nav>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">{p.title}</h1>
        {p.template === "commander_cost" && commanderName && (
          <p className="text-lg font-semibold text-neutral-200 mb-4">
            {costData.costSnapshot
              ? `Typical ${commanderName} decks cost between $${costData.costSnapshot.budget.toLocaleString()} and $${costData.costSnapshot.high.toLocaleString()} depending on build power.`
              : "Typical decks vary widely depending on build power and staples."}
          </p>
        )}
        {renderContent()}
        <InternalLinkBlocks commanderSlugs={commanderSlugs} commanderNames={commanderNames} topCards={topCards} />
      </article>
    </main>
  );
}
