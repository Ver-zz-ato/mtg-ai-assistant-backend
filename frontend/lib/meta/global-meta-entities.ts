import { getCommanderCatalogSlugs, getCommanderBySlug } from "@/lib/commanders";
import { getMetaSignal } from "@/lib/meta-signals";

type NameCountRow = {
  name?: string;
  count?: number;
};

export type GlobalMetaCardEntity = {
  name: string;
  slug: string;
  mostPlayedRank?: number;
  mostPlayedCount?: number;
  trendingRank?: number;
  trendingCount?: number;
  isTrending: boolean;
};

export type GlobalMetaCommanderEntity = {
  name: string;
  slug: string;
  mostPlayedRank?: number;
  mostPlayedCount?: number;
  trendingRank?: number;
  trendingCount?: number;
  isTrending: boolean;
  inCatalog: boolean;
};

function norm(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toSlug(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseRows(data: unknown): Array<{ name: string; count: number }> {
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => ({
      name: String((row as NameCountRow)?.name || "").trim(),
      count:
        typeof (row as NameCountRow)?.count === "number"
          ? Number((row as NameCountRow).count)
          : 0,
    }))
    .filter((row) => row.name.length > 0);
}

export async function getGlobalMetaCards(limit = 200): Promise<GlobalMetaCardEntity[]> {
  const [mostPlayedRaw, trendingRaw] = await Promise.all([
    getMetaSignal("most-played-cards").catch(() => null),
    getMetaSignal("trending-cards").catch(() => null),
  ]);

  const mostPlayed = parseRows(mostPlayedRaw);
  const trending = parseRows(trendingRaw);
  const byNorm = new Map<string, GlobalMetaCardEntity>();
  const order: string[] = [];

  for (let i = 0; i < mostPlayed.length; i += 1) {
    const row = mostPlayed[i];
    const key = norm(row.name);
    if (!key) continue;
    if (!byNorm.has(key)) {
      byNorm.set(key, {
        name: row.name,
        slug: toSlug(row.name),
        mostPlayedRank: i + 1,
        mostPlayedCount: row.count,
        isTrending: false,
      });
      order.push(key);
    } else {
      const existing = byNorm.get(key)!;
      existing.mostPlayedRank = existing.mostPlayedRank ?? i + 1;
      existing.mostPlayedCount = existing.mostPlayedCount ?? row.count;
    }
  }

  for (let i = 0; i < trending.length; i += 1) {
    const row = trending[i];
    const key = norm(row.name);
    if (!key) continue;
    if (!byNorm.has(key)) {
      byNorm.set(key, {
        name: row.name,
        slug: toSlug(row.name),
        trendingRank: i + 1,
        trendingCount: row.count,
        isTrending: true,
      });
      order.push(key);
    } else {
      const existing = byNorm.get(key)!;
      existing.trendingRank = i + 1;
      existing.trendingCount = row.count;
      existing.isTrending = true;
    }
  }

  return order
    .map((key) => byNorm.get(key))
    .filter((row): row is GlobalMetaCardEntity => Boolean(row))
    .slice(0, limit);
}

export async function getGlobalMetaCardBySlug(
  slug: string
): Promise<GlobalMetaCardEntity | null> {
  const cards = await getGlobalMetaCards(400);
  return cards.find((card) => card.slug === slug) ?? null;
}

export async function getGlobalMetaCommanders(
  limit = 100
): Promise<GlobalMetaCommanderEntity[]> {
  const [mostPlayedRaw, trendingRaw] = await Promise.all([
    getMetaSignal("most-played-commanders").catch(() => null),
    getMetaSignal("trending-commanders").catch(() => null),
  ]);

  const mostPlayed = parseRows(mostPlayedRaw);
  const trending = parseRows(trendingRaw);
  const catalog = new Set(getCommanderCatalogSlugs());
  const bySlug = new Map<string, GlobalMetaCommanderEntity>();
  const order: string[] = [];

  for (let i = 0; i < mostPlayed.length; i += 1) {
    const row = mostPlayed[i];
    const slug = getCommanderBySlug(toSlug(row.name))?.slug ?? toSlug(row.name);
    if (!slug) continue;
    if (!bySlug.has(slug)) {
      bySlug.set(slug, {
        name: getCommanderBySlug(slug)?.name ?? row.name,
        slug,
        mostPlayedRank: i + 1,
        mostPlayedCount: row.count,
        isTrending: false,
        inCatalog: catalog.has(slug),
      });
      order.push(slug);
    } else {
      const existing = bySlug.get(slug)!;
      existing.mostPlayedRank = existing.mostPlayedRank ?? i + 1;
      existing.mostPlayedCount = existing.mostPlayedCount ?? row.count;
    }
  }

  for (let i = 0; i < trending.length; i += 1) {
    const row = trending[i];
    const slug = getCommanderBySlug(toSlug(row.name))?.slug ?? toSlug(row.name);
    if (!slug) continue;
    if (!bySlug.has(slug)) {
      bySlug.set(slug, {
        name: getCommanderBySlug(slug)?.name ?? row.name,
        slug,
        trendingRank: i + 1,
        trendingCount: row.count,
        isTrending: true,
        inCatalog: catalog.has(slug),
      });
      order.push(slug);
    } else {
      const existing = bySlug.get(slug)!;
      existing.trendingRank = i + 1;
      existing.trendingCount = row.count;
      existing.isTrending = true;
    }
  }

  for (const slug of getCommanderCatalogSlugs()) {
    if (!bySlug.has(slug)) {
      const profile = getCommanderBySlug(slug);
      if (!profile) continue;
      bySlug.set(slug, {
        name: profile.name,
        slug,
        isTrending: false,
        inCatalog: true,
      });
      order.push(slug);
    }
  }

  return order
    .map((slug) => bySlug.get(slug))
    .filter((row): row is GlobalMetaCommanderEntity => Boolean(row))
    .slice(0, limit);
}

export async function getGlobalMetaCommanderFacts(
  commanderSlug: string
): Promise<GlobalMetaCommanderEntity | null> {
  const commanders = await getGlobalMetaCommanders(200);
  return commanders.find((row) => row.slug === commanderSlug) ?? null;
}
