# Billing Forensics: Vercel Cost Attribution

This document explains the instrumentation added to attribute Vercel billing costs to specific routes, callers, and patterns. Use it to diagnose invoice line items and identify cost drivers.

## Admin Dashboard

Visit `/admin/billing-forensics` for a visual ELI5 dashboard showing:
- Top routes by request count, total runtime, and data transfer
- Bot traffic percentage and top bot user agents
- Polling endpoint activity
- Cron job execution
- Safety toggles (env flags) with instructions
- Non-API traffic diagnostics (via Vercel Logs)

## Invoice Metric Mapping

| Invoice Line Item | Vercel Component | ManaTap Hypotheses |
|-------------------|------------------|-------------------|
| **Fluid Provisioned Memory (Qty ~3047)** | Serverless function memory x duration | Chat/stream routes, cron jobs (bulk-scryfall, price/snapshot), AI batch routes. Default 1024MB; long-running functions consume more. |
| **Function Invocations (~9.8M)** | Every serverless + edge function call | High: `/api/config`, `/api/stats/activity`, `/api/rate-limit/status`, `/api/health`, page RSC requests. Polling: ActiveUsersProvider (60s), RateLimitIndicator (30s). |
| **Fluid Active CPU (~66.62)** | CPU time during function execution | Chat completions, deck analysis, Scryfall fetches, Supabase queries. Long cron jobs (bulk-scryfall, commander-aggregates). |
| **Fast Origin Transfer (~75.53)** | Data transferred from origin (not CDN cache) | Large JSON (deck lists, card search, collection stats), uncached API responses, images from `/_next/image` when not cached. |
| **ISR Reads (~94,978)** | Incremental Static Regeneration cache reads | Pages with `revalidate`: `/decks/[id]` (120s), `/wishlist/[id]` (120s), `/meta/[slug]` (3600s), `/cards` (86400s), `/blog/[slug]` (86400s). Also `unstable_cache` in RecentPublicDecks (30s), MostLikedPublicDecks (30s). |

## What We Added

### 1. Request Metrics (`lib/observability/requestMetrics.ts`)

- **Per-request fields**: `route`, `method`, `status`, `duration_ms`, `bytes_out`, `bytes_in`, `cache_hit`, `region`, `runtime`, `user_agent`, `referer`, `ip_prefix`, `user_id`, `bot_flag`, `caller_type`
- **Sampling**: 1% baseline + 100% for errors (4xx/5xx), slow (>2s), large (>100KB)
- **Output**: JSON logs to stdout (Vercel Logs), optional PostHog `api_request` event

### 2. `withMetrics(handler)` (`lib/observability/withMetrics.ts`)

Higher-order function wrapping API handlers. Use:

```ts
export const GET = withMetrics(async (req) => { ... });
```

**Instrumented routes**: `/api/config`, `/api/stats/activity`, `/api/rate-limit/status`, `/api/health`, `/api/changelog`, `/api/decks/recent`

To add more: wrap the handler and export `GET = withMetrics(getHandler)`.

### 3. Billing Guards (`lib/observability/botProtection.ts`)

All behind env flags (off by default):

| Env | Effect |
|-----|--------|
| `BILLING_METRICS_PERSIST=1` | Save sampled request metrics to Supabase `request_metrics` table for the admin dashboard |
| `BILLING_METRICS_RETENTION_DAYS=14` | How many days to keep metrics (default 14, cleaned by weekly cron) |
| `BILLING_GUARD_BOT_BLOCK=1` | Return 403 for bots on `/api/config`, `/api/stats/activity`, `/api/rate-limit/status`, `/api/health`, `/api/changelog` |
| `BILLING_GUARD_RATE_LIMIT=1` | Stricter per-IP limits (e.g. 10/min for activity, 120/min for config) |
| `BILLING_GUARD_POLL_THROTTLE=1` | Throttle polling endpoints to 10 req/min per IP |

### 4. Middleware

- Adds `x-request-id` to every API request for tracing
- Runs billing guards before route handlers
- Logs sampled non-API requests for page/RSC/image traffic visibility

### 5. Non-API Logging (Page Traffic)

Middleware logs a sample of **non-API requests** to help identify cost drivers outside `/api/**`:

| Env | Default | Effect |
|-----|---------|--------|
| `BILLING_PAGE_SAMPLING` | `0.001` (0.1%) | Baseline sampling rate for non-API requests |
| `BILLING_PAGE_ALWAYS_LOG_PATHS` | `/_next/image,/decks,/wishlist,/meta,/cards,/blog` | Paths that are always sampled at 100% |
| `BILLING_PAGE_METRICS_PERSIST` | `0` (off) | If `1`, persist page metrics to DB (use sparingly) |

These logs use `"type":"request"` (vs `"type":"api_request"` for API routes).

## Vercel Logs Queries

In Vercel Dashboard → Logs, use:

