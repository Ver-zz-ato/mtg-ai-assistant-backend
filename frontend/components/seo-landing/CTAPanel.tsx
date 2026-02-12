import Link from "next/link";

type CTAPanelProps = {
  commanderSlug?: string | null;
  cardSlug?: string | null;
  template: string;
  slug: string;
};

export function CTAPanel({ commanderSlug, cardSlug, template, slug }: CTAPanelProps) {
  const browseUrl = commanderSlug
    ? `/decks/browse?search=${encodeURIComponent(commanderSlug.replace(/-/g, " "))}`
    : "/decks/browse";
  const mulliganUrl = commanderSlug ? `/tools/mulligan?commander=${commanderSlug}` : "/tools/mulligan";
  const costUrl = commanderSlug ? `/collections/cost-to-finish?commander=${commanderSlug}` : "/collections/cost-to-finish";
  const swapsUrl = commanderSlug ? `/deck/swap-suggestions?commander=${commanderSlug}` : "/deck/swap-suggestions";

  return (
    <div className="rounded-xl border border-neutral-700 bg-neutral-900/80 p-6 mb-8">
      <h2 className="text-xl font-semibold text-white mb-4">Try ManaTap Tools</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href={browseUrl}
          className="block p-4 rounded-lg bg-neutral-800/80 border border-neutral-700 hover:border-cyan-500 transition-colors"
          data-cta="browse"
        >
          <h3 className="font-semibold text-white mb-1">Browse Decks</h3>
          <p className="text-sm text-neutral-400">See real Commander decks</p>
        </Link>
        <Link
          href={mulliganUrl}
          className="block p-4 rounded-lg bg-neutral-800/80 border border-neutral-700 hover:border-cyan-500 transition-colors"
          data-cta="mulligan"
        >
          <h3 className="font-semibold text-white mb-1">Mulligan Simulator</h3>
          <p className="text-sm text-neutral-400">London mulligan keep rates</p>
        </Link>
        <Link
          href={costUrl}
          className="block p-4 rounded-lg bg-neutral-800/80 border border-neutral-700 hover:border-cyan-500 transition-colors"
          data-cta="cost_to_finish"
        >
          <h3 className="font-semibold text-white mb-1">Cost to Finish</h3>
          <p className="text-sm text-neutral-400">Estimate deck cost</p>
        </Link>
        <Link
          href={swapsUrl}
          className="block p-4 rounded-lg bg-neutral-800/80 border border-neutral-700 hover:border-cyan-500 transition-colors"
          data-cta="swaps"
        >
          <h3 className="font-semibold text-white mb-1">Budget Swaps</h3>
          <p className="text-sm text-neutral-400">Find cheaper alternatives</p>
        </Link>
      </div>
    </div>
  );
}
