/**
 * Community Builds: merged Popular + Recent decks with tabs.
 */

import Link from "next/link";

type DeckItem = { id: string; title: string; updated_at: string };

type Props = {
  commanderName: string;
  browseUrl: string;
  recentDecks: DeckItem[];
};

export function CommunityBuildsTabs({
  commanderName,
  browseUrl,
  recentDecks,
}: Props) {
  return (
    <section className="rounded-2xl border border-blue-400/25 bg-gradient-to-br from-blue-950/25 via-neutral-950/60 to-neutral-900/50 p-5 mb-6 shadow-lg shadow-blue-950/10">
      <h2 className="text-lg font-semibold text-blue-100 mb-4">
        Community Builds
      </h2>
      <p className="text-neutral-400 text-sm mb-4">
        Explore community decks built around {commanderName} for inspiration and
        proven lists.
      </p>
      {recentDecks.length > 0 ? (
        <ul className="grid gap-2 mb-4 sm:grid-cols-2">
          {recentDecks.map((d) => (
            <li key={d.id} className="rounded-xl border border-white/5 bg-black/30 px-3 py-2.5">
              <Link
                href={`/decks/${d.id}`}
                className="block text-blue-300 hover:text-blue-200 hover:underline font-medium"
              >
                {d.title}
              </Link>
              <span className="text-neutral-500 text-xs">
                {new Date(d.updated_at).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-neutral-500 text-sm mb-4">
          No community decks yet. Be the first to share your {commanderName}{" "}
          list!
        </p>
      )}
      <a
        href={browseUrl}
        className="inline-block px-4 py-2 rounded-lg border border-blue-400/30 bg-blue-950/35 hover:bg-blue-900/45 text-blue-200 font-medium text-sm"
      >
        Browse {commanderName} decks -&gt;
      </a>
    </section>
  );
}
