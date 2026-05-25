import Link from "next/link";
import { CTAPanel } from "./CTAPanel";
import { ExploreLinks } from "./ExploreLinks";
import type { GlobalMetaCardEntity } from "@/lib/meta/global-meta-entities";

type Props = {
  cardName: string;
  cardSlug: string;
  query: string;
  slug: string;
  metaFacts?: GlobalMetaCardEntity | null;
};

export function CardDecksLanding({ cardName, cardSlug, query, slug, metaFacts }: Props) {
  const rankLine = metaFacts?.mostPlayedRank
    ? `${cardName} is one of the most-played cards in the current Commander meta, with a global rank near #${metaFacts.mostPlayedRank}.`
    : `${cardName} appears in many Commander decks.`;
  const trendLine = metaFacts?.isTrending
    ? `It is also showing up in the trending-cards signal, so it is not just a long-term staple - it is active in current deckbuilding too.`
    : `To see which commanders and strategies use it, browse ManaTap's deck database and card pages.`;
  const intro = `${rankLine} ${trendLine}

Use the deck browser to filter by commander or search for specific cards. You'll find real decklists from the community that you can use for inspiration. The mulligan simulator helps you test your opener with ${cardName} in your deck. Cost to Finish estimates how much you need to spend to complete a list.

Whether you're building around ${cardName} or just curious where it fits, ManaTap's tools help you explore the Commander format. Browse decks, check prices, and optimize your build with free tools.`;

  return (
    <>
      <div className="text-neutral-300 mb-8 space-y-4 text-lg leading-relaxed">
        {intro.split(/\n\n+/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <CTAPanel cardSlug={cardSlug} template="card_decks" slug={slug} />
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-neutral-100 mb-4">More for {cardName}</h2>
        <div className="flex flex-wrap gap-3">
          <Link href={`/cards/${cardSlug}`} className="text-cyan-400 hover:underline">
            {cardName} Card Page
          </Link>
          <Link href={`/decks/browse?search=${encodeURIComponent(cardName)}`} className="text-cyan-400 hover:underline">
            Decks with {cardName}
          </Link>
          <Link href="/cards" className="text-cyan-400 hover:underline">
            Top Cards
          </Link>
        </div>
      </div>
      <ExploreLinks />
    </>
  );
}
