/**
 * Core Staples (renamed from Most Played Cards).
 * Hides percentages when decks_tracked < threshold to avoid "100% everywhere".
 */

import CardDetailLink from "@/components/cards/CardDetailLink";
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

const BASIC_LAND_NAMES = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes"]);

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
  const imageMap = new Map<string, { small?: string; normal?: string }>();
  const landNames = new Set<string>();
  for (const [k, v] of detailsMap) {
    const typeLine = String(v?.type_line ?? "").toLowerCase();
    if (typeLine.includes("land")) {
      landNames.add(norm(k));
      continue;
    }
    const small = v?.image_uris?.small;
    const normal = v?.image_uris?.normal;
    if (small || normal) imageMap.set(norm(k), { small, normal });
  }
  const displayCards = cards
    .filter((card) => {
      const key = norm(card.cardName);
      return !BASIC_LAND_NAMES.has(key) && !landNames.has(key);
    })
    .slice(0, 12);
  if (displayCards.length === 0) return null;

  const showPercent = shouldShowPercentInCoreStaples(deckCount);

  return (
    <section className="rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-950/25 via-neutral-950/60 to-neutral-900/50 p-5 mb-6 shadow-lg shadow-emerald-950/10">
      <h2 className="text-lg font-semibold text-emerald-100 mb-3">
        Core Staples
      </h2>
      <p className="text-neutral-400 text-sm mb-4">
        {showPercent
          ? `Top cards across ${deckCount.toLocaleString()} tracked ${commanderName} decks.`
          : `Early ManaTap sample for ${commanderName}; percentages unlock once the sample is larger.`}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {displayCards.map((c, i) => {
          const image = imageMap.get(norm(c.cardName));
          const imgUrl = image?.small ?? image?.normal;
          return (
            <CardDetailLink
              key={c.cardName}
              cardName={c.cardName}
              imageSmall={image?.small}
              imageNormal={image?.normal}
              title={c.cardName}
              className="flex w-full items-center gap-3 p-2.5 rounded-xl bg-black/35 hover:bg-emerald-950/35 border border-white/5 hover:border-emerald-300/35 transition-colors text-left"
            >
              <span className="shrink-0 w-6 text-center text-neutral-500 text-sm font-medium tabular-nums">
                {i + 1}
              </span>
              {imgUrl ? (
                <img
                  src={imgUrl}
                  alt=""
                className="w-10 h-14 object-cover rounded-md shrink-0 shadow-md shadow-black/40"
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
            </CardDetailLink>
          );
        })}
      </div>
    </section>
  );
}
