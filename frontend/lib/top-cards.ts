import { createClientForStatic } from "@/lib/server-supabase";

export async function getTopCards(): Promise<Array<{ card_name: string; slug: string; deck_count: number; commander_slugs: string[] }>> {
  const supabase = createClientForStatic();
  const { data, error } = await supabase
    .from("top_cards")
    .select("card_name, slug, deck_count, commander_slugs")
    .order("deck_count", { ascending: false })
    .limit(200);

  if (error || !data) return [];
  return data as Array<{ card_name: string; slug: string; deck_count: number; commander_slugs: string[] }>;
}

export async function getCardBySlug(slug: string): Promise<{
  card_name: string;
  slug: string;
  deck_count: number;
  commander_slugs: string[];
} | null> {
  const supabase = createClientForStatic();
  const { data, error } = await supabase
    .from("top_cards")
    .select("card_name, slug, deck_count, commander_slugs")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) return null;
  return data as { card_name: string; slug: string; deck_count: number; commander_slugs: string[] };
}
