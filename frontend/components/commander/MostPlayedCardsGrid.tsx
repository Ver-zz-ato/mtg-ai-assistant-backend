/**
 * Compact grid of most-played cards with rank and usage %.
 * Optionally shows tiny thumbnails if images available (SSR batch fetch).
 */

import Link from "next/link";
import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";

function norm(name: string): string {
  return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

type CardItem = { cardName: string; count: number; percent: number };

type Props = {
  cards: CardItem[];
  commanderName: string;
  deckCount: number;
  /** Optional: pre-fetched image map (normalized name -> image url) */
  imageMap?: Map<string, string>;
};

export async function MostPlayedCardsGrid({ cards, commanderName, deckCount }: Omit<Props, "imageMap">) {
  if (cards.length === 0) return null;

  const names = cards.map((c) => c.cardName);
  const detailsMap = await getDetailsForNamesCached(names);
  const imageMap = new Map<string, string>();
  for (const [k, v] of detailsMap) {
    const url = v?.image_uris?.small ?? v?.image_uris?.normal;
    if (url) imageMap.set(norm(k), url);
  }

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-800/60 p-4 mb-6">
      <h2 className="text-lg font-semibold text-neutral-100 mb-3">Most Played Cards</h2>
      <p className="text-neutral-400 text-sm mb-4">
        Top cards across {deckCount} public {commanderName} decks.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {cards.map((c, i) => {
          const imgUrl = imageMap.get(norm(c.cardName));
          const slug = c.cardName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          return (
            <Link
              key={c.cardName}
              href={`/cards/${slug}`}
              className="flex items-center gap-3 p-2 rounded-lg bg-neutral-900/50 hover:bg-neutral-800/80 border border-transparent hover:border-neutral-600 transition-colors"
            >
              <span className="shrink-0 w-6 text-center text-neutral-500 text-sm font-medium tabular-nums">
                {i + 1}
              </span>
              {imgUrl ? (
                <img
                  src={imgUrl}
                  alt=""
                  className="w-8 h-11 object-cover rounded shrink-0"
                />
              ) : (
                <div className="w-8 h-11 rounded bg-neutral-700 shrink-0" />
              )}
              <span className="text-neutral-200 truncate flex-1 min-w-0">{c.cardName}</span>
              <span className="text-neutral-500 text-sm tabular-nums shrink-0">{c.percent}%</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
