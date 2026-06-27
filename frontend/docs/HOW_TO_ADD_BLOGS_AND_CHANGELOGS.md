# How to Add Blogs & Changelogs

This guide explains how to add new blog posts and changelog entries to ManaTap.

---

## Overview

| Item | Storage | Where it appears |
|------|---------|------------------|
| **Changelog** | Supabase `app_config` (key: `changelog`) | What's New page |
| **Blog listing (new posts)** | Supabase `app_config` (key: `blog`) | `/blog`, `GET /api/blog`, mobile Discover |
| **Blog body (new posts)** | Supabase `app_config` (key: `blog_marketing_bodies`) | `/blog/[slug]`, mobile reader (via website HTML) |
| **Legacy fallback** | `lib/blog-defaults.ts` + `blogContent` in code | Offline / API failure only |

**Recommended for new posts:** SQL, Admin → Blog, or Marketing Radar → Publish to blog. See **`docs/BLOG_SQL_PUBLISH.md`** for the agent/SQL workflow.

---

## 1. Adding a Changelog Entry

### Option A: SQL Migration (recommended)

Create a new migration file, e.g. `frontend/db/migrations/086_your_feature.sql`:

```sql
-- Changelog: Your Feature Name
DO $$
DECLARE
  current_changelog JSONB;
  new_entry JSONB;
  updated_changelog JSONB;
BEGIN
  SELECT value INTO current_changelog
  FROM app_config
  WHERE key = 'changelog';

  new_entry := jsonb_build_object(
    'version', 'Your Version',
    'date', 'YYYY-MM-DD',
    'title', 'Short title for the changelog',
    'type', 'feature',
    'description', 'Summary paragraph.',
    'features', jsonb_build_array(
      'Feature 1 — description',
      'Feature 2 — description'
    ),
    'fixes', jsonb_build_array(
      'Fix 1',
      'Fix 2'
    )
  );

  IF current_changelog IS NULL OR current_changelog->'entries' IS NULL THEN
    updated_changelog := jsonb_build_object(
      'entries', jsonb_build_array(new_entry),
      'last_updated', NOW()::text
    );
  ELSE
    updated_changelog := jsonb_set(
      current_changelog,
      '{entries}',
      jsonb_build_array(new_entry) || (current_changelog->'entries')
    );
    updated_changelog := jsonb_set(
      updated_changelog,
      '{last_updated}',
      to_jsonb(NOW()::text)
    );
  END IF;

  INSERT INTO app_config (key, value, updated_at)
  VALUES ('changelog', updated_changelog, NOW())
  ON CONFLICT (key)
  DO UPDATE SET value = updated_changelog, updated_at = NOW();

  RAISE NOTICE 'Changelog updated';
END $$;
```

**Run in Supabase:** Dashboard → SQL Editor → Paste & Run.

### Option B: Admin UI

Use Admin → Changelog when available.

---

## 2. Adding a Blog Post (recommended: SQL-first)

New posts need **both** Supabase keys:

1. **`blog`** — card metadata (title, excerpt, slug, date, category, …)
2. **`blog_marketing_bodies`** — full markdown (`{ "slug": "# Title\n\n..." }`)

### Option A: Generate SQL (agents / manual)

```bash
cd frontend
node scripts/generate-blog-sql.mjs path/to/post.json
```

See **`docs/BLOG_SQL_PUBLISH.md`** for JSON shape, examples, and verification.

### Option B: Admin → Blog

1. Open `/admin/blog`
2. Add entry metadata + **markdown body** (starts with `# Title`)
3. **Save Changes** — writes both keys
4. **Copy SQL** — backup script for Supabase

### Option C: Marketing Radar

1. Approve the **blog** draft in step 3
2. In step 4, set slug/category (optional) → **Publish to blog**

### Legacy: code fallback (old posts only)

Only needed if you want a permanent bundle fallback without Supabase:

- `lib/blog-defaults.ts` → `DEFAULT_BLOG_POSTS`
- `app/blog/[slug]/page.tsx` → `blogContent`

Do **not** use this for routine new posts.

---

## 3. Troubleshooting

### Card shows on `/blog` but article 404

You updated **`blog`** (listing) but not **`blog_marketing_bodies`** (body). Run full publish SQL or add body in Admin → Blog.

### Post doesn't appear after SQL

1. Confirm both keys in Supabase:
   ```sql
   SELECT key FROM app_config WHERE key IN ('blog', 'blog_marketing_bodies');
   ```
2. Check `GET /api/blog` returns your slug.
3. Hard-refresh `/blog/[slug]` (ISR revalidates every ~5 minutes).

### Mobile Discover

No app deploy needed — listing from `GET /api/blog`, article from `https://www.manatap.ai/blog/[slug]`.

---

## 4. Checklist

- [ ] Blog: SQL (both keys) **or** Admin save **or** Marketing Radar publish
- [ ] Verify: `/blog` card, `/blog/your-slug` article, mobile Discover
- [ ] Changelog (if applicable): SQL or admin

---

## 5. Reference

- **SQL publish guide:** `docs/BLOG_SQL_PUBLISH.md`
- **Sources audit:** `docs/BLOG_SOURCES_OF_TRUTH_AUDIT.md` (repo root `docs/`)
- **Listing-only SQL template:** `db/migrations/109_blog_may_2026_three_posts.sql`
- **Full publish example:** `db/migrations/110b_blog_marvel_precon_body.sql`
