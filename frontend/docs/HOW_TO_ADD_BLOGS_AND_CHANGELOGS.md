# How to Add Blogs & Changelogs

This guide explains how to add new blog posts and changelog entries to ManaTap AI.

---

## Overview

| Item | Storage | Where it appears |
|------|---------|------------------|
| **Changelog** | Supabase `app_config` (key: `changelog`) | What's New page |
| **Blog listing** | `lib/blog-defaults.ts` (canonical); API enriches only | Blog index (`/blog`) |
| **Blog content** | Codebase `app/blog/[slug]/page.tsx` | Individual post pages |
| **Blog defaults** | `lib/blog-defaults.ts` | Listing + sitemap + Admin Import |

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
    'type', 'feature',  -- or 'fix', 'announcement'
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

**Run in Supabase:** Dashboard → SQL Editor → New query → Paste & Run.

### "I ran the SQL but the post still doesn't show on /blog"

1. **Redeploy the frontend**  
   The blog listing uses `DEFAULT_BLOG_POSTS` from `lib/blog-defaults.ts` and merges with the API. If the live site was built before "Roast My Deck" (or your post) was added to the codebase, the card won't appear until you deploy a new build.

2. **Confirm the SQL ran in the right project**  
   The API reads from Supabase `app_config` (key: `blog`). In Supabase SQL Editor run:
   ```sql
   SELECT key, jsonb_array_length(value->'entries') AS entry_count
   FROM app_config WHERE key = 'blog';
   ```
   You should see `entry_count` ≥ 1. If the row is missing or `entries` is empty, run the blog migration (e.g. `092_blog_roast_my_deck_only.sql`) again in that project.

3. **Check RLS on `app_config`**  
   If Row Level Security is enabled, ensure the role used by the app (e.g. `anon` or your server role) can `SELECT` from `app_config`. Otherwise `/api/blog` may return empty entries.

### Option B: Admin UI

Use Admin → Changelog (or POST to `/api/admin/changelog`) if available. The SQL migration is still the most reliable.

---

## 2. Adding a Blog Post

You need to touch **three places** so the post appears and the full content renders. The sitemap uses `blog-defaults.ts`, so no separate sitemap edit is needed. See `docs/BLOG_SOURCES_OF_TRUTH_AUDIT.md` for how listing, API, and sitemap relate.

### Step 1: Add metadata to `lib/blog-defaults.ts`

Add a new entry to the `DEFAULT_BLOG_POSTS` array (newest first):

```ts
{
  slug: 'your-post-slug',
  title: 'Your Post Title',
  excerpt: '1–2 sentence summary for the card.',
  date: 'YYYY-MM-DD',
  author: 'ManaTap Team',
  category: 'Announcement',  // or 'Budget Building', 'Strategy', 'Commander'
  readTime: '6 min read',
  gradient: 'from-purple-600 via-pink-600 to-rose-600',
  icon: '✨',
  imageUrl: 'https://...',  // optional
}
```

**Categories:** `Announcement`, `Budget Building`, `Strategy`, `Commander`

### Step 2: Add full content to `app/blog/[slug]/page.tsx`

In the `blogContent` object, add a new key matching your slug:

```ts
'your-post-slug': {
  title: 'Your Post Title',
  date: 'YYYY-MM-DD',
  author: 'ManaTap Team',
  category: 'Announcement',
  readTime: '6 min read',
  gradient: 'from-purple-600 via-pink-600 to-rose-600',
  icon: '✨',
  content: `
# Your Post Title

Your markdown content here. Use ## for sections.

## Section 1

...
  `,
},
```

### Step 3: Add to Supabase (optional but recommended)

If you use DB-backed blog, add the entry via SQL so the API returns it. Create a migration similar to the changelog:

```sql
DO $$
DECLARE
  current_blog JSONB;
  new_entry JSONB;
  updated_blog JSONB;
BEGIN
  SELECT value INTO current_blog FROM app_config WHERE key = 'blog';

  new_entry := jsonb_build_object(
    'slug', 'your-post-slug',
    'title', 'Your Post Title',
    'excerpt', '1–2 sentence summary.',
    'date', 'YYYY-MM-DD',
    'author', 'ManaTap Team',
    'category', 'Announcement',
    'readTime', '6 min read',
    'gradient', 'from-purple-600 via-pink-600 to-rose-600',
    'icon', '✨'
  );

  IF current_blog IS NULL OR current_blog->'entries' IS NULL THEN
    updated_blog := jsonb_build_object(
      'entries', jsonb_build_array(new_entry),
      'last_updated', NOW()::text
    );
  ELSE
    updated_blog := jsonb_set(
      current_blog,
      '{entries}',
      jsonb_build_array(new_entry) || (current_blog->'entries')
    );
    updated_blog := jsonb_set(updated_blog, '{last_updated}', to_jsonb(NOW()::text));
  END IF;

  INSERT INTO app_config (key, value, updated_at)
  VALUES ('blog', updated_blog, NOW())
  ON CONFLICT (key) DO UPDATE SET value = updated_blog, updated_at = NOW();
END $$;
```

**Important:** The blog page merges API entries with `DEFAULT_BLOG_POSTS` (see `app/blog/page.tsx`). Entries in the DB override/add to defaults; defaults are never removed.

---

## 3. Checklist

- [ ] Changelog: SQL migration or admin update
- [ ] Blog: Add to `lib/blog-defaults.ts`
- [ ] Blog: Add full content to `app/blog/[slug]/page.tsx` under `blogContent`
- [ ] Blog (optional): SQL migration for `app_config.blog`
- [ ] Verify: `/blog` shows the new post, `/blog/your-slug` renders correctly
- [ ] Verify: What's New shows the changelog entry

---

## 4. Reference: Migration Template

See `frontend/db/migrations/085_changelog_and_blog_march_2025.sql` for a complete example that adds both a changelog entry and a blog entry in one file.
