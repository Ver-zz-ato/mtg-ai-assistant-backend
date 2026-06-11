import { createClient } from "@/lib/supabase/server";

const BLOG_BODIES_KEY = "blog_marketing_bodies";

export type DynamicBlogPost = {
  title: string;
  date: string;
  author: string;
  category: string;
  readTime: string;
  content: string;
  gradient: string;
  icon: string;
};

export async function getMarketingBlogPost(slug: string): Promise<DynamicBlogPost | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", BLOG_BODIES_KEY)
      .maybeSingle();

    const bodies = (data?.value as Record<string, string>) || {};
    const content = bodies[slug];
    if (!content) return null;

    const { data: blogRow } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "blog")
      .maybeSingle();

    const entries = ((blogRow?.value as { entries?: unknown[] })?.entries || []) as Array<
      Record<string, string>
    >;
    const meta = entries.find((e) => e.slug === slug);

    const titleLine = content.split("\n").find((l) => l.startsWith("# "));
    const title = meta?.title || titleLine?.replace(/^#\s+/, "") || "ManaTap Blog";

    return {
      title,
      date: meta?.date || new Date().toISOString().slice(0, 10),
      author: meta?.author || "ManaTap Team",
      category: meta?.category || "Meta",
      readTime: meta?.readTime || "8 min read",
      content,
      gradient: meta?.gradient || "from-emerald-600 via-teal-600 to-cyan-600",
      icon: meta?.icon || "📰",
    };
  } catch {
    return null;
  }
}
