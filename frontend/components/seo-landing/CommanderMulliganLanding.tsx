import Link from "next/link";
import { CTAPanel } from "./CTAPanel";
import { ExploreLinks } from "./ExploreLinks";
import type { GlobalMetaCommanderEntity } from "@/lib/meta/global-meta-entities";

type Props = {
  commanderSlug: string;
  commanderName: string;
  query: string;
  slug: string;
  metaFacts?: GlobalMetaCommanderEntity | null;
};

export function CommanderMulliganLanding({
  commanderSlug,
  commanderName,
  query,
  slug,
  metaFacts,
}: Props) {
  const rankLine = metaFacts?.mostPlayedRank
    ? `${commanderName} sits around rank #${metaFacts.mostPlayedRank} in the current commander meta, so there is a meaningful sample of deck patterns behind mulligan advice for it.`
    : `The ${commanderName} mulligan is a critical decision in Commander.`;
  const trendLine = metaFacts?.isTrending
    ? `${commanderName} is also trending, which usually means more players are tuning openers and early-game sequencing right now.`
    : `Your opening hand can make or break the game. You need enough lands to hit your curve, ramp to accelerate, and key cards to advance your strategy.`;
  const intro = `${rankLine} ${trendLine} The London mulligan lets you put any number of cards on the bottom and draw back up to seven. In Commander, your first mulligan is free, so use it wisely.

With ${commanderName}, your mulligan priorities depend on your deck's curve and strategy. Most decks want at least two or three lands in the opener. If you are running aggressive ramp, you might keep a hand with a mana rock and fewer lands. If your strategy requires specific combo pieces, weigh the odds of drawing them versus keeping a solid mana base.

ManaTap's Mulligan Simulator lets you simulate thousands of opening hands for your exact deck. Set your deck size, land count, and success criteria. You will see keep rates for 7-, 6-, and 5-card hands so you can optimize your mulligan decisions. Try it with your ${commanderName} deck to see how often you will keep with the right mix of lands and ramp.`;

  return (
    <>
      <div className="text-neutral-300 mb-8 space-y-4 text-lg leading-relaxed">
        {intro.split(/\n\n+/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <CTAPanel commanderSlug={commanderSlug} template="commander_mulligan" slug={slug} />
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-neutral-100 mb-4">More for {commanderName}</h2>
        <div className="flex flex-wrap gap-3">
          <Link href={`/commanders/${commanderSlug}`} className="text-cyan-400 hover:underline">
            {commanderName} Hub
          </Link>
          <Link href={`/commanders/${commanderSlug}/mulligan-guide`} className="text-cyan-400 hover:underline">
            Mulligan Guide
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
