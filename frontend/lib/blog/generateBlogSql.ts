import type { BlogListingEntry } from "./blogConfig";
import { excerptFromContent, estimateReadTime } from "./blogHelpers";

export type BlogSqlPayload = BlogListingEntry & {
  content: string;
};

function pickDollarTag(content: string): string {
  const candidates = ["body", "blog_body", "content", "markdown"];
  for (const tag of candidates) {
    if (!content.includes(`$${tag}$`)) return tag;
  }
  return `blog_${Date.now()}`;
}

function sqlEscapeJsonString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

/** Generate paste-ready SQL for Supabase SQL Editor (both app_config keys). */
export function generateBlogSql(payload: BlogSqlPayload): string {
  const slug = payload.slug.trim();
  const content = payload.content.trim();
  const entry = {
    slug,
    title: payload.title,
    excerpt: payload.excerpt?.trim() || excerptFromContent(content),
    date: payload.date || new Date().toISOString().slice(0, 10),
    author: payload.author || "ManaTap Team",
    category: payload.category || "Strategy",
    readTime: payload.readTime || estimateReadTime(content),
    gradient: payload.gradient || "from-emerald-600 via-teal-600 to-cyan-600",
    icon: payload.icon || "📰",
    ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
  };

  const tag = pickDollarTag(content);
  const entryJson = JSON.stringify(entry).replace(/'/g, "''");

  return `-- Publish blog: ${entry.title}
-- Slug: ${slug}
-- Run in Supabase SQL Editor (Dashboard). Do not run via MCP agents.

DO $$
DECLARE
  current_blog JSONB;
  current_bodies JSONB;
  new_entry JSONB;
  filtered JSONB;
  updated_blog JSONB;
  body_text TEXT := $${tag}$${content}$${tag}$;
BEGIN
  new_entry := '${entryJson}'::jsonb;

  -- 1) Listing metadata (app_config.blog)
  SELECT value INTO current_blog FROM app_config WHERE key = 'blog';

  IF current_blog IS NULL OR current_blog->'entries' IS NULL THEN
    updated_blog := jsonb_build_object(
      'entries', jsonb_build_array(new_entry),
      'last_updated', NOW()::text
    );
  ELSE
    SELECT COALESCE(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
    INTO filtered
    FROM jsonb_array_elements(current_blog->'entries') WITH ORDINALITY AS t(elem, ord)
    WHERE (elem->>'slug') <> '${sqlEscapeJsonString(slug)}';

    updated_blog := jsonb_set(
      current_blog,
      '{entries}',
      jsonb_build_array(new_entry) || COALESCE(filtered, '[]'::jsonb)
    );
    updated_blog := jsonb_set(updated_blog, '{last_updated}', to_jsonb(NOW()::text));
  END IF;

  INSERT INTO app_config (key, value, updated_at)
  VALUES ('blog', updated_blog, NOW())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

  -- 2) Article body (app_config.blog_marketing_bodies)
  SELECT value INTO current_bodies FROM app_config WHERE key = 'blog_marketing_bodies';

  IF current_bodies IS NULL THEN
    current_bodies := '{}'::jsonb;
  END IF;

  current_bodies := jsonb_set(current_bodies, ARRAY['${sqlEscapeJsonString(slug)}'], to_jsonb(body_text));

  INSERT INTO app_config (key, value, updated_at)
  VALUES ('blog_marketing_bodies', current_bodies, NOW())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

  RAISE NOTICE 'Blog published: /blog/${sqlEscapeJsonString(slug)}';
END $$;
`;
}
