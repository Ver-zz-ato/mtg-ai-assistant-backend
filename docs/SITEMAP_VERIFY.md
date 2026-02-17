# Sitemap verification

Verify sitemap is fetchable on both hostnames:

```bash
# Both should return 200 with content-type: application/xml
curl -I https://www.manatap.ai/sitemap.xml
curl -I https://manatap.ai/sitemap.xml
```

Expected:
- `HTTP/2 200` (or `HTTP/1.1 200`)
- `content-type: application/xml`
- No redirect loops (single-hop 308 from apex → www is OK)

If www returns 404, check:
1. Vercel domain config: both manatap.ai and www.manatap.ai assigned to the project
2. Middleware matcher excludes sitemap (see `middleware.ts` config)
