/**
 * Server-side data for commander cost landing pages.
 * Fetches cost tiers (budget/mid/high) and top expensive cards.
 * Degrades gracefully when no data.
 */

import { getAdmin } from "@/app/api/_lib/supa";
import { getCommanderBySlug } from "@/lib/commanders";

function norm(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export type CostLandingData = {
  costSnapshot: {
    budget: number;
    mid: number;
    high: number;
  } | null;
  costDrivers: Array<{ cardName: string; usdPrice: number }>;
  deckCount: number;
};

export async function getCostLandingData(commanderSlug: string): Promise<CostLandingData> {
  const admin = getAdmin();
  if (!admin) return { costSnapshot: null, costDrivers: [], deckCount: 0 };

  const profile = getCommanderBySlug(commanderSlug);
  if (!profile) return { costSnapshot: null, costDrivers: [], deckCount: 0 };

  // Match "The Ur-Dragon" and "The Ur-Dragon - Dragon Tribal" etc.
  const { data: decks, error: decksError } = await admin
    .from("decks")
    .select("id")
    .eq("is_public", true)
    .eq("format", "Commander")
    .ilike("commander", `${profile.name}%`)
    .limit(500);

  if (decksError || !decks || decks.length === 0) {
    return { costSnapshot: null, costDrivers: [], deckCount: 0 };
  }

  const deckCount = decks.length;

  const deckIds = decks.map((d) => d.id);

  // Cost snapshot: percentiles from deck_costs
  const { data: costs } = await admin
    .from("deck_costs")
    .select("total_usd")
    .in("deck_id", deckIds);

  let costSnapshot: CostLandingData["costSnapshot"] = null;
  if (costs && costs.length > 0) {
    const values = (costs as { total_usd: number }[])
      .map((r) => Number(r.total_usd))
      .filter((n) => !isNaN(n) && n > 0)
      .sort((a, b) => a - b);
    if (values.length >= 3) {
      const p25 = Math.floor(values.length * 0.25);
      const p50 = Math.floor(values.length * 0.5);
      const p75 = Math.floor(values.length * 0.75);
      costSnapshot = {
        budget: Math.round(values[p25]),
        mid: Math.round(values[p50]),
        high: Math.round(values[p75]),
      };
    } else if (values.length > 0) {
      const mid = Math.round(values[Math.floor(values.length / 2)]);
      costSnapshot = { budget: mid, mid, high: mid };
    }
  }

  // Cost drivers: top 5 expensive cards across commander decks
  const { data: cards } = await admin
    .from("deck_cards")
    .select("name, qty")
    .in("deck_id", deckIds);

  const cardNames = [...new Set((cards ?? []).map((c: { name: string }) => c.name).filter(Boolean))];
  if (cardNames.length === 0) return { costSnapshot, costDrivers: [], deckCount };

  const keys = [...new Set(cardNames.map(norm))];
  const priceMap = new Map<string, number>();

  for (let i = 0; i < keys.length; i += 200) {
    const chunk = keys.slice(i, i + 200);
    const { data: prices } = await admin
      .from("price_cache")
      .select("card_name, usd_price")
      .in("card_name", chunk);
    for (const row of prices ?? []) {
      const p = Number((row as { usd_price?: number | null }).usd_price);
      if (!isNaN(p) && p > 0) {
        priceMap.set((row as { card_name: string }).card_name, p);
      }
    }
  }

  // Map card name -> total contribution (price * total qty across decks)
  const contributionByCard = new Map<string, number>();
  for (const c of cards ?? []) {
    const name = (c as { name: string }).name;
    const qty = Math.max(1, (c as { qty?: number }).qty ?? 1);
    const key = norm(name);
    const price = priceMap.get(key);
    if (price == null) continue;
    contributionByCard.set(name, (contributionByCard.get(name) ?? 0) + price * qty);
  }

  const costDrivers = Array.from(contributionByCard.entries())
    .map(([cardName, totalContrib]) => ({
      cardName,
      usdPrice: Math.round(priceMap.get(norm(cardName)) ?? 0),
      totalContrib,
    }))
    .filter((x) => x.usdPrice > 0)
    .sort((a, b) => b.totalContrib - a.totalContrib)
    .slice(0, 5)
    .map(({ cardName, usdPrice }) => ({ cardName, usdPrice }));

  return { costSnapshot, costDrivers, deckCount };
}
