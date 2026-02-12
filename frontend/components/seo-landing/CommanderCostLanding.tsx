import Link from "next/link";
import { CTAPanel } from "./CTAPanel";
import { ExploreLinks } from "./ExploreLinks";

type Props = {
  commanderSlug: string;
  commanderName: string;
  query: string;
  slug: string;
};

export function CommanderCostLanding({ commanderSlug, commanderName, query, slug }: Props) {
  const intro = `How much does a ${commanderName} deck cost? The answer depends on your build. Commander decks can range from under $50 to thousands of dollars. The cost is driven by the cards you choose—mana staples, tutors, and format-defining cards add up quickly.

To estimate your deck's cost, you need accurate card prices. ManaTap's Cost to Finish tool uses live price data to calculate the total cost of your decklist. Paste your list or load from your account. You can subtract cards you already own from a collection to see your true cost to finish. Multiple currencies are supported.

The ${commanderName} Commander Hub on ManaTap shows typical deck cost ranges for popular builds when available. You can browse real public decks to see what others are running and get a sense of budget tiers. Use the Cost to Finish tool to plan your purchases and budget swaps to find cheaper alternatives for expensive cards.`;

  return (
    <>
      <div className="text-neutral-300 mb-8 space-y-4 text-lg leading-relaxed">
        {intro.split(/\n\n+/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <CTAPanel commanderSlug={commanderSlug} template="commander_cost" slug={slug} />
      <div className="mb-8">
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
      </div>
      <ExploreLinks />
    </>
  );
}
