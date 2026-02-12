import { createClientForStatic } from "@/lib/server-supabase";

export type SeoPage = {
  id: string;
  slug: string;
  title: string;
  description: string;
  template: string;
  query: string;
  commander_slug: string | null;
  card_name: string | null;
  archetype_slug: string | null;
  strategy_slug: string | null;
  priority: number;
  status: string;
  created_at: string;
  updated_at: string;
  resolved_url?: string | null;
  quality_score?: number;
  indexing?: string;
};

export async function getSeoPageBySlug(slug: string): Promise<SeoPage | null> {
  const supabase = createClientForStatic();
  const { data, error } = await supabase
    .from("seo_pages")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error || !data) return null;
  return data as SeoPage;
}

export async function getPublishedSeoPageSlugs(limit = 500): Promise<string[]> {
  const supabase = createClientForStatic();
  const { data, error } = await supabase
    .from("seo_pages")
    .select("slug")
    .eq("status", "published")
    .eq("indexing", "index")
    .order("priority", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return (data as { slug: string }[]).map((r) => r.slug);
}
