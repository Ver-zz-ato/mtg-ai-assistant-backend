# SEO Indexing Booster Workflow

After major deploys, use this workflow to boost indexation of priority pages in Google Search Console.

## 1. Get Priority URLs

**Admin route** (requires auth):

```
GET /api/admin/seo/priority-urls
```

Returns ~100 URLs: homepage, commanders, cards, blog, meta, top commanders, top blog posts, top SEO pages.

**Or run locally** (with dev server + admin auth):

```bash
curl -H "Cookie: <your-admin-session-cookie>" https://www.manatap.ai/api/admin/seo/priority-urls
```

## 2. Request Indexing in GSC

1. Open [Google Search Console](https://search.google.com/search-console)
2. Select property: `https://www.manatap.ai`
3. Use **URL Inspection** (left sidebar)
4. Paste each priority URL
5. Click **Request indexing**

Repeat for the top 20–50 URLs after each major deploy. GSC limits how many requests you can submit per day.

## 3. When to Run

- After deploying canonical/redirect changes
- After adding new commander or card pages
- After publishing new blog posts
- When GSC shows "Discovered – currently not indexed" for key pages

## 4. Verification Commands

```bash
# Canonical + redirect (apex → www)
curl -I https://manatap.ai
# Expect: 308, Location: https://www.manatap.ai/

# Trailing slash → no slash
curl -I https://www.manatap.ai/commanders/
# Expect: 308, Location: https://www.manatap.ai/commanders

# Sitemap
curl -s https://www.manatap.ai/sitemap.xml | head -20

# Validate sitemap URLs (CI)
npm run seo:validate-sitemap
```

## 5. Sitemap Validation

Run in CI or locally against production:

```bash
npm run seo:validate-sitemap
```

Samples URLs from each sitemap segment and asserts each returns 200 or single-hop 308. Fails if any URL returns 404, 5xx, or redirect chain >1.
