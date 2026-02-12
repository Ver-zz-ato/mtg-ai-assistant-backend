import Link from "next/link";
import { getStrategyBySlug } from "@/lib/data/strategies";
import { CTAPanel } from "./CTAPanel";
import { ExploreLinks } from "./ExploreLinks";

type Props = {
  strategySlug: string;
  query: string;
  slug: string;
};

export function StrategyLanding({ strategySlug, query, slug }: Props) {
  const strategy = getStrategyBySlug(strategySlug);
  const title = strategy?.title ?? strategySlug;

  const intro = strategy
    ? strategy.intro
    : `The ${strategySlug} strategy is popular in Commander. Browse decks, see top commanders, and use ManaTap's free tools to build and optimize your deck.`;

  return (
    <>
      <div className="text-neutral-300 mb-8 space-y-4 text-lg leading-relaxed">
        {(typeof intro === "string" ? intro.split(/\n\n+/) : [intro]).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <CTAPanel template="strategy" slug={slug} />
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-neutral-100 mb-4">Explore</h2>
        <div className="flex flex-wrap gap-3">
          <Link href={`/strategies/${strategySlug}`} className="text-cyan-400 hover:underline">
            {title} Strategy Hub
          </Link>
          <Link href="/strategies" className="text-cyan-400 hover:underline">
            All Strategies
          </Link>
          <Link href={`/decks/browse?search=${encodeURIComponent(strategySlug)}`} className="text-cyan-400 hover:underline">
            Browse {title} Decks
          </Link>
        </div>
      </div>
      <ExploreLinks />
    </>
  );
}
