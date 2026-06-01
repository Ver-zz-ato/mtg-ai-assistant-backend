import Link from "next/link";
import CardDetailLink from "@/components/cards/CardDetailLink";

type InternalLinkBlocksProps = {
  commanders: Array<{ slug: string; name: string }>;
  cards: Array<{ slug: string; name: string }>;
  metaLinks: Array<{ href: string; label: string }>;
};

export function InternalLinkBlocks({ commanders, cards, metaLinks }: InternalLinkBlocksProps) {
  return (
    <div className="grid gap-6 sm:grid-cols-3 mb-8">
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
        <h2 className="text-lg font-semibold text-white mb-3">Global Cards</h2>
        <ul className="flex flex-wrap gap-2">
          {cards.map(({ slug, name }) => (
            <li key={slug}>
              <CardDetailLink cardName={name} className="text-cyan-400 hover:underline text-sm">
                {name}
              </CardDetailLink>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-neutral-700 bg-neutral-900/50 p-6">
        <h2 className="text-lg font-semibold text-white mb-3">Meta Links</h2>
        <ul className="flex flex-wrap gap-2">
          {metaLinks.map(({ href, label }) => (
            <li key={href}>
              <Link href={href} className="text-cyan-400 hover:underline text-sm">
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
