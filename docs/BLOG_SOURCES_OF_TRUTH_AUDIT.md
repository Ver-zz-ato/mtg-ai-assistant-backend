# Blog: sources of truth audit

**Problem:** Roast My Deck (and other posts) sometimes don’t appear on `/blog` after SQL + redeploy. The blog list was effectively coming from two places, with merge logic that could behave differently depending on API success.

---

## Where blog data lives

| Purpose | Source | File / location | Used by |
|--------|--------|------------------|--------|
| **Listing (cards on /blog)** | 1. Code (canonical) | `lib/blog-defaults.ts` → `DEFAULT_BLOG_POSTS` | `app/blog/page.tsx` |
| **Listing (optional override)** | 2. Database | Supabase `app_config` key `blog` → `value.entries` | `GET /api/blog` → `app/blog/page.tsx` |
| **Full post content** | 3. Code only | `app/blog/[slug]/page.tsx` → `blogContent` | `/blog/[slug]` page, `generateStaticParams` |
| **Sitemap blog URLs** | 4. Code (was separate list) | `app/sitemap.ts` → hardcoded `blogPosts` array | Sitemap generation |

So there were **two sources for the listing** (defaults + API) and a **third hardcoded list** in the sitemap.

---

## Intended flow (after fix)

1. **Canonical list of posts** = `DEFAULT_BLOG_POSTS` in `lib/blog-defaults.ts`.  
   The `/blog` page **always** renders this list. It never shows fewer posts than the defaults.

2. **API** (`GET /api/blog`) returns Supabase `app_config.blog.entries`.  
   The page uses this only to **enrich** or **override** fields (e.g. title, excerpt, date) for slugs that exist in the defaults, and to **append** any extra slugs that exist only in the API.  
   If the API fails or returns empty, the page still shows the full default list.

3. **Full content** for `/blog/[slug]` comes only from the `blogContent` object in `app/blog/[slug]/page.tsx`.  
   Adding a new post requires adding an entry there and in `DEFAULT_BLOG_POSTS` (and optionally in DB for admin/overrides).

4. **Sitemap** uses the same default list (or a shared list) so blog URLs stay in sync.

---

## What was changed

- **app/blog/page.tsx**  
  - List is built from `DEFAULT_BLOG_POSTS` first.  
  - API response is merged in by slug (overrides + appends API-only slugs).  
  - If the API fails or returns non-array `entries`, the default list is still shown.  
  - So Roast My Deck (and every other default post) always appears when it’s in `blog-defaults.ts`.

- **app/sitemap.ts**  
  - Blog slugs for the sitemap are derived from `DEFAULT_BLOG_POSTS` (or a shared export) so there is a single list for “which blog posts exist.”

- **docs/HOW_TO_ADD_BLOGS_AND_CHANGELOGS.md**  
  - Already describes the three places to touch (defaults, blogContent, optional SQL).  
  - Troubleshooting section added earlier for “ran SQL but post still doesn’t show.”

---

## Checklist when a post doesn’t show

1. **Is the slug in `lib/blog-defaults.ts`?**  
   If not, add it (newest first). Deploy. The card will show.

2. **Is the slug in `app/blog/[slug]/page.tsx` → `blogContent`?**  
   If not, the card may show but the post page will 404. Add the key and content.

3. **Optional:** Run the blog SQL migration in the correct Supabase project so the API can override metadata.  
   Not required for the card to appear; code defaults are enough.

4. **Redeploy** and do a hard refresh (or incognito) so the new bundle and no-cache request are used.

5. **Sitemap:** If you added a new slug to defaults, ensure the sitemap uses the same list (it does after the sitemap fix).

---

## Summary

- **Listing:** Single source of truth = `DEFAULT_BLOG_POSTS`. API only enriches/appends.  
- **Content:** Single source of truth = `blogContent` in `app/blog/[slug]/page.tsx`.  
- **Sitemap:** Uses the same default list so there are no extra “sources of truth” for blog slugs.
