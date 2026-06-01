import Link from "next/link";
import CardDetailLink from "@/components/cards/CardDetailLink";
import { CTAPanel } from "./CTAPanel";
import { ExploreLinks } from "./ExploreLinks";
import { CostLandingCalculator } from "./CostLandingCalculator";
import type { CostLandingData } from "@/lib/seo/cost-landing-data";
import type { GlobalMetaCommanderEntity } from "@/lib/meta/global-meta-entities";

type Props = {
  commanderSlug: string;
  commanderName: string;
  query: string;
  slug: string;
  costData: CostLandingData;
  metaFacts?: GlobalMetaCommanderEntity | null;
};

export function CommanderCostLanding({ commanderSlug, commanderName, slug, costData, metaFacts }: Props) {
  const { costSnapshot, costDrivers } = costData;

  const metaLine = metaFacts?.mostPlayedRank
    ? `${commanderName} is currently around rank #${metaFacts.mostPlayedRank} in the most-played commander signal, so this is a commander with a meaningful amount of active deck data behind it.`
    : `How much does a ${commanderName} deck cost? The answer depends on your build.`;
  const trendLine = metaFacts?.isTrending
    ? `${commanderName} is also trending, which can nudge card demand and tighten the spread between budget and tuned builds.`
    : `Commander decks can range from under $50 to thousands of dollars. The cost is driven by the cards you choose—mana staples, tutors, and format-defining cards add up quickly.`;
  const intro = `${metaLine} ${trendLine}

To estimate your deck's cost, you need accurate card prices. ManaTap's Cost to Finish tool uses live price data to calculate the total cost of your decklist. Paste your list or load from your account. You can subtract cards you already own from a collection to see your true cost to finish. Multiple currencies are supported.

The ${commanderName} Commander Hub on ManaTap shows typical deck cost ranges for popular builds when available. You can browse real public decks to see what others are running and get a sense of budget tiers. Use the Cost to Finish tool to plan your purchases and budget swaps to find cheaper alternatives for expensive cards.`;

  return (
    <>
      {/* 1. Cost Snapshot — below H1, only if data */}
      {costSnapshot && (
        <section className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-5 mb-6">
          <h2 className="text-lg font-semibold text-white mb-3">
            Typical {commanderName} deck cost
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-neutral-900/60 p-4 text-center">
              <div className="text-2xl font-bold text-emerald-400">${costSnapshot.budget.toLocaleString()}</div>
              <div className="text-xs text-neutral-400 mt-1">Budget</div>
            </div>
            <div className="rounded-lg bg-neutral-900/60 p-4 text-center">
              <div className="text-2xl font-bold text-white">${costSnapshot.mid.toLocaleString()}</div>
              <div className="text-xs text-neutral-400 mt-1">Mid</div>
            </div>
            <div className="rounded-lg bg-neutral-900/60 p-4 text-center">
              <div className="text-2xl font-bold text-amber-400">${costSnapshot.high.toLocaleString()}</div>
              <div className="text-xs text-neutral-400 mt-1">High</div>
            </div>
          </div>
          <p className="text-xs text-neutral-500 mt-2">
            {costData.deckCount > 0
              ? `Based on ${costData.deckCount.toLocaleString()} tracked decks. Your build may vary.`
              : `Based on public ${commanderName} decks. Your build may vary.`}
          </p>
        </section>
      )}

      {/* 2. Instant Calculator */}
      <CostLandingCalculator commanderSlug={commanderSlug} commanderName={commanderName} />

      {/* 3. Supporting intro text */}
      <div className="text-neutral-300 mb-6 space-y-4 text-lg leading-relaxed">
        {intro.split(/\n\n+/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      {/* 4. Cost Drivers — darker section */}
      {costDrivers.length > 0 && (
        <section className="rounded-xl border border-neutral-700 bg-neutral-900/60 p-5 mb-6">
          <h2 className="text-lg font-semibold text-white mb-3">
            Cards that most increase deck cost
          </h2>
          <ul className="space-y-2">
            {costDrivers.map(({ cardName, usdPrice }) => (
              <li key={cardName} className="flex justify-between items-center text-sm">
                <CardDetailLink cardName={cardName} className="text-cyan-400 hover:underline text-left">
                  {cardName}
                </CardDetailLink>
                <span className="tabular-nums text-neutral-300">~${usdPrice.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 5. Budget Alternatives — link to swap-suggestions */}
      <section className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-5 mb-6">
        <h2 className="text-lg font-semibold text-white mb-3">
          Lower-cost alternatives
        </h2>
        <p className="text-sm text-neutral-300 mb-4">
          Find cheaper alternatives for expensive cards with ManaTap&apos;s Budget Swap tool. Paste your decklist to get AI-powered swap suggestions that maintain your deck&apos;s strategy.
        </p>
        <Link
          href={`/deck/swap-suggestions?commander=${encodeURIComponent(commanderSlug)}`}
          className="inline-block px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium text-sm"
        >
          Find budget swaps →
        </Link>
      </section>

      {/* 6. Related tools (CTAPanel) */}
      <CTAPanel commanderSlug={commanderSlug} template="commander_cost" slug={slug} />

      {/* 7. More for Commander — lighter section */}
      <section className="rounded-xl border border-neutral-700 bg-neutral-800/40 p-5 mb-8">
        <h2 className="text-xl font-semibold text-neutral-100 mb-4">More for {commanderName}</h2>
        <div className="flex flex-wrap gap-3">
          <Link href={`/commanders/${commanderSlug}`} className="text-cyan-400 hover:underline">
            {commanderName} Hub
          </Link>
          <Link href={`/collections/cost-to-finish?commander=${commanderSlug}`} className="text-cyan-400 hover:underline">
            Cost to Finish
          </Link>
          <Link href={`/decks/browse?search=${encodeURIComponent(commanderName)}`} className="text-cyan-400 hover:underline">
            Browse {commanderName} Decks
          </Link>
        </div>
      </section>
      <ExploreLinks />
    </>
  );
}
