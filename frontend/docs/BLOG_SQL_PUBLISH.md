# SQL-first blog publishing

Publish new ManaTap blog posts to **website + mobile app** without a frontend deploy.

## How it works

| `app_config` key | What it stores | Used by |
|------------------|----------------|---------|
| `blog` | Listing cards (slug, title, excerpt, date, category, …) | `/blog`, `GET /api/blog`, mobile Discover |
| `blog_marketing_bodies` | Full markdown per slug | `/blog/[slug]` via `getDbBlogPost()` |

Mobile does **not** store article bodies — it lists from `GET /api/blog` and loads `https://www.manatap.ai/blog/[slug]`.

## Required JSON payload

```json
{
  "slug": "my-post-slug",
  "title": "My Post Title",
  "excerpt": "1–2 sentence card summary.",
  "date": "2026-06-12",
  "author": "ManaTap Team",
  "category": "Commander",
  "readTime": "8 min read",
  "gradient": "from-red-600 via-blue-600 to-indigo-600",
  "icon": "🦸",
  "content": "# My Post Title\n\nMarkdown body…"
}
```

- **`slug`** and **`content`** are required.
- **`content`** must start with `# Title` (H1).
- **Categories:** `Announcement`, `Budget Building`, `Strategy`, `Commander`.
- **`excerpt`**, **`readTime`** — optional; auto-derived from content if omitted.

## Generate SQL

From `mtg_ai_assistant/frontend`:

```bash
node scripts/generate-blog-sql.mjs path/to/post.json
```

Save to a migration file:

```bash
node scripts/generate-blog-sql.mjs path/to/post.json --out db/migrations/111_blog_my-slug.sql
```

## Publish

1. Paste the SQL into **Supabase Dashboard → SQL Editor**.
2. Run it (do **not** run via MCP agents).
3. Verify:
   - https://www.manatap.ai/blog/your-slug
   - https://www.manatap.ai/api/blog (entry present)
   - Mobile: Discover → Blogs → open post

Article pages may take up to ~5 minutes to refresh (ISR `revalidate = 300`).

## Alternatives (same backend)

- **Admin → Blog** — metadata + markdown body, Save publishes both keys.
- **Admin → Marketing Radar** — approve blog draft → Publish to blog (optional slug/category overrides).

## Agent contract

When asked to publish a blog:

1. Produce the JSON payload above.
2. Run `node scripts/generate-blog-sql.mjs` (or emit equivalent SQL).
3. Give verification URLs.
4. Do **not** edit `blog-defaults.ts` or `blogContent` unless asked for a permanent code fallback.

## Legacy code fallback

Older posts may still exist in `lib/blog-defaults.ts` and `app/blog/[slug]/page.tsx` → `blogContent`. New posts should use Supabase only.
