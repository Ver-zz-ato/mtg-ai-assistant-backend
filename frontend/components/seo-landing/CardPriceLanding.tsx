import Link from "next/link";
import { CTAPanel } from "./CTAPanel";
import { ExploreLinks } from "./ExploreLinks";

type Props = {
  cardName: string;
  cardSlug: string;
  query: string;
  slug: string;
};

export function CardPriceLanding({ cardName, cardSlug, query, slug }: Props) {
  const intro = `${cardName} price fluctuates with demand, reprints, and format changes. Commander staples like ${cardName} can spike when they're featured in new decks or when supply runs low. To get accurate pricing, check ManaTap's card page and price tracker.

The Card page for ${cardName} shows current price estimates when available. You can browse real Commander decks that use the card to see how popular it is. The Cost to Finish tool lets you estimate the total cost of a decklist including ${cardName}.

Use the Budget Swap tool to find cheaper alternatives if ${cardName} is outside your budget. ManaTap's price data refreshes regularly so you can plan purchases at the right time. Check the price tracker for historical trends.`;

  return (
    <>
      <div className="text-neutral-300 mb-8 space-y-4 text-lg leading-relaxed">
        {intro.split(/\n\n+/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <CTAPanel cardSlug={cardSlug} template="card_price" slug={slug} />
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-neutral-100 mb-4">More for {cardName}</h2>
        <div className="flex flex-wrap gap-3">
          <Link href={`/cards/${cardSlug}`} className="text-cyan-400 hover:underline">
            {cardName} Card Page
          </Link>
          <Link href="/price-tracker" className="text-cyan-400 hover:underline">
            Price Tracker
          </Link>
          <Link href={`/decks/browse?search=${encodeURIComponent(cardName)}`} className="text-cyan-400 hover:underline">
            Decks with {cardName}
          </Link>
        </div>
      </div>
      <ExploreLinks />
    </>
  );
}
