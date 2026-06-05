import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AuthenticMTGCard from "@/components/AuthenticMTGCard";
import { getCardBySlug } from "@/lib/top-cards";
import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";
import { createClient, createClientForStatic } from "@/lib/supabase/server";
import { loadPublicCustomCard } from "@/lib/server/publicCustomCards";
import { getDisplayCardName } from "@/lib/cards/displayName";
import { getCommanderBySlug } from "@/lib/commanders";
import { buildCardDescription } from "@/lib/seo/metadata";
import { getGlobalMetaCardBySlug } from "@/lib/meta/global-meta-entities";

function norm(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// This route can fall back to session-aware Supabase reads for private custom-card previews
// and also uses shared server helpers that read request cookies, so it must stay dynamic.
export const dynamic = "force-dynamic";
export const dynamicParams = true;

type Props = { params: Promise<{ slug: string }> };

const BASE = "https://www.manatap.ai";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const card = (await getGlobalMetaCardBySlug(slug)) ?? (await getCardBySlug(slug));
  if (card) {
    let typeLine: string | undefined;
    try {
      const cardName = "card_name" in card ? card.card_name : card.name;
      const detailsMap = await getDetailsForNamesCached([cardName]);
      const details = detailsMap.get(norm(cardName)) ?? detailsMap.get(cardName);
      typeLine = details?.type_line;
    } catch {}
    return {
      title: `${"card_name" in card ? card.card_name : card.name} | ManaTap`,
      description: buildCardDescription("card_name" in card ? card.card_name : card.name, typeLine),
      alternates: { canonical: `${BASE}/cards/${slug}` },
    };
  }
  const custom = await loadPublicCustomCard(slug, "id, title, data, public_slug");
  if (custom) {
    const title = (custom as { title?: string }).title || "Custom Card";
    return {
      title: `${title} | ManaTap`,
      description: `View ${title}, a shared custom Magic: The Gathering card on ManaTap, with card frame details and community deck-building context.`,
      alternates: { canonical: `${BASE}/cards/${slug}` },
    };
  }
  return { title: "Card Not Found | ManaTap AI" };
}

export default async function CardPage({ params }: Props) {
  const { slug } = await params;

  const [globalCard, topCard] = await Promise.all([
    getGlobalMetaCardBySlug(slug),
    getCardBySlug(slug),
  ]);
  if (globalCard || topCard) {
    return <GlobalCardContent card={globalCard ?? topCard!} topCard={topCard} slug={slug} />;
  }

  // Fall back to custom_cards (user-created cards). Public rows are gated by public_slug.
  let customData = await loadPublicCustomCard(slug);
  if (!customData) {
    const sessionSb = await createClient();
    const ownerById = await sessionSb.from("custom_cards").select("id, title, data, public_slug").eq("id", slug).maybeSingle();
    customData = ownerById.data;
  }
  if (customData) {
    const val = ((customData as { data?: Record<string, unknown> }).data || {}) as Record<string, unknown>;
    const title = (customData as { title?: string }).title || (Array.isArray(val?.nameParts) ? (val.nameParts as string[]).join(" ") : "Custom Card");
    const snapshotImageUrl = typeof val.snapshotImageUrl === "string" ? val.snapshotImageUrl.trim() : "";
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
        {snapshotImageUrl ? (
          <img
            src={snapshotImageUrl}
            alt={`${title} custom card`}
            className="w-full max-w-[360px] rounded-xl border border-white/15 bg-neutral-950"
          />
        ) : (
          <div className="inline-block">
            <AuthenticMTGCard value={cardValue} mode="view" />
          </div>
        )}
      </main>
    );
  }

  notFound();
}

async function GlobalCardContent({
  card,
  topCard,
  slug,
}: {
  card:
    | { name: string; slug: string; mostPlayedRank?: number; mostPlayedCount?: number; trendingRank?: number; isTrending: boolean }
    | { card_name: string; deck_count: number; commander_slugs: string[] };
  topCard: { card_name: string; deck_count: number; commander_slugs: string[] } | null;
  slug: string;
}) {
  const cardName = "card_name" in card ? card.card_name : card.name;
  const [detailsMap, priceRow] = await Promise.all([
    getDetailsForNamesCached([cardName]),
    (async () => {
      const supabase = createClientForStatic();
      const key = norm(cardName);
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

  const details = detailsMap.get(norm(cardName)) ?? detailsMap.get(cardName);
  const price = priceRow && (Number((priceRow as { usd_price?: number }).usd_price) || Number((priceRow as { usd?: number }).usd) || 0);
  const oracleName = cardName;
  const printedName =
    details && typeof details === "object" && "printed_name" in details
      ? (details as { printed_name?: string | null }).printed_name
      : undefined;
  const displayTitle = getDisplayCardName({ name: oracleName, printed_name: printedName });
  const showOracleNameCaption =
    typeof printedName === "string" &&
    printedName.trim().length > 0 &&
    printedName.trim().toLowerCase() !== oracleName.trim().toLowerCase();
  /** Breadcrumb = navigation / oracle identity; h1 = printed presentation when distinct. */
  const imageAlt = showOracleNameCaption
    ? `${displayTitle} (${oracleName})`
    : displayTitle;

  return (
    <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <article className="text-neutral-200">
        <nav className="text-sm text-neutral-400 mb-4">
          <Link href="/" className="hover:text-white">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/cards" className="hover:text-white">Cards</Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-200">{oracleName}</span>
        </nav>
        <h1 className={`text-3xl md:text-4xl font-bold text-white ${showOracleNameCaption ? "mb-1" : "mb-4"}`}>{displayTitle}</h1>
        {showOracleNameCaption ? (
          <p className="text-sm text-neutral-500 mb-4">Oracle: {oracleName}</p>
        ) : null}

        {details?.image_uris?.normal && (
          <div className="mb-6">
            <img
              src={details.image_uris.normal}
              alt={imageAlt}
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
          {"mostPlayedRank" in card && card.mostPlayedRank ? (
            <p className="text-neutral-300">
              <span className="text-neutral-500">Global meta:</span> Most-played card rank #{card.mostPlayedRank}
              {card.isTrending ? " • also trending now" : ""}
            </p>
          ) : null}
          {topCard ? (
            <p className="text-neutral-400 text-sm">
              ManaTap public decks: used in {topCard.deck_count} tracked Commander decks.
            </p>
          ) : null}
        </div>

        {topCard && topCard.commander_slugs.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-neutral-100 mb-4">Commanders using this card</h2>
            <ul className="flex flex-wrap gap-2">
              {topCard.commander_slugs.slice(0, 12).map((s) => {
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
