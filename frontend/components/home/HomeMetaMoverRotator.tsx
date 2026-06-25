import HomeMetaMoverRotatorClient, {
  type HomeMetaSpotlightItem,
} from "@/components/home/HomeMetaMoverRotatorClient";
import {
  getExternalMostPlayedCards,
  getExternalMostPlayedCommanders,
  getExternalTrendingCards,
  getExternalTrendingCommanders,
} from "@/lib/meta/externalDailyMeta";
import { formatMetaUpdatedPhrase } from "@/lib/meta/freshness";
import {
  getGlobalMetaCards,
  getGlobalMetaCommanders,
} from "@/lib/meta/global-meta-entities";
import { getImagesForNamesCached } from "@/lib/server/scryfallCache";

function norm(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toSlug(name: string): string {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function freshnessLabel(updatedAt: string | null, snapshotDate: string | null): string | null {
  if (updatedAt) return `Updated ${formatMetaUpdatedPhrase(updatedAt)}`;
  if (snapshotDate) return `Snapshot ${snapshotDate}`;
  return null;
}

function addUniqueItem(
  items: HomeMetaSpotlightItem[],
  seen: Set<string>,
  item: HomeMetaSpotlightItem,
) {
  const key = `${item.kind}:${norm(item.name)}`;
  if (seen.has(key)) return;
  seen.add(key);
  items.push(item);
}

async function getFallbackItems(limit: number): Promise<HomeMetaSpotlightItem[]> {
  const [commanders, cards] = await Promise.all([
    getGlobalMetaCommanders(limit).catch(() => []),
    getGlobalMetaCards(limit).catch(() => []),
  ]);
  const names = [
    ...commanders.slice(0, limit).map((item) => item.name),
    ...cards.slice(0, limit).map((item) => item.name),
  ];
  const imageMap = await getImagesForNamesCached(names).catch(() => new Map());
  const getImage = (name: string) => {
    const details = imageMap.get(norm(name)) ?? imageMap.get(name);
    return details?.art_crop ?? details?.normal ?? details?.small ?? null;
  };

  const items: HomeMetaSpotlightItem[] = [];
  const seen = new Set<string>();
  const max = Math.max(commanders.length, cards.length, limit);

  for (let i = 0; i < max && items.length < limit; i += 1) {
    const commander = commanders[i];
    if (commander) {
      const label = commander.isTrending
        ? `Trending #${commander.trendingRank ?? i + 1}`
        : `Most played #${commander.mostPlayedRank ?? i + 1}`;
      addUniqueItem(items, seen, {
        kind: "commander",
        name: commander.name,
        href: `/commanders/${commander.slug}`,
        imageUrl: getImage(commander.name),
        metaLabel: label,
        description: "Commander meta signal from ManaTap public deck activity.",
      });
    }

    const card = cards[i];
    if (card && items.length < limit) {
      const label = card.isTrending
        ? `Trending #${card.trendingRank ?? i + 1}`
        : `Most played #${card.mostPlayedRank ?? i + 1}`;
      addUniqueItem(items, seen, {
        kind: "card",
        name: card.name,
        href: `/cards/${card.slug}`,
        imageUrl: getImage(card.name),
        metaLabel: label,
        description: "Card meta signal from ManaTap public deck activity.",
      });
    }
  }

  return items;
}

export default async function HomeMetaMoverRotator() {
  const limit = 8;
  const [
    trendingCommanders,
    popularCommanders,
    trendingCards,
    popularCards,
  ] = await Promise.all([
    getExternalTrendingCommanders(limit).catch(() => ({
      items: [],
      imageMap: new Map<string, string>(),
      updatedAt: null,
      snapshotDate: null,
    })),
    getExternalMostPlayedCommanders(limit).catch(() => ({
      items: [],
      imageMap: new Map<string, string>(),
      updatedAt: null,
      snapshotDate: null,
    })),
    getExternalTrendingCards(limit).catch(() => ({
      items: [],
      imageMap: new Map<string, string>(),
      updatedAt: null,
      snapshotDate: null,
    })),
    getExternalMostPlayedCards(limit).catch(() => ({
      items: [],
      imageMap: new Map<string, string>(),
      updatedAt: null,
      snapshotDate: null,
    })),
  ]);

  const commanderImageMap = new Map([
    ...popularCommanders.imageMap,
    ...trendingCommanders.imageMap,
  ]);
  const cardImageMap = new Map([
    ...popularCards.imageMap,
    ...trendingCards.imageMap,
  ]);
  const items: HomeMetaSpotlightItem[] = [];
  const seen = new Set<string>();
  const commanderPool = [
    ...trendingCommanders.items,
    ...popularCommanders.items,
  ];
  const cardPool = [
    ...trendingCards.items,
    ...popularCards.items,
  ];
  const max = Math.max(commanderPool.length, cardPool.length, limit);

  for (let i = 0; i < max && items.length < limit; i += 1) {
    const commander = commanderPool[i];
    if (commander) {
      addUniqueItem(items, seen, {
        kind: "commander",
        name: commander.name,
        href: `/commanders/${commander.slug}`,
        imageUrl: commanderImageMap.get(norm(commander.name)) ?? null,
        metaLabel: commander.metaLabel,
        description: "Commander popularity from external EDHREC-order meta snapshots.",
      });
    }

    const card = cardPool[i];
    if (card && items.length < limit) {
      addUniqueItem(items, seen, {
        kind: "card",
        name: card.name,
        href: `/cards/${toSlug(card.name)}`,
        imageUrl: cardImageMap.get(norm(card.name)) ?? null,
        metaLabel: card.metaLabel,
        description: "Commander staple from external EDHREC-order card snapshots.",
      });
    }
  }

  const spotlightItems = items.length > 0 ? items : await getFallbackItems(limit);
  if (spotlightItems.length === 0) return null;

  const updatedAt =
    trendingCommanders.updatedAt ??
    popularCommanders.updatedAt ??
    trendingCards.updatedAt ??
    popularCards.updatedAt;
  const snapshotDate =
    trendingCommanders.snapshotDate ??
    popularCommanders.snapshotDate ??
    trendingCards.snapshotDate ??
    popularCards.snapshotDate;

  return (
    <HomeMetaMoverRotatorClient
      items={spotlightItems}
      freshness={freshnessLabel(updatedAt, snapshotDate)}
    />
  );
}
