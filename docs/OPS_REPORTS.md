# Ops Reports — Scheduled Health Checks

Scheduled daily and weekly ops reports run production-safe checks, store results in the database, and post summaries to Discord.

---

## What Checks Run

| Check | Description |
|-------|-------------|
| **AI Cost Audit** | Last 200 `ai_usage` rows; recomputes expected cost via `pricing.ts`; reports mismatch rate + sample mismatches |
| **Route Coverage** | % rows where `route` is null; top routes by count |
| **Quality Sentinel** | FULL_LLM / MINI_ONLY / NO_LLM distribution; truncation rate; 429 rate; cache hit %; p95 latency |
| **Job Health** | Reads `app_config` keys (`job:last:bulk_scryfall`, `job:last:bulk_price_import`, etc.); returns age in hours; flags stale jobs (>48h) |
| **SEO Health** | `seo_pages` counts by status + indexing; indexed page count; top 10 by impressions |
| **SEO Winners** | Pages with `indexing='noindex'` AND impressions > threshold (10); top 3 slugs |

---

## How to Manually Run

### From Admin UI

1. Go to `/admin/ops`
2. In the **Scheduled Reports** panel, click **Run Daily Now** or **Run Weekly Now**
3. Reports are stored in `ops_reports` and posted to Discord

### From API (cron secret required)

```bash
# Daily
curl -H "x-cron-key: YOUR_CRON_SECRET" "https://your-app.vercel.app/api/cron/ops-report?type=daily"

# Weekly
curl -H "x-cron-key: YOUR_CRON_SECRET" "https://your-app.vercel.app/api/cron/ops-report?type=weekly"

# Or use dedicated paths
curl -H "x-cron-key: YOUR_CRON_SECRET" "https://your-app.vercel.app/api/cron/ops-report/daily"
curl -H "x-cron-key: YOUR_CRON_SECRET" "https://your-app.vercel.app/api/cron/ops-report/weekly"
```

Env vars: `CRON_SECRET`, `CRON_KEY`, or `RENDER_CRON_SECRET` (any one).

---

## Discord Setup

1. Create a Discord webhook in your server (Server Settings → Integrations → Webhooks)
2. Add to env: `DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...`
3. Reports post a short summary (status emoji, AI mismatch %, 429 rate, route null %, stale jobs, indexed count, SEO winners count + top slugs)
4. **Discord failure does NOT block report save** — reports are always stored in DB first

---

## Where Reports Appear

- **Admin UI:** `/admin/ops` → Scheduled Reports panel
  - Latest daily + weekly
  - Table of last 10 runs
  - Expandable JSON details per run
- **Database:** `ops_reports` table (migration `058_ops_reports.sql`)

---

## SEO Winners Promotion Workflow

1. Go to `/admin/seo/pages`
2. **SEO Winners** panel (above the main table) shows pages with `indexing='noindex'` that have impressions above threshold (10)
3. These pages are receiving traffic but are blocked from search engines
4. Click **[Index]** to set `indexing='index'` — page is added to sitemap and allowed in search results
5. After indexing, the row is removed from the winners list (refresh to confirm)

---

## Vercel Cron Schedule

| Path | Schedule |
|------|----------|
| `/api/cron/ops-report/daily` | 0 6 * * * (6:00 UTC daily) |
| `/api/cron/ops-report/weekly` | 0 7 * * 0 (7:00 UTC Sundays) |

Vercel sends `CRON_SECRET` as Bearer token in `Authorization` header when invoking cron jobs.

---

## Example ops_reports Row (JSON)

```json
{
  "id": "uuid",
  "created_at": "2026-02-14T12:00:00Z",
  "report_type": "daily_ops",
  "status": "ok",
  "summary": "All checks passed.",
  "details": {
    "ai_cost_audit": { "mismatch_rate": 2.5, "sample_mismatches": [], "rows_checked": 200 },
    "route_coverage": { "route_null_pct": 5, "top_routes": [{ "route": "chat_stream", "count": 80 }] },
    "quality_sentinel": { "err429_rate_pct": 0.5, "cache_hit_pct": 12, "p95_latency_ms": 1200 },
    "job_health": { "stale_jobs": [] },
    "seo_health": { "indexed_page_count": 45 },
    "seo_winners": { "count": 3, "top_slugs": ["atraxa-deck-cost", "edgar-markov-cost", "krenko-cost"] }
  },
  "duration_ms": 1200,
  "error": null
}
```

---

## Example Discord Message

```
✅ Ops Report (daily_ops)

• AI cost mismatch: 2.5%
• 429 rate: 0.5%
• Route null: 5.0%
• Indexed pages: 45
• SEO winners (noindex w/ impressions): 3
  Top: atraxa-deck-cost, edgar-markov-cost, krenko-cost
```

---

## Example Winners Query (SQL)

```sql
-- Pages with noindex but impressions above threshold (join to seo_queries for metrics)
SELECT p.slug, p.title, q.impressions, q.clicks, q.ctr, q.position, p.priority
FROM seo_pages p
JOIN seo_queries q ON q.query = p.query
WHERE p.indexing = 'noindex'
  AND q.impressions > 10
ORDER BY q.impressions DESC
LIMIT 50;
```
