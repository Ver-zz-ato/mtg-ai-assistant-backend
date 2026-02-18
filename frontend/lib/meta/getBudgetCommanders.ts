/**
 * getBudgetCommanders - Budget commanders (lowest median deck cost) with image map.
 * Revalidate: 1h - meta_signals refreshed daily.
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

export type BudgetCommanderItem = {
  name: string;
  slug: string;
  medianCost: number;
  rank: number;
};

export async function getBudgetCommanders(): Promise<{
  items: BudgetCommanderItem[];
  imageMap: Map<string, string>;
  updatedAt: string | null;
}> {
  const supabase = await import("@/lib/supabase/server").then((m) =>
    m.createClient()
  );
  const [data, metaRow] = await Promise.all([
    getMetaSignal("budget-commanders"),
    supabase
      .from("meta_signals")
      .select("updated_at")
      .eq("signal_type", "budget-commanders")
      .maybeSingle(),
  ]);

  const raw = (data && Array.isArray(data)
    ? data
    : []) as Array<{ slug?: string; name: string; medianCost?: number }>;

  const items: BudgetCommanderItem[] = raw.map((r, i) => {
    const slug = (r.slug ?? "").trim() || "";
    const name = r.name?.trim() ?? "";
    const profile = getCommanderBySlug(slug);
    return {
      name: profile?.name ?? name,
      slug: profile?.slug ?? slug,
      medianCost: r.medianCost ?? 0,
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
