import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublishResult } from "./publishToX";

const BLOG_BODIES_KEY = "blog_marketing_bodies";

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  const date = new Date().toISOString().slice(0, 10);
  return `${date}-${base || "manatap-update"}`.replace(/--+/g, "-");
}

function estimateReadTime(content: string): string {
  const words = content.split(/\s+/).filter(Boolean).length;
  const mins = Math.max(3, Math.ceil(words / 200));
  return `${mins} min read`;
}

function excerptFromContent(content: string): string {
  const plain = content.replace(/^#+\s+/gm, "").replace(/\*\*/g, "");
  const para = plain.split("\n").find((l) => l.trim().length > 40) || plain;
  return para.trim().slice(0, 200) + (para.length > 200 ? "…" : "");
}

export async function publishToBlog(
  admin: SupabaseClient,
  content: string,
  opts?: { title?: string }
): Promise<PublishResult & { slug: string }> {
  const lines = content.trim().split("\n");
  const titleLine = lines.find((l) => l.startsWith("# "));
  const title =
    opts?.title?.trim() ||
    (titleLine ? titleLine.replace(/^#\s+/, "").trim() : "ManaTap MTG Update");

  const slug = slugify(title);
  const date = new Date().toISOString().slice(0, 10);

  const { data: bodiesRow } = await admin
    .from("app_config")
    .select("value")
    .eq("key", BLOG_BODIES_KEY)
    .maybeSingle();

  const bodies = ((bodiesRow?.value as Record<string, string>) || {}) as Record<string, string>;
  bodies[slug] = content;

  await admin.from("app_config").upsert(
    { key: BLOG_BODIES_KEY, value: bodies, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );

  const { data: blogRow } = await admin
    .from("app_config")
    .select("value")
    .eq("key", "blog")
    .maybeSingle();

  const blogData = (blogRow?.value as { entries?: unknown[] }) || { entries: [] };
  const entries = Array.isArray(blogData.entries) ? [...blogData.entries] : [];

  const entry = {
    slug,
    title,
    excerpt: excerptFromContent(content),
    date,
    author: "ManaTap Team",
    category: "Meta",
    readTime: estimateReadTime(content),
    gradient: "from-emerald-600 via-teal-600 to-cyan-600",
    icon: "📰",
  };

  const withoutDup = entries.filter(
    (e) => (e as { slug?: string }).slug !== slug
  );
  withoutDup.unshift(entry);

  await admin.from("app_config").upsert(
    {
      key: "blog",
      value: { entries: withoutDup },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  const url = `https://www.manatap.ai/blog/${slug}`;
  return { externalPostId: slug, externalPostUrl: url, slug };
}
