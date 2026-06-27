# ManaTap Cron Jobs

## Schedule (Vercel)

| Cron | Path | Schedule (UTC) |
|------|------|----------------|
| price-snapshot | `/api/cron/price/snapshot` | 02:00 daily |
| cleanup-price-cache | `/api/cron/cleanup-price-cache` | 04:00 daily |
| deck-costs | `/api/cron/deck-costs` | 04:30 daily |
| commander-aggregates | `/api/cron/commander-aggregates` | 05:00 daily |
| cleanup-guest-sessions | `/api/cron/cleanup-guest-sessions` | 05:00 daily |
| meta-signals | `/api/cron/meta-signals` | 05:15 daily |
| marketing-radar-daily | `/api/cron/marketing-radar-daily` | 06:30 daily |
| marketing-radar-review | `/api/cron/marketing-radar-review` | 08:00 every 2 days (ingest + brief + Discord review link) |
| external-deck-meta | `/api/cron/external-deck-meta` | every 30 minutes at :17 and :47 |
| top-cards | `/api/cron/top-cards` | 05:30 daily |
| cleanup-rate-limits | `/api/cron/cleanup-rate-limits` | 06:00 Sundays |
| cleanup-shared-links | `/api/cron/cleanup-shared-links` | 06:15 daily |
| ops-report/daily | `/api/cron/ops-report/daily` | 22:30 daily |
| ops-report/weekly | `/api/cron/ops-report/weekly` | 07:00 Sundays |
| mobile-command-center-rollups | `/api/cron/mobile-command-center-rollups` | hourly during launch |
| budget-swaps-update | `/api/cron/budget-swaps-update` | 03:00 Sundays |
| mtg-legality-refresh | `/api/cron/mtg-legality-refresh` | 02:00 Sundays |
| update-banned-lists | `/api/cron/update-banned-lists` | legacy / manual (optional) |
| scan-visual-index | `/api/cron/scan-visual-index` | manual / weekly (mobile bench) |

### Securing Cron Routes

- **Do not** rely on `x-vercel-id`. It is not a secret and can be spoofed by any caller that can send custom headers.
- **Vercel schedule:** set **`CRON_SECRET`** in the Vercel project env. Vercel sends `Authorization: Bearer <CRON_SECRET>` on cron invocations ([docs](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs)).
- **Manual / scripts / admin cron runner:** use the same `Authorization: Bearer <CRON_SECRET>` header.
- **Temporary compatibility only:** some routes still accept `?key=<CRON_SECRET>` to avoid breaking existing manual callers during migration. Remove this once all callers are updated.
- **Mobile Command Center rollups:** Vercel calls `GET /api/cron/mobile-command-center-rollups` hourly with `Authorization: Bearer <CRON_SECRET>`. This refreshes private rollups and sends deduped **hourly** Discord launch alerts only when something is critical: failed daily price jobs, critical Sentry/error spikes, or missing Supabase admin config. Manual admin refresh stays quiet by default; the cockpit has a separate `Test Discord` button for one-off channel verification.
- **Daily ops digest:** `GET /api/cron/ops-report/daily` posts one concise Discord report with separate App, Website, and Summary blocks. It covers visitors, signups, scanner sessions, billable LLM call counts (from `ai_usage`, excludes ai_test/zero-cost rows), route-attributed app/website AI cost, **OpenAI actual spend from the OpenAI Costs API** (`OPENAI_ADMIN_API_KEY`, optionally filtered with `OPENAI_USAGE_API_KEY_IDS` / `OPENAI_USAGE_PROJECT_IDS`), Stripe subs, app subs from RevenueCat webhook-synced profile state, Sentry, rate limits, and stale/degraded job watch items. Conditional lines include non-zero AI error rates, top rate-limited route, and new Pro events. Warning-level items such as rate-limit pressure, analytics config gaps, cache reuse, and stale data/jobs stay in the report but are not promoted to launch alerts. `22:30 UTC` matches `23:30` in London during BST; it will arrive an hour earlier in winter unless the cron is adjusted seasonally.
- **Weekly ops digest:** `GET /api/cron/ops-report/weekly` (Sundays 07:00 UTC) posts Scryfall bulk, legality refresh, and budget swaps freshness.
- For human launch flow, pair this cron with `docs/LAUNCH_DAY_RUNBOOK.md` so Discord alerts are only one input, not the whole decision process.

## Manual run

```bash
# From frontend/
npx tsx scripts/run-crons.ts all
npx tsx scripts/run-crons.ts deck-costs
npx tsx scripts/run-crons.ts commander-aggregates
npx tsx scripts/run-crons.ts meta-signals
```

Requires `CRON_SECRET` in `.env.local`.

For production, use your deployed URL:
```bash
npx tsx scripts/run-crons.ts all https://www.manatap.ai
```

## Dependencies

