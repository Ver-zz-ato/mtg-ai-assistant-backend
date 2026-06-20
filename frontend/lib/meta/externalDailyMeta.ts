import type { SupabaseClient } from "@supabase/supabase-js";
import { getCommanderBySlug } from "@/lib/commanders";
import { getImagesForNamesCached } from "@/lib/server/scryfallCache";
import { getAdmin } from "@/lib/supa";
import { createClient } from "@/lib/supabase/server";
import { fetchGlobalBudgetCommanders, SCRYFALL_META } from "@/lib/meta/scryfallGlobalMeta";
import {
  blendCommanderMetaWithExternalProfiles,
  fetchApprovedExternalCommanderProfiles,
  readPublicCommanderExternalMetaFlags,
} from "@/lib/meta/publicCommanderExternalBlend";

type MetaTable = "meta_commander_daily" | "meta_card_daily";

type DailyCommanderRow = {
  commander_name?: string | null;
  commander_name_norm?: string | null;
  rank?: number | null;
  snapshot_date?: string | null;
  updated_at?: string | null;
};

type PriceCacheRow = {
  card_name?: string | null;
  usd_price?: number | string | null;
};

type DailyCardRow = {
  card_name?: string | null;
  card_name_norm?: string | null;
  rank?: number | null;
  snapshot_date?: string | null;
  updated_at?: string | null;
};

export type ExternalCommanderMetaItem = {
  name: string;
  slug: string;
  rank: number;
  rankDelta?: number;
  metaLabel: string;
};

export type ExternalCardMetaItem = {
  name: string;
  rank: number;
  rankDelta?: number;
  metaLabel: string;
};

function norm(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function priceCacheKey(name: string): string {
  return norm(name).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

async function getDb(): Promise<SupabaseClient> {
  try {
    return getAdmin();
  } catch {
    return createClient() as Promise<SupabaseClient>;
  }
}

async function latestSnapshotDate(db: SupabaseClient, table: MetaTable, timeWindow: string): Promise<string | null> {
  const { data } = await db
    .from(table)
    .select("snapshot_date")
    .eq("source", SCRYFALL_META.source)
    .eq("time_window", timeWindow)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { snapshot_date?: string | null } | null)?.snapshot_date ?? null;
}

async function previousSnapshotDate(
  db: SupabaseClient,
  table: MetaTable,
  timeWindow: string,
  current: string
): Promise<string | null> {
  const { data } = await db
    .from(table)
    .select("snapshot_date")
    .eq("source", SCRYFALL_META.source)
    .eq("time_window", timeWindow)
    .lt("snapshot_date", current)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { snapshot_date?: string | null } | null)?.snapshot_date ?? null;
}

function rankLabel(rank: number): string {
  return `EDHREC rank #${rank.toLocaleString()}`;
}

function budgetRankLabel(rank: number): string {
  return `Budget EDHREC rank #${rank.toLocaleString()}`;
}

function trendLabel(rank: number, delta?: number): string {
  return delta && delta > 0 ? `Up ${delta.toLocaleString()} rank${delta !== 1 ? "s" : ""}` : rankLabel(rank);
}

async function commanderImages(items: ExternalCommanderMetaItem[]) {
  const detailsMap = await getImagesForNamesCached(items.map((item) => item.name));
  const imageMap = new Map<string, string>();
  for (const [key, value] of detailsMap) {
    const url = value?.art_crop ?? value?.normal ?? value?.small;
    if (url) imageMap.set(norm(key), url);
  }
  return imageMap;
}

async function maybeBlendWebsiteCommanderMeta(
  db: SupabaseClient,
  items: ExternalCommanderMetaItem[]
): Promise<ExternalCommanderMetaItem[]> {
  try {
    const flags = await readPublicCommanderExternalMetaFlags(db);
    if (!flags.websiteCommanderMetaPages) return items;
    const profiles = await fetchApprovedExternalCommanderProfiles(db, items.map((item) => item.name));
    const result = blendCommanderMetaWithExternalProfiles(items, profiles, flags.weight);
    return result.items as ExternalCommanderMetaItem[];
  } catch {
    return items;
  }
}

