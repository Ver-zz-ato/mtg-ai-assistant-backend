import type { SupabaseClient } from "@supabase/supabase-js";
import type { BlogListingEntry } from "@/lib/blog/blogConfig";
import {
  excerptFromContent,
  estimateReadTime,
  slugifyBlogTitle,
  titleFromContent,
} from "@/lib/blog/blogHelpers";
import { publishBlogPost } from "@/lib/blog/publishBlogPost";
import type { PublishResult } from "./publishToX";

export type PublishToBlogOptions = {
  title?: string;
  slug?: string;
  category?: string;
  gradient?: string;
  icon?: string;
  date?: string;
  excerpt?: string;
  readTime?: string;
  imageUrl?: string;
};

export async function publishToBlog(
  admin: SupabaseClient,
  content: string,
  opts?: PublishToBlogOptions
): Promise<PublishResult & { slug: string }> {
  const trimmed = content.trim();
  const title = opts?.title?.trim() || titleFromContent(trimmed);
  const date = opts?.date || new Date().toISOString().slice(0, 10);
  const slug = opts?.slug?.trim() || slugifyBlogTitle(title, date);

  const metadata: Partial<BlogListingEntry> & { title: string } = {
    title,
    excerpt: opts?.excerpt || excerptFromContent(trimmed),
    date,
    author: "ManaTap Team",
    category: opts?.category || "Strategy",
    readTime: opts?.readTime || estimateReadTime(trimmed),
    gradient: opts?.gradient || "from-emerald-600 via-teal-600 to-cyan-600",
    icon: opts?.icon || "📰",
    ...(opts?.imageUrl ? { imageUrl: opts.imageUrl } : {}),
  };

  return publishBlogPost(admin, { slug, content: trimmed, metadata });
}
