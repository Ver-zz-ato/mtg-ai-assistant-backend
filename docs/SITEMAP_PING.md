# Sitemap Ping

After deploying, notify Google of sitemap updates:

```bash
curl "https://www.google.com/ping?sitemap=https://www.manatap.ai/sitemap.xml"
```

**Bing:**

```bash
curl "https://www.bing.com/ping?sitemap=https://www.manatap.ai/sitemap.xml"
```

**When to run:** After each production deploy that changes sitemap content (new pages, deck updates, etc.). Optionally add to deploy script or CI if trivial.