async function cardImages(items: ExternalCardMetaItem[]) {
  const detailsMap = await getImagesForNamesCached(items.map((item) => item.name));
  const imageMap = new Map<string, string>();
  for (const [key, value] of detailsMap) {
    const url = value?.art_crop ?? value?.normal ?? value?.small;
    if (url) imageMap.set(norm(key), url);
  }
  return imageMap;
}

export async function getExternalMostPlayedCommanders(limit = 48): Promise<{
  items: ExternalCommanderMetaItem[];
  imageMap: Map<string, string>;
  updatedAt: string | null;
  snapshotDate: string | null;
}> {
  const db = await getDb();
  const snapshotDate = await latestSnapshotDate(db, "meta_commander_daily", SCRYFALL_META.twPopular);
  if (!snapshotDate) return { items: [], imageMap: new Map(), updatedAt: null, snapshotDate: null };

  const { data } = await db
    .from("meta_commander_daily")
    .select("commander_name, rank, updated_at")
    .eq("source", SCRYFALL_META.source)
    .eq("time_window", SCRYFALL_META.twPopular)
    .eq("snapshot_date", snapshotDate)
    .order("rank", { ascending: true })
    .limit(limit);

  const rows = (data ?? []) as DailyCommanderRow[];
  const items = rows
    .map((row) => {
      const name = String(row.commander_name || "").trim();
      const rank = typeof row.rank === "number" ? row.rank : 0;
      if (!name || rank <= 0) return null;
      const slug = getCommanderBySlug(toSlug(name))?.slug ?? toSlug(name);
      return { name, slug, rank, metaLabel: rankLabel(rank) };
    })
    .filter((row): row is ExternalCommanderMetaItem => Boolean(row));

  const blendedItems = await maybeBlendWebsiteCommanderMeta(db, items);

  return {
    items: blendedItems,
    imageMap: await commanderImages(blendedItems),
    updatedAt: rows.find((row) => row.updated_at)?.updated_at ?? null,
    snapshotDate,
  };
}

export async function getExternalTrendingCommanders(limit = 48): Promise<{
  items: ExternalCommanderMetaItem[];
  imageMap: Map<string, string>;
  updatedAt: string | null;
  snapshotDate: string | null;
}> {
  const db = await getDb();
  const snapshotDate = await latestSnapshotDate(db, "meta_commander_daily", SCRYFALL_META.twPopular);
  if (!snapshotDate) return { items: [], imageMap: new Map(), updatedAt: null, snapshotDate: null };
  const previousDate = await previousSnapshotDate(db, "meta_commander_daily", SCRYFALL_META.twPopular, snapshotDate);

  const [currentResult, previousResult] = await Promise.all([
    db
      .from("meta_commander_daily")
      .select("commander_name, commander_name_norm, rank, updated_at")
      .eq("source", SCRYFALL_META.source)
      .eq("time_window", SCRYFALL_META.twPopular)
      .eq("snapshot_date", snapshotDate)
      .order("rank", { ascending: true })
      .limit(300),
    previousDate
      ? db
          .from("meta_commander_daily")
          .select("commander_name_norm, rank")
          .eq("source", SCRYFALL_META.source)
          .eq("time_window", SCRYFALL_META.twPopular)
          .eq("snapshot_date", previousDate)
      : Promise.resolve({ data: [] }),
  ]);

  const prevRank = new Map<string, number>();
  for (const row of (previousResult.data ?? []) as DailyCommanderRow[]) {
    if (row.commander_name_norm && typeof row.rank === "number") prevRank.set(row.commander_name_norm, row.rank);
  }

  const rows = (currentResult.data ?? []) as DailyCommanderRow[];
  const scored: ExternalCommanderMetaItem[] = [];
  for (const row of rows) {
    const name = String(row.commander_name || "").trim();
    const rank = typeof row.rank === "number" ? row.rank : 0;
    const key = String(row.commander_name_norm || norm(name));
    if (!name || rank <= 0) continue;
    const delta = (prevRank.get(key) ?? rank) - rank;
    const slug = getCommanderBySlug(toSlug(name))?.slug ?? toSlug(name);
    scored.push({
      name,
      slug,
      rank,
      ...(delta > 0 ? { rankDelta: delta } : {}),
      metaLabel: trendLabel(rank, delta),
    });
  }

  const positive = scored.filter((row) => (row.rankDelta ?? 0) > 0);
  const items = (positive.length > 0 ? positive : scored)
    .sort((a, b) => (b.rankDelta ?? 0) - (a.rankDelta ?? 0) || a.rank - b.rank)
    .slice(0, limit);
  const blendedItems = await maybeBlendWebsiteCommanderMeta(db, items);

  return {
    items: blendedItems,
    imageMap: await commanderImages(blendedItems),
    updatedAt: rows.find((row) => row.updated_at)?.updated_at ?? null,
    snapshotDate,
  };
}

