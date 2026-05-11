# IndexNow Setup

ManaTap supports IndexNow for public URL change notifications on `https://www.manatap.ai`.

## Vercel Environment Variables

Add these to the production Vercel project:

```bash
INDEXNOW_KEY=<32-character-key>
INDEXNOW_ENABLED=true
NEXT_PUBLIC_SITE_URL=https://www.manatap.ai
```

`INDEXNOW_ENABLED` is optional, but setting it explicitly keeps the production behavior obvious. Set it to `false` to pause submissions without changing code.

## Key File Verification

The app serves the key dynamically from the App Router catch-all route. The key is not committed to git.

After deploy, verify:

```bash
curl https://www.manatap.ai/$INDEXNOW_KEY.txt
```

The response must be `200`, `text/plain`, and contain only the key.

## Submit One URL

The protected admin endpoint accepts admin session auth or the existing admin/cron token headers used by SEO tooling.

```bash
curl -X POST https://www.manatap.ai/api/admin/indexnow/submit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"urls":["https://www.manatap.ai/blog/how-manatap-ai-works"]}'
```

The endpoint normalizes to `https://www.manatap.ai`, removes duplicates, strips query strings and hashes, and skips private routes such as `/admin`, `/api`, `/profile`, `/my-decks`, account, billing, auth, and checkout URLs.

## Sitemap Backfill

Dry-run from the canonical sitemap:

```bash
npm run seo:indexnow -- --dry-run
```

Submit from the sitemap:

```bash
npm run seo:indexnow -- --submit --limit=500
```

Omit `--limit` to submit all eligible sitemap URLs. The helper batches at IndexNow's 10,000 URL request limit.

## Bing Webmaster Tools

In Bing Webmaster Tools:

1. Generate or paste the same 32-character key.
2. Confirm the key file is reachable at `https://www.manatap.ai/<KEY>.txt`.
3. Submit a test URL through `/api/admin/indexnow/submit`.
4. Open the IndexNow section in Bing Webmaster Tools and verify the submitted URL appears.

## Rollback

Set `INDEXNOW_ENABLED=false` in Vercel to stop submissions immediately. To remove the feature completely, revert the IndexNow utility, catch-all key route, admin endpoint, sitemap script, and the small publish-hook calls.
