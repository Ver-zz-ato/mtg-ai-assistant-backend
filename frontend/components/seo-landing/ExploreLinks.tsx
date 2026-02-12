import Link from "next/link";

export function ExploreLinks() {
  return (
    <div className="rounded-xl border border-neutral-700 bg-neutral-900/50 p-6">
      <h2 className="text-xl font-semibold text-white mb-4">Explore ManaTap</h2>
      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/tools" className="text-cyan-400 hover:underline">Tools</Link>
        <Link href="/commanders" className="text-cyan-400 hover:underline">Commanders</Link>
        <Link href="/cards" className="text-cyan-400 hover:underline">Top Cards</Link>
        <Link href="/commander-archetypes" className="text-cyan-400 hover:underline">Archetypes</Link>
        <Link href="/strategies" className="text-cyan-400 hover:underline">Strategies</Link>
        <Link href="/meta" className="text-cyan-400 hover:underline">Meta Signals</Link>
                <Link href="/decks/browse" className="text-cyan-400 hover:underline">Browse Decks</Link>
      </div>
    </div>
  );
}