export async function getExternalBudgetCommanders(limit = 48): Promise<{
  items: ExternalCommanderMetaItem[];
  imageMap: Map<string, string>;
  updatedAt: string | null;
  snapshotDate: string | null;
}> {
  const db = await getDb();
  const snapshotDate = await latestSnapshotDate(db, "meta_commander_daily", SCRYFALL_META.twBudget);

  if (snapshotDate) {
    const { data } = await db
      .from("meta_commander_daily")
      .select("commander_name, rank, updated_at")
      .eq("source", SCRYFALL_META.source)
      .eq("time_window", SCRYFALL_META.twBudget)
      .eq("snapshot_date", snapshotDate)
      .order("rank", { ascending: true })
      .limit(limit);

    const rows = (data ?? []) as DailyCommanderRow[];
    const items = rows
      .map((row) => {
        const name = String(row.commander_name || "").trim();
        const rank = typeof row.rank === "number" ? row.rank : 0;
        if (!name || rank <= 0) return null;
        const slug = getCommanderBySlug(toSlug(name))?.slug ?? toSlug(name);
        return { name, slug, rank, metaLabel: budgetRankLabel(rank) };
      })
      .filter((row): row is ExternalCommanderMetaItem => Boolean(row));

    return {
      items,
      imageMap: await commanderImages(items),
      updatedAt: rows.find((row) => row.updated_at)?.updated_at ?? null,
      snapshotDate,
    };
  }

  const popularSnapshotDate = await latestSnapshotDate(db, "meta_commander_daily", SCRYFALL_META.twPopular);
  if (!popularSnapshotDate) return { items: [], imageMap: new Map(), updatedAt: null, snapshotDate: null };

  const { data: popularRows } = await db
    .from("meta_commander_daily")
    .select("commander_name, rank, updated_at")
    .eq("source", SCRYFALL_META.source)
    .eq("time_window", SCRYFALL_META.twPopular)
    .eq("snapshot_date", popularSnapshotDate)
    .order("rank", { ascending: true })
    .limit(300);

  const rows = (popularRows ?? []) as DailyCommanderRow[];
  const priceKeys = Array.from(new Set(rows.map((row) => priceCacheKey(String(row.commander_name || ""))).filter(Boolean)));
  const { data: priceRows } = priceKeys.length
    ? await db.from("price_cache").select("card_name, usd_price").in("card_name", priceKeys)
    : { data: [] };

  const priceMap = new Map<string, number>();
  for (const row of (priceRows ?? []) as PriceCacheRow[]) {
    const key = String(row.card_name || "");
    const price = Number(row.usd_price);
    if (key && Number.isFinite(price) && price > 0) priceMap.set(key, price);
  }

  const items = rows
    .map((row) => {
      const name = String(row.commander_name || "").trim();
      const rank = typeof row.rank === "number" ? row.rank : 0;
      const price = priceMap.get(priceCacheKey(name));
      if (!name || rank <= 0 || price == null || price > 5) return null;
      const slug = getCommanderBySlug(toSlug(name))?.slug ?? toSlug(name);
      return { name, slug, rank, metaLabel: budgetRankLabel(rank) };
    })
    .filter((row): row is ExternalCommanderMetaItem => Boolean(row))
    .slice(0, limit);

  if (items.length === 0) {
    const liveRows = await fetchGlobalBudgetCommanders(2);
    const now = new Date().toISOString();
    const liveItems = liveRows.slice(0, limit).map((row) => {
      const slug = getCommanderBySlug(toSlug(row.name))?.slug ?? toSlug(row.name);
      return {
        name: row.name,
        slug,
        rank: row.rank,
        metaLabel: budgetRankLabel(row.rank),
      };
    });

    return {
      items: liveItems,
      imageMap: await commanderImages(liveItems),
      updatedAt: now,
      snapshotDate: now.slice(0, 10),
    };
  }

  return {
    items,
    imageMap: await commanderImages(items),
    updatedAt: rows.find((row) => row.updated_at)?.updated_at ?? null,
    snapshotDate: popularSnapshotDate,
  };
}

