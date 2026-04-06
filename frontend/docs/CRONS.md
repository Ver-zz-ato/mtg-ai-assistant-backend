# ManaTap Cron Jobs

## Schedule (Vercel)

| Cron | Path | Schedule (UTC) |
|------|------|----------------|
| cleanup-price-cache | `/api/cron/cleanup-price-cache` | 04:00 daily |
| deck-costs | `/api/cron/deck-costs` | 04:30 daily |
| commander-aggregates | `/api/cron/commander-aggregates` | 05:00 daily |
| cleanup-guest-sessions | `/api/cron/cleanup-guest-sessions` | 05:00 daily |
| meta-signals | `/api/cron/meta-signals` | 05:15 daily |
| top-cards | `/api/cron/top-cards` | 05:30 daily |
| cleanup-rate-limits | `/api/cron/cleanup-rate-limits` | 06:00 Sundays |
| ops-report/daily | `/api/cron/ops-report/daily` | 06:00 daily |
| ops-report/weekly | `/api/cron/ops-report/weekly` | 07:00 Sundays |
| budget-swaps-update | `/api/cron/budget-swaps-update` | 03:00 Sundays |
| mtg-legality-refresh | `/api/cron/mtg-legality-refresh` | 02:00 Sundays |
| update-banned-lists | `/api/cron/update-banned-lists` | legacy / manual (optional) |

### Securing `mtg-legality-refresh`

- **Do not** rely on `x-vercel-id` for this route (it is not a secret).
- **Vercel schedule:** add **`CRON_SECRET`** in the Vercel project env. Vercel sends `Authorization: Bearer <CRON_SECRET>` on cron invocations ([docs](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs)). Use the same value as `CRON_KEY` if you want one shared secret.
- **Manual / scripts / admin cron runner:** `x-cron-key` or `?key=` must match `CRON_KEY`, `CRON_SECRET`, or `RENDER_CRON_SECRET`.

## Manual run

```bash
# From frontend/
npx tsx scripts/run-crons.ts all
npx tsx scripts/run-crons.ts deck-costs
npx tsx scripts/run-crons.ts commander-aggregates
npx tsx scripts/run-crons.ts meta-signals
```

Requires `CRON_KEY` or `CRON_SECRET` or `RENDER_CRON_SECRET` in `.env.local`.

For production, use your deployed URL:
```bash
npx tsx scripts/run-crons.ts all https://www.manatap.ai
```

## Dependencies

- **deck-costs** → populates `deck_costs` from `deck_cards` + `price_cache`
- **commander-aggregates** → needs `deck_costs`; populates `commander_aggregates` (deck_count, median_deck_cost, top_cards, etc.). **Commander Intelligence** on commander pages reads from this cache — run this cron after bulk-importing decks to refresh deck counts.
- **meta-signals** → needs `commander_aggregates`; populates `meta_signals` (trending, most-played, budget commanders)

Run in order: deck-costs → commander-aggregates → meta-signals → top-cards.

## Budget Swaps (weekly)

- **budget-swaps-update** — AI-powered refresh of Quick Swaps map. Uses GPT to suggest new expensive→budget pairs, merges into `app_config.budget_swaps`. Hands-off; runs Sundays 03:00 UTC.

## Banned card lists (weekly)

- **update-banned-lists** — Fetches Scryfall oracle_cards bulk (streaming), builds Commander/Modern/Pioneer/Standard/Pauper/Brawl banned lists, upserts into `app_config.banned_cards`. Deck analyze and validation read from `app_config` with bundled JSON fallback. Schedule: e.g. Sundays 02:00 UTC.
