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
- **commander-aggregates** → needs `deck_costs`; populates `commander_aggregates` (deck_count, median_deck_cost, top_cards, etc.)
- **meta-signals** → needs `commander_aggregates`; populates `meta_signals` (trending, most-played, budget commanders)

Run in order: deck-costs → commander-aggregates → meta-signals → top-cards.