export async function getExternalMostPlayedCards(limit = 48): Promise<{
  items: ExternalCardMetaItem[];
  imageMap: Map<string, string>;
  updatedAt: string | null;
  snapshotDate: string | null;
}> {
  const db = await getDb();
  const snapshotDate = await latestSnapshotDate(db, "meta_card_daily", SCRYFALL_META.twPopular);
  if (!snapshotDate) return { items: [], imageMap: new Map(), updatedAt: null, snapshotDate: null };

  const { data } = await db
    .from("meta_card_daily")
    .select("card_name, rank, updated_at")
    .eq("source", SCRYFALL_META.source)
    .eq("time_window", SCRYFALL_META.twPopular)
    .eq("snapshot_date", snapshotDate)
    .order("rank", { ascending: true })
    .limit(limit);

  const rows = (data ?? []) as DailyCardRow[];
  const items = rows
    .map((row) => {
      const name = String(row.card_name || "").trim();
      const rank = typeof row.rank === "number" ? row.rank : 0;
      if (!name || rank <= 0) return null;
      return { name, rank, metaLabel: rankLabel(rank) };
    })
    .filter((row): row is ExternalCardMetaItem => Boolean(row));

  return {
    items,
    imageMap: await cardImages(items),
    updatedAt: rows.find((row) => row.updated_at)?.updated_at ?? null,
    snapshotDate,
  };
}

export async function getExternalTrendingCards(limit = 48): Promise<{
  items: ExternalCardMetaItem[];
  imageMap: Map<string, string>;
  updatedAt: string | null;
  snapshotDate: string | null;
}> {
  const db = await getDb();
  const snapshotDate = await latestSnapshotDate(db, "meta_card_daily", SCRYFALL_META.twPopular);
  if (!snapshotDate) return { items: [], imageMap: new Map(), updatedAt: null, snapshotDate: null };
  const previousDate = await previousSnapshotDate(db, "meta_card_daily", SCRYFALL_META.twPopular, snapshotDate);

  const [currentResult, previousResult] = await Promise.all([
    db
      .from("meta_card_daily")
      .select("card_name, card_name_norm, rank, updated_at")
      .eq("source", SCRYFALL_META.source)
      .eq("time_window", SCRYFALL_META.twPopular)
      .eq("snapshot_date", snapshotDate)
      .order("rank", { ascending: true })
      .limit(300),
    previousDate
      ? db
          .from("meta_card_daily")
          .select("card_name_norm, rank")
          .eq("source", SCRYFALL_META.source)
          .eq("time_window", SCRYFALL_META.twPopular)
          .eq("snapshot_date", previousDate)
      : Promise.resolve({ data: [] }),
  ]);

  const prevRank = new Map<string, number>();
  for (const row of (previousResult.data ?? []) as DailyCardRow[]) {
    if (row.card_name_norm && typeof row.rank === "number") prevRank.set(row.card_name_norm, row.rank);
  }

  const rows = (currentResult.data ?? []) as DailyCardRow[];
  const scored: ExternalCardMetaItem[] = [];
  for (const row of rows) {
    const name = String(row.card_name || "").trim();
    const rank = typeof row.rank === "number" ? row.rank : 0;
    const key = String(row.card_name_norm || norm(name));
    if (!name || rank <= 0) continue;
    const delta = (prevRank.get(key) ?? rank) - rank;
    scored.push({
      name,
      rank,
      ...(delta > 0 ? { rankDelta: delta } : {}),
      metaLabel: trendLabel(rank, delta),
    });
  }

  const positive = scored.filter((row) => (row.rankDelta ?? 0) > 0);
  const items = (positive.length > 0 ? positive : scored)
    .sort((a, b) => (b.rankDelta ?? 0) - (a.rankDelta ?? 0) || a.rank - b.rank)
    .slice(0, limit);

  return {
    items,
    imageMap: await cardImages(items),
    updatedAt: rows.find((row) => row.updated_at)?.updated_at ?? null,
    snapshotDate,
  };
}
