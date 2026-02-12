import Link from "next/link";
import { CTAPanel } from "./CTAPanel";
import { ExploreLinks } from "./ExploreLinks";

type Props = {
  query: string;
  slug: string;
};

export function ToolGenericLanding({ query, slug }: Props) {
  const intro = `ManaTap provides free MTG tools for Commander players. The Mulligan Simulator lets you simulate thousands of opening hands with London mulligan rules. See keep rates for 7-, 6-, and 5-card hands based on your deck's land count and success criteria.

The Probability Calculator answers hypergeometric questions: "What are the odds I draw Sol Ring by turn 2?" or "How many copies of my combo piece do I need?" Set deck size, hits, and turns to get instant results.

Cost to Finish estimates how much you need to spend to complete a deck. Paste a decklist or load from your account. Subtract cards you own to see your true cost. The Budget Swap tool finds cheaper alternatives for expensive cards. All tools work without signup—paste your decklist and get results.`;

  return (
    <>
      <div className="text-neutral-300 mb-8 space-y-4 text-lg leading-relaxed">
        {intro.split(/\n\n+/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <CTAPanel template="tool_generic" slug={slug} />
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-neutral-100 mb-4">Tools</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/tools/mulligan" className="text-cyan-400 hover:underline">Mulligan Simulator</Link>
          <Link href="/tools/probability" className="text-cyan-400 hover:underline">Probability Calculator</Link>
          <Link href="/collections/cost-to-finish" className="text-cyan-400 hover:underline">Cost to Finish</Link>
          <Link href="/deck/swap-suggestions" className="text-cyan-400 hover:underline">Budget Swaps</Link>
        </div>
      </div>
      <ExploreLinks />
    </>
  );
}
