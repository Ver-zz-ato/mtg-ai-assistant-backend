/**
 * Returns "Trending" | "Most Played" | null for Commander Intelligence Panel.
 * Checks trending-commanders first, then most-played-commanders.
 * Uses meta_signals cache (no live computation).
 */

import { getCommanderBySlug } from "@/lib/commanders";
import { getMetaSignal } from "@/lib/meta-signals";

type NameCountItem = { name: string; count: number };

export async function getCommanderMetaBadge(
  commanderSlug: string
): Promise<"Trending" | "Most Played" | null> {
  const profile = getCommanderBySlug(commanderSlug);
  const commanderName = profile?.name?.trim() ?? "";

  const [trending, mostPlayed] = await Promise.all([
    getMetaSignal("trending-commanders"),
    getMetaSignal("most-played-commanders"),
  ]);

  const trendingList = trending as NameCountItem[] | null;
  if (trendingList?.length && commanderName) {
    const found = trendingList.some((c) => c.name?.trim() === commanderName);
    if (found) return "Trending";
  }

  const mostPlayedList = mostPlayed as NameCountItem[] | null;
  if (mostPlayedList?.length && commanderName) {
    const found = mostPlayedList.some((c) => c.name?.trim() === commanderName);
    if (found) return "Most Played";
  }

  return null;
}
