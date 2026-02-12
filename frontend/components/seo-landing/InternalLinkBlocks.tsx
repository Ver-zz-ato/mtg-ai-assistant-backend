import Link from "next/link";

type InternalLinkBlocksProps = {
  commanderSlugs: string[];
  commanderNames: Map<string, string>;
  topCards: Array<{ slug: string; card_name: string }>;
};

export function InternalLinkBlocks({ commanderSlugs, commanderNames, topCards }: InternalLinkBlocksProps) {
  const commanders = commanderSlugs.slice(0, 6).map((slug) => ({ slug, name: commanderNames.get(slug) ?? slug.replace(/-/g, " ") }));
  const cards = topCards.slice(0, 6);

  return (
    <div className="grid gap-6 sm:grid-cols-2 mb-8">
      <div className="rounded-xl border border-neutral-700 bg-neutral-900/50 p-6">
        <h2 className="text-lg font-semibold text-white mb-3">Popular Commanders</h2>
        <ul className="flex flex-wrap gap-2">
          {commanders.map(({ slug, name }) => (
            <li key={slug}>
              <Link href={`/commanders/${slug}`} className="text-cyan-400 hover:underline text-sm">
                {name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-neutral-700 bg-neutral-900/50 p-6">
        <h2 className="text-lg font-semibold text-white mb-3">Top Cards</h2>
        <ul className="flex flex-wrap gap-2">
          {cards.map(({ slug, card_name }) => (
            <li key={slug}>
              <Link href={`/cards/${slug}`} className="text-cyan-400 hover:underline text-sm">
                {card_name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