```
# Top API routes by invocation
type:api_request | json | group by route | count

# Slow API requests (>2s)
type:api_request | json | duration_ms > 2000

# Bot traffic (API)
type:api_request | json | bot_flag:true

# Errors
type:api_request | json | status >= 400

# By caller type
type:api_request | json | caller_type:cron

# Non-API traffic (pages, images, RSC)
type:request | json | group by path | count

# Image optimizer traffic
type:request | json | path:/_next/image

# ISR page traffic
type:request | json | path:/decks

# Bot traffic (pages)
type:request | json | bot_flag:true
```

Or search for `"type":"api_request"` or `"type":"request"` in raw logs.

## PostHog

- Event: `api_request`
- Properties: `route`, `method`, `status`, `duration_ms`, `bytes_out`, `bot_flag`, `caller_type`
- Chart: Filter by `route`, `bot_flag`, or `caller_type` to see cost attribution

## ISR Reads – How They Work

**Important**: ISR reads are **request-driven**, not timer-driven. A page with `revalidate: 120` does NOT regenerate every 120 seconds automatically. Instead:

1. First request after 120s since last generation triggers a **stale-while-revalidate** response
2. The page regenerates in the background
3. The ISR read is charged when Next.js reads the cached page from Vercel's edge cache

| Page/Component | Revalidate | Cost Driver |
|----------------|------------|-------------|
| `/decks/[id]` | 120s | Every unique deck URL x requests. High if crawlers or shared links hit many deck pages. |
| `/wishlist/[id]` | 120s | Same pattern |
| `RecentPublicDecks` | 30s | `unstable_cache` - cached data reads, not page renders |
| `MostLikedPublicDecks` | 30s | Same |
| `/meta/[slug]` | 3600s | Meta pages - lower volume unless crawled frequently |
| `/cards` | 86400s | Cards index - 1 read per unique request per day |
| `/blog/[slug]` | 86400s | Blog posts - low volume |

**Key insight**: ISR reads scale with **traffic to ISR pages**, not with time. If you have 1000 deck pages and each gets 1 request/day, that's ~1000 ISR reads/day. If crawlers hit all of them hourly, that's ~24,000/day.

## Fast Origin Transfer – Likely Causes

- **Large JSON**: Deck lists, card search results, collection stats, changelog
- **Uncached responses**: `/api/changelog` has `no-store`; `/api/config` has short cache (60s)
- **Images**: `/_next/image` when not cached at edge
- **Streaming**: Chat stream responses

**Mitigation**: Add `Cache-Control` where safe; increase `s-maxage` for public data.

## Polling Loops (Client-Side)

| Component | Interval | Endpoint |
|-----------|----------|----------|
| `ActiveUsersProvider` | 60s | `/api/stats/activity` |
| `RateLimitIndicator` | 30s | `/api/rate-limit/status` |
| `usePageAnalytics` | (check) | - |
| `admin/ai-usage` | 60s | - |

Consider increasing intervals or using visibility-based polling (pause when tab hidden).

## Cron Jobs (vercel.json)

| Path | Schedule |
|------|----------|
| `/api/cron/cleanup-price-cache` | 0 4 * * * |
| `/api/cron/deck-costs` | 30 4 * * * |
| `/api/cron/commander-aggregates` | 0 5 * * * |
| `/api/cron/cleanup-guest-sessions` | 0 5 * * * |
| `/api/cron/meta-signals` | 15 5 * * * |
| `/api/cron/top-cards` | 30 5 * * * |
| `/api/cron/cleanup-rate-limits` | 0 6 * * 0 |
| `/api/cron/ops-report/daily` | 0 6 * * * |
| `/api/cron/ops-report/weekly` | 0 7 * * 0 |
| `/api/shout/auto-generate` | 17 */2 * * * |

External: `price-snapshot` (GitHub Actions), `bulk-scryfall`, `bulk-price-import` (cron-job.org).

## Deploy & Verify

1. **Deploy** with instrumentation (no env flags needed for metrics).
2. **Vercel Logs**: After deploy, filter for `"type":"api_request"` to confirm logs.
3. **PostHog**: Check for `api_request` events (requires `POSTHOG_KEY`).
4. **Enable guards** (optional): Set `BILLING_GUARD_BOT_BLOCK=1` etc. in Vercel env.
5. **Correlate spikes**: Use Vercel Analytics + Logs; compare timestamps with invoice period.

## Likely Causes Ranked (ManaTap)

1. **Function invocations**: `/api/config` (every page load), `/api/stats/activity` (60s poll), `/api/rate-limit/status` (30s poll for Pro), health checks.
2. **Memory/CPU**: Chat stream, bulk cron jobs, deck analysis.
3. **ISR reads**: `/decks/[id]` with traffic from crawlers and shared links (request-driven, not timer-driven).
4. **Fast origin transfer**: Large JSON from decks, collections, changelog; uncached config.
5. **Bots**: Crawlers hitting config, health, changelog without useful caching.