- **bulk-price-import** -> external GitHub Actions schedule calls Render `/bulk-price-import` daily at 02:00 UTC; streams Scryfall `default_cards` and upserts `price_cache` for cards in `scryfall_cache`.
- **price-snapshot** → Vercel `/api/cron/price/snapshot` is the canonical daily owner at 02:00 UTC. In production it delegates to Render `/price-snapshot` when `BULK_JOBS_URL` is configured; the worker snapshots `price_cache` into `price_snapshots` (USD/EUR/GBP), keeps ~60 days.
- **deck-costs** → populates `deck_costs` from `deck_cards` + `price_cache`
- **commander-aggregates** → needs `deck_costs`; populates `commander_aggregates` (deck_count, median_deck_cost, top_cards, etc.). **Commander Intelligence** on commander pages reads from this cache — run this cron after bulk-importing decks to refresh deck counts.
- **meta-signals** → populates `meta_signals` (blended **Scryfall** EDHREC + ManaTap decks), optional rows in **`meta_commander_daily`** / **`meta_card_daily`** when those tables exist (migration in Manatap-APP `docs/supabase/migrations/20260419_meta_external_daily.sql`). Does **not** require `commander_aggregates`. `trending-cards` still starts from internal trend deltas, but if that list is too sparse for Discover it is topped up from filtered global popular-card rows before publish. Writes `app_config`: `job:last:meta-signals`, `job:meta-signals:attempt`, `job:meta-signals:detail` (JSON status for admin QA).
- **external-deck-meta** → admin-only QA pipeline for public Archidekt/Moxfield deck data. It runs every 30 minutes through a target-driven allocator with a hard cap of 25 Archidekt detail fetches per run, but cron stops detail fetching early when its processing time budget is reached so touched-profile regeneration and the final heartbeat can complete inside the 120s route window. Before 100 Community Profile-eligible commanders exist, cron maintains up to 60 due focused Archidekt growth candidates while processing only the safe per-run fetch cap; after that target it biases toward refreshing old eligible deck data. Growth targeting prioritizes commanders at 25-49 approved samples, can search multiple pages for near-eligible profiles, and backs off poor-yield commander searches through `app_config.external_deck_meta:growth_target_stats` so the allocator stops repeating searches that return no fresh deck IDs. It writes `external_decks`, `external_deck_cards`, and targeted `external_commander_profiles` during cron, and never writes public `meta_signals` or mobile output. Scheduled cron defers global `external_meta_rollups_daily` rebuilds; manual admin runs still perform full rollup/profile regeneration. Moxfield is curated URL only in V1; Moxfield discovery remains disabled. Source cooldowns respect `Retry-After`; repeated 403/timeouts cool down the source. Cron runs write a lightweight heartbeat to `app_config.external_deck_meta:last_cron_heartbeat` before heavy work starts, and allocator summaries are stored in `app_config.external_deck_meta:last_allocator_summary` for admin QA. Cron profile regeneration is targeted to commanders touched by the processed batch; manual admin runs still perform full rollup/profile regeneration.
- **cleanup-shared-links** → deletes expired rows from `shared_health_reports`, `shared_analysis_reports`, and related `shared_item_comments`. This keeps public share links and comment visibility aligned with expiry behavior used by the mobile app and website.
- **Tournament Manager V1** currently has invite/event `expires_at` columns but no scheduled cleanup cron. Expired tournament invites are rejected by `/api/mobile/tournaments/join`; add a dedicated cleanup cron later if storage volume becomes meaningful during beta.

Run in order: bulk-price-import → price-snapshot → deck-costs → commander-aggregates → meta-signals → top-cards. `cleanup-shared-links` is independent but should stay scheduled before launch if expiring share links are user-facing.

## Snapshot source of truth

- The production daily history source is the website cron route **`/api/cron/price/snapshot`** (Vercel cron).
- GitHub Actions no longer schedules snapshots daily; the backup snapshot workflow is manual-only.
- Keep Render `/price-snapshot` available for Vercel delegation and emergency manual runs.

## Operator note

- After deploying a retention fix, run **`POST /api/admin/data/cleanup-snapshots`** once with typed confirmation `DELETE` to remove any pre-existing backlog older than 60 days.
- Verify the oldest retained `price_snapshots.snapshot_date` is within the last 60 days before treating Disk I/O as normalized.

## Budget Swaps (weekly)

- **budget-swaps-update** — AI-powered refresh of Quick Swaps map. Uses GPT to suggest new expensive→budget pairs, merges into `app_config.budget_swaps`. Hands-off; runs Sundays 03:00 UTC.

## Banned card lists (weekly)

- **update-banned-lists** — Fetches Scryfall oracle_cards bulk (streaming), builds Commander/Modern/Pioneer/Standard/Pauper/Brawl banned lists, upserts into `app_config.banned_cards`. Deck analyze and validation read from `app_config` with bundled JSON fallback. Schedule: e.g. Sundays 02:00 UTC.

## Scan visual index (mobile dev bench)

- **scan-visual-index** — Builds dHash (A) and 768-dim grid (B) indexes from `scryfall_cache` (`normal` by default, or `art_crop` via `SCAN_VISUAL_INDEX_IMAGE_SOURCE`), uploads to Storage bucket `scan-index` + `manifest.json` (`imageSource` field). See `docs/SCAN_VISUAL_INDEX_STORAGE.md`. Test: `POST /api/cron/scan-visual-index?limit=500` with cron auth.
- Mobile: `EXPO_PUBLIC_SCAN_INDEX_MANIFEST_URL` → public manifest URL.
