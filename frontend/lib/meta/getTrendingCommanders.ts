/**
 * getTrendingCommanders - Trending commanders with image map.
 *
 * Caching: Use with revalidate=3600 (1h). meta_signals refreshed daily by cron.
 * Images from scryfall_cache (DB) + Scryfall API fallback.
 */

import { getMetaSignal } from "@/lib/meta-signals";
import { getCommanderBySlug } from "@/lib/commanders";
import { getImagesForNamesCached } from "@/lib/server/scryfallCache";

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

export type TrendingCommanderItem = {
  name: string;
  slug: string;
  count: number;
  rank: number;
};

export async function getTrendingCommanders(): Promise<{
  items: TrendingCommanderItem[];
  imageMap: Map<string, string>;
  updatedAt: string | null;
}> {
  const supabase = await import("@/lib/supabase/server").then((m) =>
    m.createClient()
  );
  const [data, metaRow] = await Promise.all([
    getMetaSignal("trending-commanders"),
    supabase
      .from("meta_signals")
      .select("updated_at")
      .eq("signal_type", "trending-commanders")
      .maybeSingle(),
  ]);

  const raw = (data && Array.isArray(data)
    ? data
    : []) as Array<{ name: string; count?: number }>;

  const items: TrendingCommanderItem[] = raw.map((r, i) => {
    const name = r.name?.trim() ?? "";
    const profile = getCommanderBySlug(toSlug(name));
    const slug = profile?.slug ?? toSlug(name);
    return {
      name: profile?.name ?? name,
      slug,
      count: r.count ?? 0,
      rank: i + 1,
    };
  });

  const names = items.map((i) => i.name);
  const detailsMap = await getImagesForNamesCached(names);
  const imageMap = new Map<string, string>();
  for (const [k, v] of detailsMap) {
    const url = v?.art_crop ?? v?.normal ?? v?.small;
    if (url) imageMap.set(norm(k), url);
  }

  const updatedAt = (metaRow.data as { updated_at?: string } | null)?.updated_at ?? null;

  return { items, imageMap, updatedAt };
}
