# Marketing Radar (admin)

Internal admin tool for collecting MTG marketing signals, generating AI briefs, and drafting social/blog content. **Human-in-the-loop:** ingest + AI on a schedule, you approve per platform, then **copy** X/Instagram posts manually (no X API fees). Blog can be published to manatap.ai from admin. Nothing posts without approval.

## Access

- **UI:** `/admin/marketing-radar` (protected by `AdminGuard` + env allowlist)
- **Auth:** `ADMIN_USER_IDS` / `ADMIN_EMAILS` on all `/api/admin/*` routes via `requireAdminForApi()`

## Database

Apply migrations in Supabase SQL Editor:

1. `frontend/db/migrations/138_marketing_radar.sql`
2. `frontend/db/migrations/139_marketing_radar_phase2.sql`
3. `frontend/db/migrations/140_marketing_radar_source_fixes.sql` — RSS URL fixes, YouTube channel IDs
4. `frontend/db/migrations/141_marketing_radar_publish_flow.sql` — `posted` status, `posted_at`, `external_post_id`, one active draft per platform per brief

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
| `CRON_SECRET` | For cron | Protects marketing radar cron routes |
| `MARKETING_RADAR_REDDIT_UA` | Optional | Custom Reddit User-Agent string |
| `MARKETING_RADAR_DISCORD_WEBHOOK` | Optional | Bi-daily “drafts ready” Discord link (falls back to `DISCORD_ADMIN_ALERT_WEBHOOK`) |

X and Instagram are **copy-paste only** (no API keys required). Optional legacy publish helpers exist in `lib/marketing/publish/` but are not used by the admin UI.

Keys are server-side only. The UI receives booleans (e.g. `youtube_api_key_configured`), never secrets.

## 4-step admin workflow (`/admin/marketing-radar`)

| Step | Tab | What you do |
|------|-----|-------------|
| 1 | **Ingest** | Check source health; **Run everything** (ingest + brief + 3 drafts). |
| 2 | **Summary** | Read what’s trending — AI brief summary, topics, top signals. |
| 3 | **Drafts** | **One draft per platform** (X, Instagram, long blog). Edit, **Approve** or **Reject**. |
| 4 | **Copy & post** | Copy X/Instagram to clipboard; optional **Publish to blog** on manatap.ai; mark posted + save live URL. |

Blog drafts are **long-form** (800–1500 words) for the website. Reddit is ingest-only (signals), not a publish target.

## Automation (every 2 days)

Cron `GET /api/cron/marketing-radar-review` (08:00 UTC on even calendar days): full ingest + brief + drafts, then Discord message with link to step 3 (`?tab=drafts&brief_id=…`). You still approve and publish manually.

Daily cron `marketing-radar-daily` (06:30 UTC) still runs ingest + brief without Discord (useful for always-fresh signals).

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
| PATCH | `/api/admin/marketing-drafts/[id]` | Edit draft, status |
| POST | `/api/admin/marketing-drafts/[id]/publish` | Publish approved **blog** draft to manatap.ai |
| GET | `/api/cron/marketing-radar-daily` | Cron: ingest + brief (CRON_SECRET) |
| GET | `/api/cron/marketing-radar-review` | Cron: ingest + brief + Discord review link |

## AI drafts (OpenAI)

Brief + drafts use `callLLM` via `lib/marketing/generateMarketingBrief.ts` (model: `MODEL_ADMIN_DEEP` or fallback). Output is **exactly 3 drafts**: one X post, one Instagram caption, one long blog article. Links from `lib/marketing/marketingPublicLinks.ts`.

**Blog publish (step 4):** Approve the blog draft → set optional **slug / category / gradient / icon** → **Publish to blog**. This calls `lib/blog/publishBlogPost.ts`, which writes:

- `app_config.blog` — listing card (website `/blog`, `GET /api/blog`, **mobile Discover**)
- `app_config.blog_marketing_bodies` — markdown body (`/blog/[slug]` via `getDbBlogPost()`)

No frontend deploy needed per post. **Copy SQL** exports the same payload for Supabase backup. See `docs/BLOG_SQL_PUBLISH.md`.

## Scoring

Signals scored by source type, recency, engagement, verified card names, topics, and pain/problem keywords. Brief generation uses top ~30 signals by score (last 7 days).

## Quality flags

Heuristic warnings on drafts: `too_salesy`, `fake_personal_claim`, `astroturf_risk`, `spammy_cta`, `manatap_overmention`, `thin_mtg_content`, `too_generic`, `analyst_voice`, `missing_link`, `reddit_hostile`. Warnings are visible only — approval is never blocked.

## Cron

- **Daily 06:30 UTC** — `marketing-radar-daily`: ingest + brief (no notification).
- **Every 2 days 08:00 UTC** — `marketing-radar-review`: ingest + brief + Discord “review drafts” link.

Neither cron auto-posts. See `frontend/docs/CRONS.md`.

## Verification checklist

- [ ] Migrations 138–141 applied
- [ ] Admin can access `/admin/marketing-radar`
- [ ] Manual paste works
- [ ] RSS fetch returns inserted/skipped counts
- [ ] YouTube skips gracefully without `YOUTUBE_API_KEY`
- [ ] Reddit skips gracefully without `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`
- [ ] Reddit fetch works with OAuth credentials; rate/access errors per source
- [ ] Full daily radar creates brief + drafts
- [ ] Regenerate supersedes draft/rejected/approved; posted rows kept
- [ ] Copy & post tab: clipboard copy for X/IG; blog publish works
- [ ] Bi-daily cron sends Discord link when webhook set
- [ ] CSV export downloads
- [ ] Non-admin gets 404 on APIs
