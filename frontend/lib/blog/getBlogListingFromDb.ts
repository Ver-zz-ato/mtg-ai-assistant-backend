import { createClient } from "@/lib/supabase/server";
import { BLOG_LISTING_KEY, type BlogListingEntry } from "./blogConfig";

/** Fetch blog listing entries from Supabase (for sitemap, etc.). */
export async function getBlogListingFromDb(): Promise<BlogListingEntry[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", BLOG_LISTING_KEY)
      .maybeSingle();

    const entries = (data?.value as { entries?: BlogListingEntry[] })?.entries;
    if (!Array.isArray(entries)) return [];
    return entries.filter((e) => e?.slug);
  } catch {
    return [];
  }
}
