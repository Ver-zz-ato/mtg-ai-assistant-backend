# Marketing Radar (admin)

Internal admin tool for collecting MTG marketing signals, generating AI briefs, and drafting social/blog content for **manual approval only**. Nothing auto-posts.

## Access

- **UI:** `/admin/marketing-radar` (protected by `AdminGuard` + env allowlist)
- **Auth:** `ADMIN_USER_IDS` / `ADMIN_EMAILS` on all `/api/admin/*` routes via `requireAdminForApi()`

## Database

Apply migrations in Supabase SQL Editor:

1. `frontend/db/migrations/138_marketing_radar.sql`
2. `frontend/db/migrations/139_marketing_radar_phase2.sql`
3. `frontend/db/migrations/140_marketing_radar_source_fixes.sql` — RSS URL fixes, YouTube channel IDs

See `docs/SUPABASE_SCHEMA.md` (Marketing Radar section).

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENAI_API_KEY` | Yes (briefs) | AI brief + draft generation |
| `ADMIN_USER_IDS` / `ADMIN_EMAILS` | Yes | Admin gate |
| `YOUTUBE_API_KEY` | Optional | YouTube Data API v3 channel video fetch |
| `REDDIT_CLIENT_ID` | Optional | Reddit script app client ID (under app name at reddit.com/prefs/apps) |
| `REDDIT_CLIENT_SECRET` | Optional | Reddit script app secret |
| `REDDIT_USERNAME` | Optional | Reddit **username** for the bot account (not email; 3+ chars, `a-z0-9_-`) |
| `REDDIT_PASSWORD` | Optional | Password for that Reddit account — used with script-app OAuth |
| `CRON_SECRET` | For cron | Protects `/api/cron/marketing-radar-daily` |
| `MARKETING_RADAR_REDDIT_UA` | Optional | Custom Reddit User-Agent string |

Keys are server-side only. The UI receives booleans (e.g. `youtube_api_key_configured`), never secrets.

## Manual workflow

1. **Ingest signals** — Fetch RSS / YouTube / Reddit, or paste manual text.
2. **Run brief** (or **Run Full Daily Radar**) — blends top-scored signals + Discover `meta_signals`.
3. **Review drafts** — quality flags shown as warnings (do not block approve).
4. **Edit / approve / reject** — per platform.
5. **Copy** — use Copy buttons; paste into X, Instagram, blog, or Reddit manually.
6. **Mark copied / set planned date / campaign** — calendar view for planning.
7. **Mark external post URL** — after you post manually.
8. **Export CSV** — for offline review or spreadsheet planning.

## Ingestion sources

### RSS (`type=rss`)

Seeded: EDHREC Articles, MTGGoldfish (`/feed`), Commanders Herald. MTG Official News is disabled (Wizards RSS retired).

### YouTube (`type=youtube_channel`)

Tracks **known channels only** (not broad search) to control API cost.

Seeded channels: The Command Zone, Tolarian Community College, MTGGoldfish, EDHRECast, Nitpicking Nerds.

To add a channel in Supabase `marketing_sources`:

```json
{
  "channelId": "UCxxxxxxxx",
  "channelName": "Channel Name",
  "handle": "@handle",
  "priority": 1
}
```

Set `type=youtube_channel`, `enabled=true`, and `YOUTUBE_API_KEY` in env.

### Reddit (`type=reddit_subreddit`)

Read-only via **Reddit OAuth** (script app **password grant** → `oauth.reddit.com/r/{sub}/hot`). Seeded: EDH, magicTCG, mtg, CompetitiveEDH, BudgetBrews, mtgfinance.

**Setup (one-time):**

1. Create a **dedicated Reddit account** for the bot (e.g. username `manatap_radar` — letters/numbers/underscore only, 3+ chars).
2. Log in → [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) or [developers.reddit.com](https://developers.reddit.com) → **script** app.
3. On “Add your automated account”, enter the bot **username** (not your email) and password.
4. Copy client ID + secret into Vercel + local env:
   - `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD`
5. Redeploy. Setup tab shows Reddit: ready.

Unauthenticated `www.reddit.com/...json` returns 403 from server IPs.

**Safety:**

- Signal analysis only — no automated posting, replies, or comments.
- No fake community engagement. Reddit drafts must be manually reviewed.
- Rate limits: ~1s delay between subreddit fetches; errors stored on source `fetch_error`.

## API routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/marketing-radar` | Dashboard (filters, history, calendar) |
| POST | `/api/admin/marketing-radar/signals` | Manual paste |
| POST | `/api/admin/marketing-radar/run` | Generate brief + drafts |
| POST | `/api/admin/marketing-radar/ingest/rss` | Fetch RSS feeds |
| POST | `/api/admin/marketing-radar/ingest/youtube` | Fetch YouTube videos |
| POST | `/api/admin/marketing-radar/ingest/reddit` | Fetch Reddit hot posts |
| POST | `/api/admin/marketing-radar/daily-run` | Full ingest + brief |
| GET | `/api/admin/marketing-radar/briefs/[id]` | Single brief + drafts |
| POST | `/api/admin/marketing-radar/briefs/[id]/regenerate` | New drafts; supersedes non-approved |
| GET | `/api/admin/marketing-radar/export.csv` | CSV export |
| PATCH | `/api/admin/marketing-drafts/[id]` | Edit draft, calendar fields, status |
| GET | `/api/cron/marketing-radar-daily` | Cron: ingest + brief (CRON_SECRET) |

## Scoring

Signals scored by source type, recency, engagement, verified card names, topics, and pain/problem keywords. Brief generation uses top ~30 signals by score (last 7 days).

## Quality flags

Heuristic warnings on drafts: `too_salesy`, `fake_personal_claim`, `astroturf_risk`, `spammy_cta`, `manatap_overmention`, `thin_mtg_content`, `too_generic`, `reddit_hostile`. Warnings are visible only — approval is never blocked.

## Cron

Daily at **06:30 UTC** (after `meta-signals` at 05:15). See `frontend/docs/CRONS.md`.

Ingests RSS + Reddit + YouTube (if key set), then generates brief + drafts. **Does not post anywhere.**

## Verification checklist

- [ ] Migrations 138 + 139 applied
- [ ] Admin can access `/admin/marketing-radar`
- [ ] Manual paste works
- [ ] RSS fetch returns inserted/skipped counts
- [ ] YouTube skips gracefully without `YOUTUBE_API_KEY`
- [ ] Reddit skips gracefully without `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`
- [ ] Reddit fetch works with OAuth credentials; rate/access errors per source
- [ ] Full daily radar creates brief + drafts
- [ ] Regenerate supersedes draft/rejected only; approved kept
- [ ] CSV export downloads
- [ ] No route auto-posts externally
- [ ] Non-admin gets 404 on APIs
