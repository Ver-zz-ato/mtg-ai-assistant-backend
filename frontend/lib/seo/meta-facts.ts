import {
  getGlobalMetaCardBySlug,
  getGlobalMetaCards,
  getGlobalMetaCommanderFacts,
  getGlobalMetaCommanders,
  type GlobalMetaCardEntity,
  type GlobalMetaCommanderEntity,
} from "@/lib/meta/global-meta-entities";

export type SeoCardMetaFacts = {
  card: GlobalMetaCardEntity | null;
  relatedCards: GlobalMetaCardEntity[];
};

export type SeoCommanderMetaFacts = {
  commander: GlobalMetaCommanderEntity | null;
  relatedCommanders: GlobalMetaCommanderEntity[];
};

export async function getSeoCardMetaFacts(
  cardName: string,
  cardSlug: string
): Promise<SeoCardMetaFacts> {
  const cards = await getGlobalMetaCards(80);
  const card =
    cards.find((row) => row.slug === cardSlug) ??
    cards.find((row) => row.name.toLowerCase() === cardName.toLowerCase()) ??
    (await getGlobalMetaCardBySlug(cardSlug));

  const relatedCards = cards
    .filter((row) => row.slug !== cardSlug)
    .filter((row) => row.isTrending || (row.mostPlayedRank ?? 999) <= 24)
    .slice(0, 6);

  return { card: card ?? null, relatedCards };
}

export async function getSeoCommanderMetaFacts(
  commanderSlug: string
): Promise<SeoCommanderMetaFacts> {
  const commanders = await getGlobalMetaCommanders(100);
  const commander =
    commanders.find((row) => row.slug === commanderSlug) ??
    (await getGlobalMetaCommanderFacts(commanderSlug));

  const relatedCommanders = commanders
    .filter((row) => row.slug !== commanderSlug)
    .filter((row) => row.isTrending || (row.mostPlayedRank ?? 999) <= 24)
    .slice(0, 6);

  return { commander: commander ?? null, relatedCommanders };
}
