import type { Metadata } from "next";
import Link from "next/link";
import CardSearchCommandCenter from "@/components/cards/CardSearchCommandCenter";
import CardRowPreviewLeft from "@/components/shared/CardRowPreview";
import { getMetaSignal } from "@/lib/meta-signals";
import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";
import { createClient } from "@/lib/supabase/server";

// Force dynamic rendering to avoid DYNAMIC_SERVER_USAGE when served from Vercel suspense cache / ISR
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Top Commander Cards | ManaTap",
  description:
    "Top 200 cards by appearance in public Commander decks. Card pages with oracle text, price, and commanders.",
  alternates: { canonical: "https://www.manatap.ai/cards" },
};

export const revalidate = 86400;

type MetaCardRow = {
  name?: string;
  count?: number;
  priceLabel?: string;
};

type CardListRow = {
  name: string;
  count: number;
  rank: number;
  price: string | null;
  imageSmall?: string;
  imageLarge?: string;
  setCode?: string;
  rarity?: string;
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
  const raw = (await getMetaSignal("most-played-cards").catch(() => null)) as
    | MetaCardRow[]
    | null;
  const baseRows = (Array.isArray(raw) ? raw : [])
    .map((row, index) => ({
      name: String(row.name || "").trim(),
      count: typeof row.count === "number" ? row.count : 0,
      rank: index + 1,
      priceLabel: typeof row.priceLabel === "string" ? row.priceLabel : null,
    }))
    .filter((row) => row.name.length > 0)
    .slice(0, 200);

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
      count: row.count,
      rank: row.rank,
      price: priceMap.get(normalizePriceCacheName(row.name)) ?? row.priceLabel,
      imageSmall: imageUris.small,
      imageLarge: imageUris.normal || imageUris.small,
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
          <ol className="mt-5 overflow-hidden rounded-xl border border-white/10 bg-neutral-950/70">
            {cards.map((c) => (
              <li
                key={c.name}
                className="grid gap-3 border-b border-white/10 px-3 py-3 last:border-b-0 sm:grid-cols-[56px_minmax(0,1fr)_130px_110px] sm:items-center"
              >
                <span className="text-sm font-semibold tabular-nums text-neutral-500">
                  #{c.rank}
                </span>
                <CardRowPreviewLeft
                  name={c.name}
                  imageSmall={c.imageSmall}
                  imageLarge={c.imageLarge}
                  setCode={c.setCode}
                  rarity={c.rarity}
                />
                <span className="text-sm text-neutral-400">
                  {c.count.toLocaleString()} decks
                </span>
                <span className="text-sm font-semibold text-emerald-200">
                  {c.price ?? "Price n/a"}
                </span>
              </li>
            ))}
          </ol>
          {cards.length === 0 && (
            <p className="text-neutral-400">No global meta cards yet. Check back after the daily meta refresh.</p>
          )}
        </section>
      </article>
    </main>
  );
}
