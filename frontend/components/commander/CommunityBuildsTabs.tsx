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
    <section className="rounded-xl border border-neutral-700 bg-neutral-900/50 p-5 mb-6">
      <h2 className="text-lg font-semibold text-neutral-100 mb-4">
        Community Builds
      </h2>
      <p className="text-neutral-400 text-sm mb-4">
        Explore community decks built around {commanderName} for inspiration and
        proven lists.
      </p>
      {recentDecks.length > 0 ? (
        <ul className="space-y-2 mb-4">
          {recentDecks.map((d) => (
            <li key={d.id}>
              <Link
                href={`/decks/${d.id}`}
                className="text-blue-400 hover:underline"
              >
                {d.title}
              </Link>
              <span className="text-neutral-500 text-xs ml-2">
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
        className="inline-block px-4 py-2 rounded-lg border border-neutral-600 bg-neutral-800/80 hover:bg-neutral-700 text-blue-400 font-medium text-sm"
      >
        Browse {commanderName} decks →
      </a>
    </section>
  );
}
