import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BLOG_BODIES_KEY,
  BLOG_LISTING_KEY,
  type BlogListingEntry,
  type PublishBlogPostInput,
} from "./blogConfig";
import { excerptFromContent, estimateReadTime } from "./blogHelpers";

export type PublishBlogPostResult = {
  slug: string;
  externalPostId: string;
  externalPostUrl: string;
};

function buildListingEntry(
  slug: string,
  content: string,
  metadata: PublishBlogPostInput["metadata"]
): BlogListingEntry {
  return {
    slug,
    title: metadata.title,
    excerpt: metadata.excerpt?.trim() || excerptFromContent(content),
    date: metadata.date || new Date().toISOString().slice(0, 10),
    author: metadata.author || "ManaTap Team",
    category: metadata.category || "Strategy",
    readTime: metadata.readTime || estimateReadTime(content),
    gradient: metadata.gradient || "from-emerald-600 via-teal-600 to-cyan-600",
    icon: metadata.icon || "📰",
    ...(metadata.imageUrl ? { imageUrl: metadata.imageUrl } : {}),
  };
}

async function triggerIndexNow(slug: string): Promise<void> {
  try {
    const { submitToIndexNow } = await import("@/lib/seo/indexnow");
    await submitToIndexNow([`/blog/${slug}`]);
  } catch {
    // Non-fatal
  }
}

/** Single write path: listing metadata + markdown body in app_config. */
export async function publishBlogPost(
  supabase: SupabaseClient,
  input: PublishBlogPostInput
): Promise<PublishBlogPostResult> {
  const slug = input.slug.trim();
  const content = input.content.trim();
  if (!slug || !content) {
    throw new Error("slug and content are required");
  }

  const { data: bodiesRow } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", BLOG_BODIES_KEY)
    .maybeSingle();

  const bodies = { ...((bodiesRow?.value as Record<string, string>) || {}) };
  bodies[slug] = content;

  const { error: bodiesErr } = await supabase.from("app_config").upsert(
    { key: BLOG_BODIES_KEY, value: bodies, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  if (bodiesErr) throw new Error(bodiesErr.message);

  const entry = buildListingEntry(slug, content, input.metadata);

  const { data: blogRow } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", BLOG_LISTING_KEY)
    .maybeSingle();

  const blogData = (blogRow?.value as { entries?: BlogListingEntry[] }) || { entries: [] };
  const entries = Array.isArray(blogData.entries) ? [...blogData.entries] : [];
  const withoutDup = entries.filter((e) => e.slug !== slug);
  withoutDup.unshift(entry);
  withoutDup.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const { error: listingErr } = await supabase.from("app_config").upsert(
    {
      key: BLOG_LISTING_KEY,
      value: { entries: withoutDup, last_updated: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  if (listingErr) throw new Error(listingErr.message);

  await triggerIndexNow(slug);

  const url = `https://www.manatap.ai/blog/${slug}`;
  return { slug, externalPostId: slug, externalPostUrl: url };
}

/** Load all DB-published markdown bodies (admin). */
export async function loadBlogBodies(
  supabase: SupabaseClient
): Promise<Record<string, string>> {
  const { data } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", BLOG_BODIES_KEY)
    .maybeSingle();
  return (data?.value as Record<string, string>) || {};
}

export async function upsertBlogListing(
  supabase: SupabaseClient,
  entries: BlogListingEntry[]
): Promise<void> {
  const sorted = [...entries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const { error } = await supabase.from("app_config").upsert(
    {
      key: BLOG_LISTING_KEY,
      value: { entries: sorted, last_updated: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  if (error) throw new Error(error.message);
}

/** Admin save: publish bodies, sync listing, prune removed slugs. */
export async function saveBlogAdminState(
  supabase: SupabaseClient,
  entries: BlogListingEntry[],
  bodies: Record<string, string>
): Promise<void> {
  const slugs = new Set(entries.map((e) => e.slug));

  for (const entry of entries) {
    const content = bodies[entry.slug]?.trim();
    if (content) {
      await publishBlogPost(supabase, {
        slug: entry.slug,
        content,
        metadata: entry,
      });
    }
  }

  await upsertBlogListing(supabase, entries);

  const current = await loadBlogBodies(supabase);
  const pruned: Record<string, string> = {};
  for (const slug of slugs) {
    if (current[slug]) pruned[slug] = current[slug];
    else if (bodies[slug]?.trim()) pruned[slug] = bodies[slug].trim();
  }

  const { error } = await supabase.from("app_config").upsert(
    { key: BLOG_BODIES_KEY, value: pruned, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  if (error) throw new Error(error.message);

  const withContent = entries.filter((e) => pruned[e.slug]);
  await Promise.all(withContent.map((e) => triggerIndexNow(e.slug)));
}
