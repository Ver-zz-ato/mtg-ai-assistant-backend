# iOS App Store review → Discord alerts

Server-side cron that polls **App Store Connect** for new **written** customer reviews and posts them to a dedicated Discord channel.

## Limitation

This uses `GET /v1/apps/{id}/customerReviews` — **written reviews only**. Star-only ratings without review text may **not** appear in App Store Connect API results, so Discord will not receive every rating event.

**Not truly instant:** Apple does not offer a webhook when someone posts an App Store review. This job **polls** App Store Connect on a schedule (default: every **5 minutes** via Vercel Cron). Worst-case delay is one poll interval after a review appears in Apple’s API (Apple’s own indexing can add a few minutes). For an immediate check after you notice a review in App Store Connect, run the manual `curl` / PowerShell trigger below.

## Architecture

| Piece | Location |
|-------|----------|
| Cron route | `POST` or `GET` `/api/cron/apple-reviews` |
| Dedupe table | `app_store_review_notifications` (Supabase, service role only) |
| Migration | `frontend/db/migrations/144_app_store_review_notifications.sql` |

**First deploy:** When the dedupe table is empty, the job **seeds** the latest fetched reviews **without** Discord (avoids spamming historical reviews). Subsequent runs notify only on new reviews. Use `?forceNotify=1` to override bootstrap (not recommended on production).

## Environment variables (Vercel Production)

Add these in the Vercel project (**server-only**, never `NEXT_PUBLIC_*`):

| Variable | Description |
|----------|-------------|
| `APPLE_ASC_ISSUER_ID` | App Store Connect API Issuer ID (Users and Access → Keys) |
| `APPLE_ASC_KEY_ID` | API key ID (10-char string) |
| `APPLE_ASC_PRIVATE_KEY` | Contents of the `.p8` private key. Paste PEM with real newlines, or use `\n` escapes in one line. |
| `APPLE_ASC_APP_ID` | Numeric **App** resource ID in App Store Connect (not bundle ID) |
| `DISCORD_APP_REVIEWS_WEBHOOK_URL` | Discord channel webhook URL for review alerts |
| `APP_REVIEW_ALERT_SECRET` | Bearer token for manual/cron auth (`Authorization: Bearer …`) |
| `CRON_SECRET` | Already used by Vercel Cron; accepted as fallback so scheduled runs work |

Also required (existing): `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`).

## Create an App Store Connect API key

1. Sign in to [App Store Connect](https://appstoreconnect.apple.com/).
2. **Users and Access** → **Integrations** → **App Store Connect API** → **Team Keys**.
3. Generate a key with at least **Customer Reviews** read access (or Admin if your role bundles it).
4. Download the `.p8` file once — Apple does not let you download it again.
5. Note **Issuer ID** (top of Keys page), **Key ID**, and your app’s **Apple ID** (App Information → Apple ID) for `APPLE_ASC_APP_ID`.

Store the private key in Vercel as `APPLE_ASC_PRIVATE_KEY` (multiline PEM or single line with `\n`).

## Create a Discord webhook

1. In Discord: channel **Edit Channel** → **Integrations** → **Webhooks** → **New Webhook**.
2. Name it (e.g. `ManaTap App Reviews`) and copy the webhook URL.
3. Set `DISCORD_APP_REVIEWS_WEBHOOK_URL` in Vercel.

Never commit webhook URLs or Apple keys to git.

## Apply the migration

Run `frontend/db/migrations/144_app_store_review_notifications.sql` against production Supabase (SQL editor or your usual migration process).

Rollback SQL:

```sql
DROP TABLE IF EXISTS public.app_store_review_notifications;
```

## Manual test (curl)

Replace placeholders with your values.

```bash
# Dry run — no DB writes, no Discord
curl -sS -X POST "https://www.manatap.ai/api/cron/apple-reviews?dryRun=1" \
  -H "Authorization: Bearer YOUR_APP_REVIEW_ALERT_SECRET"

# Real run (after migration + env)
curl -sS -X POST "https://www.manatap.ai/api/cron/apple-reviews" \
  -H "Authorization: Bearer YOUR_APP_REVIEW_ALERT_SECRET"
```

Expected success body:

```json
{ "ok": true, "checked": 20, "newReviews": 0 }
```

First run on an empty table may return `bootstrapped` and `skippedBootstrapNotify: true` with `newReviews: 0`.

## Vercel Cron

Configured in `frontend/vercel.json`:

- Path: `/api/cron/apple-reviews`
- Schedule: every **5 minutes** (`*/5 * * * *` UTC).

Vercel sends `Authorization: Bearer $CRON_SECRET`. This route also accepts `APP_REVIEW_ALERT_SECRET`. You can use the same value for both or rely on `CRON_SECRET` for scheduled runs only.

## Query parameters

| Param | Effect |
|-------|--------|
| `dryRun=1` | Log what would be sent; no inserts, no Discord |
| `forceNotify=1` | Skip empty-table bootstrap; may Discord-notify all unseen reviews |

Header alternative for dry run: `X-Dry-Run: 1`.

## Security

- Apple credentials and Discord webhook stay **server-side only**.
- Route returns `401` without a valid Bearer secret.
- Table has RLS (service role only) and revoked grants for `anon` / `authenticated`.

## Related docs

- `frontend/docs/CRONS.md` — full cron schedule
- `docs/SUPABASE_SCHEMA.md` — table reference (after migration applied)
