import type { Metadata } from "next";
import Link from "next/link";
import CardSearchCommandCenter from "@/components/cards/CardSearchCommandCenter";
import CardsInfiniteList from "@/components/cards/CardsInfiniteList";
import { SCRYFALL_META } from "@/lib/meta/scryfallGlobalMeta";
import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";
import { getAdmin } from "@/lib/supa";
import { createClient } from "@/lib/supabase/server";

// Force dynamic rendering to avoid DYNAMIC_SERVER_USAGE when served from Vercel suspense cache / ISR
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Top Commander Cards | ManaTap",
  description:
    "Top global Commander cards by Scryfall meta signals. Card pages with oracle text, price, and commanders.",
  alternates: { canonical: "https://www.manatap.ai/cards" },
};

export const revalidate = 86400;

type CardListRow = {
  name: string;
  edhrecRank: number | null;
  rank: number;
  price: string | null;
  imageSmall?: string;
  imageLarge?: string;
  setCode?: string;
  rarity?: string;
};

type GlobalMetaCardRow = {
  card_name?: string | null;
  rank?: number | null;
  payload_json?: {
    edhrec_rank?: number | null;
    usd?: number | string | null;
  } | null;
};

function norm(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePriceCacheName(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2019'`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function formatUsd(value: unknown): string | null {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) return null;
  return `$${price.toFixed(2)}`;
}

async function getGlobalMetaCards(): Promise<CardListRow[]> {
  let metaDb;
  try {
    metaDb = getAdmin();
  } catch {
    metaDb = await createClient();
  }

  const { data: latestSnapshot } = await metaDb
    .from("meta_card_daily")
    .select("snapshot_date")
    .eq("source", SCRYFALL_META.source)
    .eq("time_window", SCRYFALL_META.twPopular)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const snapshotDate = (latestSnapshot as { snapshot_date?: string } | null)?.snapshot_date;
  if (!snapshotDate) return [];

  const { data: raw } = await metaDb
    .from("meta_card_daily")
    .select("card_name, rank, payload_json")
    .eq("snapshot_date", snapshotDate)
    .eq("source", SCRYFALL_META.source)
    .eq("time_window", SCRYFALL_META.twPopular)
    .order("rank", { ascending: true })
    .limit(200);

  const baseRows = ((raw ?? []) as GlobalMetaCardRow[])
    .map((row, index) => {
      const payload = row.payload_json && typeof row.payload_json === "object" ? row.payload_json : {};
      const edhrecRank =
        typeof payload.edhrec_rank === "number"
          ? payload.edhrec_rank
          : typeof row.rank === "number"
            ? row.rank
            : null;
      return {
        name: String(row.card_name || "").trim(),
        edhrecRank,
        rank: typeof row.rank === "number" ? row.rank : index + 1,
        priceLabel: formatUsd(payload.usd),
      };
    })
    .filter((row) => row.name.length > 0);

  const names = baseRows.map((row) => row.name);
  if (names.length === 0) return [];

  const supabase = await createClient();
  const priceKeys = Array.from(new Set(names.map(normalizePriceCacheName)));
  const [detailsMap, priceResult] = await Promise.all([
    getDetailsForNamesCached(names).catch(() => new Map<string, any>()),
    supabase
      .from("price_cache")
      .select("card_name, usd_price")
      .in("card_name", priceKeys),
  ]);

  const priceMap = new Map<string, string>();
  for (const row of priceResult.data ?? []) {
    const label = formatUsd((row as { usd_price?: number | string | null }).usd_price);
    const key = String((row as { card_name?: string | null }).card_name || "");
    if (key && label) priceMap.set(key, label);
  }

  return baseRows.map((row) => {
    const details = detailsMap.get(norm(row.name)) ?? detailsMap.get(row.name);
    const imageUris = details?.image_uris || {};
    return {
      name: row.name,
      edhrecRank: row.edhrecRank,
      rank: row.rank,
      price: row.priceLabel ?? priceMap.get(normalizePriceCacheName(row.name)) ?? null,
      imageSmall: imageUris.small,
      imageLarge: imageUris.large || imageUris.normal || imageUris.small,
      setCode: details?.set,
      rarity: details?.rarity,
    };
  });
}

export default async function CardsIndexPage() {
  const cards = await getGlobalMetaCards();

  return (
    <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <article className="text-neutral-200">
        <nav className="text-sm text-neutral-400 mb-4">
          <Link href="/" className="hover:text-white">Home</Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-200">Cards</span>
        </nav>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-6">
          Top Commander Cards
        </h1>
        <p className="text-neutral-300 mb-6 max-w-3xl text-lg leading-relaxed">
          Most-played cards in public Commander decks, updated daily. Explore staple cards, discover format trends, and open any card for prices, oracle text, and commander synergies.
        </p>
        <CardSearchCommandCenter />
        <section className="mt-10">
          <h2 className="text-2xl font-bold text-white">Top Commander Cards</h2>
          <p className="mt-2 text-sm text-neutral-400">
            Global meta staples with Scryfall art and current cached market prices.
          </p>
          <CardsInfiniteList cards={cards} />
          {cards.length === 0 && (
            <p className="text-neutral-400">No global meta cards yet. Check back after the daily meta refresh.</p>
          )}
        </section>
      </article>
    </main>
  );
}
