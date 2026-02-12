import { createClient } from "@/lib/supabase/server";

export type MetaSignalData =
  | Array<{ name: string; count: number }>
  | Array<{ slug: string; name: string; medianCost: number }>;

export async function getMetaSignal(signalType: string): Promise<MetaSignalData | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meta_signals")
    .select("data")
    .eq("signal_type", signalType)
    .maybeSingle();

  if (error || !data?.data) return null;
  return data.data as MetaSignalData;
}

export const META_SLUGS = [
  "trending-commanders",
  "most-played-commanders",
  "budget-commanders",
  "trending-cards",
  "most-played-cards",
] as const;

export type MetaSlug = (typeof META_SLUGS)[number];

export function getMetaTitle(slug: MetaSlug): string {
  const map: Record<MetaSlug, string> = {
    "trending-commanders": "Trending Commanders",
    "most-played-commanders": "Most Played Commanders",
    "budget-commanders": "Budget Commanders",
    "trending-cards": "Trending Cards",
    "most-played-cards": "Most Played Cards",
  };
  return map[slug] ?? slug;
}
