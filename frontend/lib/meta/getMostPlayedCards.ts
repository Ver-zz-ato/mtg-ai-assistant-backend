/**
 * getMostPlayedCards - Most played cards with image map.
 * Revalidate: 1h - meta_signals refreshed daily.
 */

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

export type MostPlayedCardItem = {
  name: string;
  count: number;
  rank: number;
};

export async function getMostPlayedCards(): Promise<{
  items: MostPlayedCardItem[];
  imageMap: Map<string, string>;
  updatedAt: string | null;
}> {
  const supabase = await import("@/lib/supabase/server").then((m) =>
    m.createClient()
  );
  const [data, metaRow] = await Promise.all([
    getMetaSignal("most-played-cards"),
    supabase
      .from("meta_signals")
      .select("updated_at")
      .eq("signal_type", "most-played-cards")
      .maybeSingle(),
  ]);

  const raw = (data && Array.isArray(data)
    ? data
    : []) as Array<{ name: string; count?: number }>;

  const items: MostPlayedCardItem[] = raw.map((r, i) => ({
    name: r.name?.trim() ?? "",
    count: r.count ?? 0,
    rank: i + 1,
  }));

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
