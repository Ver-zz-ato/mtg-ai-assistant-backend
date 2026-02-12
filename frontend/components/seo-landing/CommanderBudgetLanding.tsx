import Link from "next/link";
import { CTAPanel } from "./CTAPanel";
import { ExploreLinks } from "./ExploreLinks";

type Props = {
  commanderSlug: string;
  commanderName: string;
  query: string;
  slug: string;
};

export function CommanderBudgetLanding({ commanderSlug, commanderName, query, slug }: Props) {
  const intro = `Building a budget ${commanderName} deck is a great way to get into Commander without breaking the bank. Budget decks can compete at casual tables by focusing on core synergies and avoiding expensive staples. The key is finding the right balance between power and cost.

Start with the commander's core strategy. ${commanderName} has specific strengths—identify the essential cards and look for cheaper alternatives. Mana rocks like Sol Ring and Arcane Signet are affordable; skip Mana Crypt and Mana Vault if you're on a budget. Card draw, removal, and ramp can all be found at low price points if you know where to look.

ManaTap's Budget Swap tool lets you paste your decklist and set a price threshold. It suggests cheaper alternatives for expensive cards while maintaining your deck's strategy. The Cost to Finish tool estimates how much you need to spend to complete a deck, and you can subtract cards you already own. Use these tools to build a budget-friendly ${commanderName} deck that still performs.`;

  return (
    <>
      <div className="text-neutral-300 mb-8 space-y-4 text-lg leading-relaxed">
        {intro.split(/\n\n+/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <CTAPanel commanderSlug={commanderSlug} template="commander_budget" slug={slug} />
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-neutral-100 mb-4">More for {commanderName}</h2>
        <div className="flex flex-wrap gap-3">
          <Link href={`/commanders/${commanderSlug}`} className="text-cyan-400 hover:underline">
            {commanderName} Hub
          </Link>
          <Link href={`/commanders/${commanderSlug}/budget-upgrades`} className="text-cyan-400 hover:underline">
            Budget Upgrades
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
