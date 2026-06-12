#!/usr/bin/env node
/**
 * Generate paste-ready Supabase SQL for a blog post (listing + body).
 *
 * Usage:
 *   node scripts/generate-blog-sql.mjs path/to/post.json
 *   node scripts/generate-blog-sql.mjs path/to/post.json --out db/migrations/111_blog_my-slug.sql
 *   cat post.json | node scripts/generate-blog-sql.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

function estimateReadTime(content) {
  const words = content.split(/\s+/).filter(Boolean).length;
  return `${Math.max(3, Math.ceil(words / 200))} min read`;
}

function excerptFromContent(content) {
  const plain = content.replace(/^#+\s+/gm, "").replace(/\*\*/g, "");
  const para = plain.split("\n").find((l) => l.trim().length > 40) || plain;
  const trimmed = para.trim();
  return trimmed.slice(0, 200) + (trimmed.length > 200 ? "…" : "");
}

function pickDollarTag(content) {
  for (const tag of ["body", "blog_body", "content", "markdown"]) {
    if (!content.includes(`$${tag}$`)) return tag;
  }
  return `blog_${Date.now()}`;
}

function sqlEscape(value) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

function generateBlogSql(payload) {
  const slug = String(payload.slug || "").trim();
  const content = String(payload.content || "").trim();
  if (!slug || !content) {
    throw new Error("JSON must include slug and content");
  }
  if (!content.startsWith("# ")) {
    console.warn("Warning: content should start with '# Title' (H1 markdown)");
  }

  const entry = {
    slug,
    title: payload.title || content.split("\n").find((l) => l.startsWith("# "))?.replace(/^#\s+/, "") || "ManaTap Blog",
    excerpt: (payload.excerpt || "").trim() || excerptFromContent(content),
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
  const safeSlug = sqlEscape(slug);

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
    WHERE (elem->>'slug') <> '${safeSlug}';

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

  SELECT value INTO current_bodies FROM app_config WHERE key = 'blog_marketing_bodies';

  IF current_bodies IS NULL THEN
    current_bodies := '{}'::jsonb;
  END IF;

  current_bodies := jsonb_set(current_bodies, ARRAY['${safeSlug}'], to_jsonb(body_text));

  INSERT INTO app_config (key, value, updated_at)
  VALUES ('blog_marketing_bodies', current_bodies, NOW())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

  RAISE NOTICE 'Blog published: /blog/${safeSlug}';
END $$;
`;
}

function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  let outPath = null;
  let inputPath = null;
  if (outIdx >= 0) {
    outPath = args[outIdx + 1];
    inputPath = args.filter((_, i) => i !== outIdx && i !== outIdx + 1)[0];
  } else {
    inputPath = args[0];
  }

  let raw;
  if (inputPath) {
    raw = readFileSync(resolve(inputPath), "utf8");
  } else if (!process.stdin.isTTY) {
    raw = readFileSync(0, "utf8");
  } else {
    console.error("Usage: node scripts/generate-blog-sql.mjs <post.json> [--out migration.sql]");
    process.exit(1);
  }

  const payload = JSON.parse(raw);
  const sql = generateBlogSql(payload);

  if (outPath) {
    writeFileSync(resolve(outPath), sql, "utf8");
    console.error(`Wrote ${outPath}`);
  } else {
    process.stdout.write(sql);
  }
}

main();
