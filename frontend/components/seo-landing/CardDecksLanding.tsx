import Link from "next/link";
import { CTAPanel } from "./CTAPanel";
import { ExploreLinks } from "./ExploreLinks";

type Props = {
  cardName: string;
  cardSlug: string;
  query: string;
  slug: string;
};

export function CardDecksLanding({ cardName, cardSlug, query, slug }: Props) {
  const intro = `${cardName} appears in many Commander decks. To see which commanders and strategies use it, browse ManaTap's deck database. The card page for ${cardName} shows top commanders that run the card and how many public decks include it.

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
