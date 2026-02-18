/**
 * getMetaSnapshot - Aggregated stats for meta dashboard hero.
 * Fetches trending commanders (for top pick), deck counts, and last updated.
 *
 * Caching: Use with revalidate=3600 (1h). Meta data is refreshed daily by
 * meta-signals cron; 1h revalidate balances freshness with build performance.
 */

import { createClient } from "@/lib/supabase/server";
import { getMetaSignal } from "@/lib/meta-signals";
import { getImagesForNamesCached } from "@/lib/server/scryfallCache";

function norm(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type MetaSnapshot = {
  topCommander: { name: string; slug: string; count: number; imageUrl?: string } | null;
  decksAnalyzed: number | null;
  lastUpdated: string | null;
  commandersTracked: number;
};

/** Format relative time (e.g. "2 hours ago") */
function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffM = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffM < 60) return `${diffM}m ago`;
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString();
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function getMetaSnapshot(): Promise<MetaSnapshot> {
  const supabase = await createClient();

  // Fetch trending commanders for top pick + updated_at
  const [trendingData, metaRow] = await Promise.all([
    getMetaSignal("trending-commanders"),
    supabase
      .from("meta_signals")
      .select("updated_at")
      .eq("signal_type", "trending-commanders")
      .maybeSingle(),
  ]);

  let topCommander: MetaSnapshot["topCommander"] = null;
  if (trendingData && Array.isArray(trendingData) && trendingData.length > 0) {
    const first = trendingData[0] as { name: string; count?: number };
    const name = first.name?.trim() ?? "";
    const imgMap = await getImagesForNamesCached([name]);
    const img = imgMap.get(norm(name));
    const imageUrl = img?.art_crop ?? img?.normal ?? img?.small;
    topCommander = {
      name,
      slug: toSlug(name),
      count: first.count ?? 0,
      imageUrl: imageUrl ?? undefined,
    };
  }

  // Sum deck counts from most-played-commanders for "decks analyzed" estimate
  let decksAnalyzed: number | null = null;
  const mostPlayed = await getMetaSignal("most-played-commanders");
  if (mostPlayed && Array.isArray(mostPlayed)) {
    const sum = (mostPlayed as { count?: number }[]).reduce(
      (s, i) => s + (i.count ?? 0),
      0
    );
    if (sum > 0) decksAnalyzed = sum;
  }

  const lastUpdated =
    (metaRow.data as { updated_at?: string } | null)?.updated_at ?? null;

  return {
    topCommander,
    decksAnalyzed,
    lastUpdated,
    commandersTracked:
      trendingData && Array.isArray(trendingData) ? trendingData.length : 0,
  };
}

export { formatRelative };
