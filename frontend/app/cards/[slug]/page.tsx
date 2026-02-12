import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AuthenticMTGCard from "@/components/AuthenticMTGCard";
import { getCardBySlug, getTopCards } from "@/lib/top-cards";
import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";
import { createClient } from "@/lib/supabase/server";
import { getCommanderBySlug } from "@/lib/commanders";

function norm(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateStaticParams() {
  const cards = await getTopCards();
  return cards.map((c) => ({ slug: c.slug }));
}

export const dynamicParams = true;

type Props = { params: Promise<{ slug: string }> };

const BASE = "https://www.manatap.ai";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const card = await getCardBySlug(slug);
  if (card) {
    return {
      title: `${card.card_name} | ManaTap`,
      description: `${card.card_name} — used in ${card.deck_count} Commander decks. Oracle text, price, commanders.`,
      alternates: { canonical: `${BASE}/cards/${slug}` },
    };
  }
  const sb = await createClient();
  let { data: custom } = await sb.from("custom_cards").select("title").eq("public_slug", slug).maybeSingle();
  if (!custom) {
    const byId = await sb.from("custom_cards").select("title").eq("id", slug).maybeSingle();
    custom = byId.data;
  }
  if (custom) return { title: `${(custom as { title?: string }).title || "Custom Card"} | ManaTap` };
  return { title: "Card Not Found | ManaTap AI" };
}

export default async function CardPage({ params }: Props) {
  const { slug } = await params;

  // First try top_cards (MTG card discovery)
  const card = await getCardBySlug(slug);
  if (card) {
    return <TopCardContent card={card} slug={slug} />;
  }

  // Fall back to custom_cards (user-created cards)
  const sb = await createClient();
  let { data: customData } = await sb.from("custom_cards").select("id, title, data, public_slug").eq("public_slug", slug).maybeSingle();
  if (!customData) {
    const byId = await sb.from("custom_cards").select("id, title, data, public_slug").eq("id", slug).maybeSingle();
    customData = byId.data;
  }
  if (customData) {
    const val = ((customData as { data?: Record<string, unknown> }).data || {}) as Record<string, unknown>;
    const title = (customData as { title?: string }).title || (Array.isArray(val?.nameParts) ? (val.nameParts as string[]).join(" ") : "Custom Card");
    const cardValue = {
      nameParts: (Array.isArray(val?.nameParts) ? val.nameParts : ["", "", title]).slice(0, 3) as [string, string, string],
      subtext: String(val?.subtext ?? val?.sub ?? ""),
      typeLine: String(val?.typeLine ?? "Creature — Wizard"),
      pt: (val?.pt as { p: number; t: number }) || { p: 1, t: 1 },
      cost: Number(val?.cost ?? 3),
      manaCost: (Array.isArray(val?.manaCost) ? val.manaCost : ["2", String(val?.colorHint ?? "U")]) as string[],
      colorHint: (val?.colorHint as "W" | "U" | "B" | "R" | "G" | "C" | "M" | "L" | "") || "U",
      rarity: (val?.rarity as "common" | "uncommon" | "rare" | "mythic") || "uncommon",
      setSymbol: String(val?.setSymbol ?? "CCC"),
      art: {
        url: String((val?.art as { url?: string })?.url ?? "").trim() || String(val?.art ?? "").trim() || "",
        artist: String((val?.art as { artist?: string })?.artist ?? val?.artist ?? ""),
        id: String((val?.art as { id?: string })?.id ?? val?.scryUri ?? ""),
      },
    };
    return (
      <main className="max-w-4xl mx-auto p-4">
        <h1 className="text-lg font-semibold mb-2">{title}</h1>
        <div className="inline-block">
          <AuthenticMTGCard value={cardValue} mode="view" />
        </div>
      </main>
    );
  }

  notFound();
}

async function TopCardContent({ card, slug }: { card: { card_name: string; deck_count: number; commander_slugs: string[] }; slug: string }) {
  const [detailsMap, priceRow] = await Promise.all([
    getDetailsForNamesCached([card.card_name]),
    (async () => {
      const supabase = await createClient();
      const key = norm(card.card_name);
      const { data: byCardName } = await supabase
        .from("price_cache")
        .select("usd_price")
        .eq("card_name", key)
        .maybeSingle();
      if (byCardName) return byCardName;
      const { data: byName } = await supabase
        .from("price_cache")
        .select("usd")
        .eq("name", key)
        .maybeSingle();
      return byName;
    })(),
  ]);

  const details = detailsMap.get(norm(card.card_name)) ?? detailsMap.get(card.card_name);
  const price = priceRow && (Number((priceRow as { usd_price?: number }).usd_price) || Number((priceRow as { usd?: number }).usd) || 0);

  return (
    <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <article className="text-neutral-200">
        <nav className="text-sm text-neutral-400 mb-4">
          <Link href="/" className="hover:text-white">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/cards" className="hover:text-white">Cards</Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-200">{card.card_name}</span>
        </nav>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">{card.card_name}</h1>

        {details?.image_uris?.normal && (
          <div className="mb-6">
            <img
              src={details.image_uris.normal}
              alt={card.card_name}
              className="max-w-[244px] rounded-lg"
            />
          </div>
        )}

        <div className="space-y-4 mb-8">
          {details?.type_line && (
            <p className="text-neutral-300">
              <span className="text-neutral-500">Type:</span> {details.type_line}
            </p>
          )}
          {details?.oracle_text && (
            <p className="text-neutral-300">
              <span className="text-neutral-500">Oracle:</span> {details.oracle_text}
            </p>
          )}
          {price != null && price > 0 && (
            <p className="text-neutral-300">
              <span className="text-neutral-500">Price:</span> ~${price.toFixed(2)} USD
            </p>
          )}
          <p className="text-neutral-400 text-sm">
            Used in {card.deck_count} public Commander decks.
          </p>
        </div>

        {card.commander_slugs.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-neutral-100 mb-4">Commanders using this card</h2>
            <ul className="flex flex-wrap gap-2">
              {card.commander_slugs.slice(0, 12).map((s) => {
                const cmd = getCommanderBySlug(s);
                return (
                  <li key={s}>
                    <Link href={`/commanders/${s}`} className="text-blue-400 hover:underline text-sm">
                      {cmd?.name ?? s}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <h2 className="text-xl font-semibold text-neutral-100 mb-4">Related Tools</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Link href="/tools/mulligan" className="block p-4 rounded-lg bg-neutral-800/80 border border-neutral-700 hover:border-blue-600">
            <h3 className="font-semibold text-white">Mulligan Simulator</h3>
          </Link>
          <Link href="/collections/cost-to-finish" className="block p-4 rounded-lg bg-neutral-800/80 border border-neutral-700 hover:border-blue-600">
            <h3 className="font-semibold text-white">Cost to Finish</h3>
          </Link>
          <Link href="/deck/swap-suggestions" className="block p-4 rounded-lg bg-neutral-800/80 border border-neutral-700 hover:border-blue-600">
            <h3 className="font-semibold text-white">Budget Swaps</h3>
          </Link>
        </div>

        <Link href="/cards" className="inline-block mt-6 text-blue-400 hover:underline">
          Browse all cards
        </Link>
      </article>
    </main>
  );
}
