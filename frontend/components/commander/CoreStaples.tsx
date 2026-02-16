/**
 * Core Staples (renamed from Most Played Cards).
 * Hides percentages when decks_tracked < threshold to avoid "100% everywhere".
 */

import Link from "next/link";
import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";
import { shouldShowPercentInCoreStaples } from "@/lib/commander-data-confidence";

function norm(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type CardItem = { cardName: string; count: number; percent: number };

type Props = {
  cards: CardItem[];
  commanderName: string;
  deckCount: number;
};

export async function CoreStaples({
  cards,
  commanderName,
  deckCount,
}: Props) {
  if (cards.length === 0) return null;

  const names = cards.map((c) => c.cardName);
  const detailsMap = await getDetailsForNamesCached(names);
  const imageMap = new Map<string, string>();
  for (const [k, v] of detailsMap) {
    const url = v?.image_uris?.small ?? v?.image_uris?.normal;
    if (url) imageMap.set(norm(k), url);
  }

  const showPercent = shouldShowPercentInCoreStaples(deckCount);

  return (
    <section className="rounded-xl border border-neutral-700 bg-neutral-900/50 p-5 mb-6">
      <h2 className="text-lg font-semibold text-neutral-100 mb-3">
        Core Staples
      </h2>
      <p className="text-neutral-400 text-sm mb-4">
        {showPercent
          ? `Top cards across ${deckCount.toLocaleString()} tracked ${commanderName} decks.`
          : `Seen in tracked lists (${deckCount} ${commanderName} deck${deckCount !== 1 ? "s" : ""}).`}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {cards.map((c, i) => {
          const imgUrl = imageMap.get(norm(c.cardName));
          const slug = c.cardName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
          return (
            <Link
              key={c.cardName}
              href={`/cards/${slug}`}
              className="flex items-center gap-3 p-2.5 rounded-lg bg-neutral-900/50 hover:bg-neutral-800/80 border border-transparent hover:border-neutral-600 transition-colors"
            >
              <span className="shrink-0 w-6 text-center text-neutral-500 text-sm font-medium tabular-nums">
                {i + 1}
              </span>
              {imgUrl ? (
                <img
                  src={imgUrl}
                  alt=""
                  className="w-10 h-14 object-cover rounded shrink-0"
                />
              ) : (
                <div className="w-10 h-14 rounded bg-neutral-700 shrink-0" />
              )}
              <span className="text-neutral-200 truncate flex-1 min-w-0">
                {c.cardName}
              </span>
              {showPercent ? (
                <span className="text-neutral-500 text-sm tabular-nums shrink-0">
                  {c.percent}%
                </span>
              ) : (
                <span className="text-neutral-500 text-xs shrink-0">
                  Seen
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
