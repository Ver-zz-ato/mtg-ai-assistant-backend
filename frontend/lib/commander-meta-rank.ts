/**
 * Check if a commander appears in meta signals (most-played, trending, budget).
 * Returns a short label for Quick Stats, e.g. "Top 20 most played".
 */

import { getCommanderBySlug } from "@/lib/commanders";
import { getMetaSignal } from "@/lib/meta-signals";

type NameCountItem = { name: string; count: number };
type SlugNameCostItem = { slug: string; name: string; medianCost?: number };

export async function getCommanderMetaRank(commanderSlug: string): Promise<string | null> {
  const profile = getCommanderBySlug(commanderSlug);
  const commanderName = profile?.name?.trim() ?? "";
  const slug = commanderSlug.toLowerCase();

  const [mostPlayed, trending, budget] = await Promise.all([
    getMetaSignal("most-played-commanders"),
    getMetaSignal("trending-commanders"),
    getMetaSignal("budget-commanders"),
  ]);

  // most-played and trending use { name, count }
  const mostPlayedList = mostPlayed as NameCountItem[] | null;
  if (mostPlayedList?.length && commanderName) {
    const idx = mostPlayedList.findIndex((c) => c.name?.trim() === commanderName);
    if (idx >= 0 && idx < 20) return "Top 20 most played";
  }

  const trendingList = trending as NameCountItem[] | null;
  if (trendingList?.length && commanderName) {
    const idx = trendingList.findIndex((c) => c.name?.trim() === commanderName);
    if (idx >= 0 && idx < 10) return "Trending";
  }

  // budget uses { slug, name, medianCost }
  const budgetList = budget as SlugNameCostItem[] | null;
  if (budgetList?.length) {
    const idx = budgetList.findIndex((c) => c.slug?.toLowerCase() === slug);
    if (idx >= 0 && idx < 20) return "Budget commander";
  }

  return null;
}
