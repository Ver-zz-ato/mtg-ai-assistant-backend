import Link from "next/link";
import { CTAPanel } from "./CTAPanel";
import { ExploreLinks } from "./ExploreLinks";

type Props = {
  commanderSlug: string;
  commanderName: string;
  query: string;
  slug: string;
};

export function CommanderBestCardsLanding({ commanderSlug, commanderName, query, slug }: Props) {
  const intro = `The best cards for ${commanderName} depend on your strategy and deck construction. Every Commander deck needs core categories: ramp, card draw, removal, and creatures that synergize with your commander. What makes a card "best" for ${commanderName} is how well it supports the commander's unique abilities.

ManaTap's Commander Hub shows top cards for ${commanderName} based on real Commander decks. You can see what other players are running and how often key cards appear. The Best Cards page for each commander highlights staples and synergies specific to that build.

Browse public decks to find inspiration. Use the mulligan simulator to test your opener. The budget swap tool helps you find cheaper alternatives if some cards are too expensive. Build your deck from data-driven suggestions and refine it with ManaTap's free tools.`;

  return (
    <>
      <div className="text-neutral-300 mb-8 space-y-4 text-lg leading-relaxed">
        {intro.split(/\n\n+/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <CTAPanel commanderSlug={commanderSlug} template="commander_best_cards" slug={slug} />
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-neutral-100 mb-4">More for {commanderName}</h2>
        <div className="flex flex-wrap gap-3">
          <Link href={`/commanders/${commanderSlug}`} className="text-cyan-400 hover:underline">
            {commanderName} Hub
          </Link>
          <Link href={`/commanders/${commanderSlug}/best-cards`} className="text-cyan-400 hover:underline">
            Best Cards
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
