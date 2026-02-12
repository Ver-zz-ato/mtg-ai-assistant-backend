import Link from "next/link";
import { CTAPanel } from "./CTAPanel";
import { ExploreLinks } from "./ExploreLinks";

type Props = {
  query: string;
  slug: string;
};

export function GuideGenericLanding({ query, slug }: Props) {
  const intro = `ManaTap is your free Commander resource. Browse decks, optimize your mulligan, estimate deck costs, and find budget swaps. All tools work without signup—paste your decklist and get instant results.

The Mulligan Simulator lets you simulate thousands of opening hands with London mulligan rules. See keep rates for 7-, 6-, and 5-card hands. The Probability Calculator answers draw-odds questions with hypergeometric math. Cost to Finish estimates how much you need to spend to complete a deck. Budget Swaps finds cheaper alternatives for expensive cards.

Explore Commander archetypes, strategies, and meta signals. Browse top commanders and cards. See what the community is playing and build your deck with data-driven tools.`;

  return (
    <>
      <div className="text-neutral-300 mb-8 space-y-4 text-lg leading-relaxed">
        {intro.split(/\n\n+/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <CTAPanel template="guide_generic" slug={slug} />
      <ExploreLinks />
    </>
  );
}
