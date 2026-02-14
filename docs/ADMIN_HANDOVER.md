# Admin System — Full Handover Document

Complete reference for all admin pages, subpages, API routes, functions, and reports. Intended for LLM handover and human developers.

---

## 1. Admin Access

- **Entry point:** `/admin/JustForDavy` (hub page)
- **Auth:** Uses `isAdmin()` from `frontend/lib/admin-check.ts` — checks `ADMIN_USER_IDS` and `ADMIN_EMAILS` env vars
- **Check:** `GET /api/admin/config` returns `{ ok, is_admin }` when user is admin

---

## 2. Admin Pages & Subpages

| Path | Description |
|------|-------------|
| `/admin/JustForDavy` | Central hub; links to all admin sections |
| `/admin/ops` | Ops & Safety — feature flags, maintenance, budget caps, rollback |
| `/admin/data` | Data & Pricing — Scryfall cache, bulk jobs, table sizes, cleanup |
| `/admin/budget-swaps` | Budget Swaps — Quick Swaps map (expensive → budget alternatives) |
| `/admin/ai` | AI & Chat Quality — prompts, packs, moderation, personas, metrics |
| `/admin/ai-health` | AI Health — test AI response, debug "temporarily unavailable" |
| `/admin/ai-usage` | AI Usage — telemetry board, summary, request log, config |
| `/admin/ai-test` | AI Test — deck analysis evals, prompt layers, patches, trends |
| `/admin/support` | User Support — user search, Pro/billing, GDPR export/delete |
| `/admin/users` | Users (alternate) — search, set Pro, set billing |
| `/admin/obs` | Observability — audit stream, rate limits, error logs |
| `/admin/monetize` | Monetization — Stripe/Ko‑fi/PayPal toggles, subscribers, webhook status |
| `/admin/security` | Security & Compliance — audit log, CSP hosts, key rotation |
| `/admin/backups` | Database Backups — status, create, test restore |
| `/admin/deploy` | Deployment Awareness — version info, perf budgets |
| `/admin/chat-levers` | Chat Levers — defaults, answer packs, rules sources, model policy |
| `/admin/badges` | Badges — rough counts & progress sampling |
| `/admin/events` | Events Debug — tool usage counters (Probability, Mulligan) |
| `/admin/changelog` | Changelog Manager — what's new entries, version releases |
| `/admin/analytics-debug` | Analytics Debug — consent, PostHog, distinct_id, capture buffer |
| `/admin/analytics-seed` | Analytics Seed — seed/test analytics data |
| `/admin/pricing` | Pricing — price charts, time range |
| `/admin/seo/pages` | SEO Pages — generate, publish, set indexing, toggle |

---

## 3. Page-by-Page: Functions & APIs

### 3.1 `/admin/JustForDavy`

| Function | Description |
|----------|-------------|
| Admin check | `GET /api/admin/config` — verifies `is_admin` |
| Redirect | Non-admins → `/` |

---

### 3.2 `/admin/ops` — Ops & Safety

| Function | API | Method | Description |
|----------|-----|--------|-------------|
| Load flags/maintenance/budget | `GET /api/admin/config?key=flags&key=maintenance&key=llm_budget` | GET | Fetch config |
| Refresh pinboard | `GET /api/admin/audit-pinboard` | GET | System health overview |
| Save flags | `POST /api/admin/config` | POST | `{ key: 'flags', value }` |
| Save maintenance | `POST /api/admin/config` | POST | `{ key: 'maintenance', value }` |
| Save budget | `POST /api/admin/config` | POST | `{ key: 'llm_budget', value: { daily_usd, weekly_usd } }` |
| Rollback snapshot | `POST /api/admin/ops/rollback-snapshot` | POST | Set price snapshot to previous date |
| Auto-disable budget | Saves `flags.risky_betas = false` when over limit | — | Emergency spend control |

**Pinboard sections:** Errors (24h), AI Spend (today/week), Price Data health, Performance (slow jobs, rate limits).

---

### 3.3 `/admin/data` — Data & Pricing

| Function | API | Method | Description |
|----------|-----|--------|-------------|
| Load job last-run | `GET /api/admin/config?key=job:last:bulk_scryfall&key=job:last:bulk_price_import&key=job:last:price_snapshot_bulk` | GET | Last successful run timestamps |
| Scryfall lookup | `GET /api/admin/scryfall-cache?name=...` | GET | Read cached card data |
| Scryfall refresh | `POST /api/admin/scryfall-cache` | POST | `{ name }` — re-fetch from Scryfall |
| Bulk Scryfall import | `POST /api/cron/bulk-scryfall` | POST | All 110k+ cards metadata |
| Bulk price import | `POST /api/cron/bulk-price-import` | POST | Live prices for cached cards |
| Price snapshot (full) | `POST /api/bulk-jobs/price-snapshot` | POST | Weekly full snapshot |
| Table sizes | `GET /api/admin/data/table-sizes` | GET | DB table sizes |
| Cleanup snapshots | `POST /api/admin/data/cleanup-snapshots` | POST | Remove old snapshots |
| Optimize Scryfall cache | `POST /api/admin/data/optimize-scryfall-cache` | POST | Vacuum/optimize |
| Cleanup audit logs | `POST /api/admin/data/cleanup-audit-logs` | POST | Prune old audit rows |
| Cleanup abandoned accounts | `POST /api/admin/data/cleanup-abandoned-accounts` | POST | Remove orphaned data |
| Vacuum analyze | `POST /api/admin/data/vacuum-analyze` | POST | DB maintenance |

**Price snapshot build (from ai-usage):** `POST /api/admin/price/snapshot/build` (today), `POST /api/admin/price/snapshot/bulk` (full).

---

### 3.4 `/admin/budget-swaps` — Budget Swaps

| Function | API | Method | Description |
|----------|-----|--------|-------------|
| Load swaps | `GET /api/admin/budget-swaps` | GET | Returns `{ swaps: Record<string, string[]> }` |
| Save swaps | `POST /api/admin/budget-swaps` | POST | `{ swaps }` — card name → budget alternatives |

**UI:** Add, edit, delete mappings (e.g. `"Black Lotus"` → `["Sol Ring", "Mana Crypt"]`).

---

### 3.5 `/admin/ai` — AI & Chat Quality

| Function | API | Method | Description |
|----------|-----|--------|-------------|
| Load prompts/packs/moderation/persona seeds | `GET /api/admin/config?key=prompts&key=chat_packs&key=moderation&key=ai.persona.seeds` | GET | Config |
| Load LLM metrics | `GET /api/admin/metrics/llm?days=7` | GET | Calls, tokens, cost by model |
| Load personas | `GET /api/admin/personas/summary?days=N` | GET | Persona usage |
| Save prompts | `POST /api/admin/config` | POST | `{ key: 'prompts', value }` |
| Save packs | `POST /api/admin/config` | POST | `{ key: 'chat_packs', value }` |
| Save moderation | `POST /api/admin/config` | POST | `{ key: 'moderation', value: { allow, block } }` |
| Save persona seeds | `POST /api/admin/config` | POST | `{ key: 'ai.persona.seeds', value }` |
| Knowledge gaps | `GET /api/admin/knowledge-gaps?limit=200` | GET | Last N gaps |
| Queue eval | `POST /api/admin/evals` | POST | `{ suite, prompts }` |
| Recent evals | `GET /api/admin/evals?limit=50` | GET | Recent eval runs |

---

### 3.6 `/admin/ai-health` — AI Health

| Function | API | Method | Description |
|----------|-----|--------|-------------|
| Health probe | `GET /api/admin/ai/health?probe=1` | GET | Test AI endpoint, debug "temporarily unavailable" |

---

### 3.7 `/admin/ai-usage` — AI Usage

**Tabs:** Board, Summary, Request log.

| Function | API | Method | Description |
|----------|-----|--------|-------------|
| Load summary (hero) | `GET /api/admin/ai-usage/summary?days=N` | GET | Today, last 3 days, total cost |
| Load overview | `GET /api/admin/ai/overview?days=N&exclude_legacy_cost=true` | GET | Totals, by route, by model, by day |
| Load top drivers | `GET /api/admin/ai/top?days=N&dimension=user|deck|thread|error_code` | GET | Top by dimension |
| Load usage list | `GET /api/admin/ai/usage/list?days=N&limit=50&exclude_legacy_cost=true` | GET | Paginated list |
| Load usage detail | `GET /api/admin/ai/usage/[id]` | GET | Single row + prompt/response preview |
| Load config | `GET /api/admin/ai/config` | GET | AI config flags |
| Load recommendations | `GET /api/admin/ai/recommendations?days=N` | GET | Cost recommendations |
| Load OpenAI actual | `GET /api/admin/ai/openai-usage?days=N` | GET | From OpenAI API (requires OPENAI_ADMIN_API_KEY) |
| Prewarm Scryfall | `POST /api/cron/prewarm-scryfall` | POST | Header `x-cron-key` |
| Price snapshot (today) | `POST /api/admin/price/snapshot/build` | POST | Build today snapshot |
| Price snapshot (full) | `POST /api/admin/price/snapshot/bulk` | POST | Full bulk snapshot |
| Export full CSV | Uses usage list items (all columns) | — | Download CSV |
| Export request log CSV | Uses requests from `/api/admin/ai-usage/requests` | — | All columns + legacy_cost, corrected_cost_estimate |

**Board filters:** Days (default 14), Exclude legacy cost rows, Refresh.

---

### 3.8 `/admin/ai-test` — AI Test (Deck Analysis Evals)

| Function | API | Method | Description |
|----------|-----|--------|-------------|
| Load cases | `GET /api/admin/ai-test/cases?includeFailures=true` | GET | Test cases |
| Quality update | `GET /api/admin/ai-test/quality?update=true` | GET | Refresh quality metrics |
| Load patches | `GET /api/admin/ai-test/patches?status=pending` | GET | Pending patches |
| Load evals | `GET /api/admin/evals?limit=20` | GET | Recent evals |
| Load history | `GET /api/admin/ai-test/history?limit=20` | GET | Run history |
| Load coverage | `GET /api/admin/ai-test/coverage` | GET | Coverage stats |
| Load trends | `GET /api/admin/ai-test/trends?days=30` | GET | Trend data |
| Load schedule | `GET /api/admin/ai-test/schedule` | GET | Schedule config |
| Load prompt versions | `GET /api/admin/prompt-versions?kind=chat|deck_analysis` | GET | Versions by kind |
| Load prompt layers | `GET /api/admin/prompt-layers` | GET | All layer keys |
| Load layer by key | `GET /api/admin/prompt-layers?key=...` | GET | Single layer |
| Update layer | `PUT /api/admin/prompt-layers` | PUT | Update layer content |
| Load layer versions | `GET /api/admin/prompt-layers/versions?key=...&limit=20` | GET | Version history |
| Composed prompt | `GET /api/admin/ai-test/composed-prompt?formatKey=...&deckId=...` | GET | Rendered prompt |
| Run test | `POST /api/admin/ai-test/run` | POST | Run single/batch test |
| Validate | `POST /api/admin/ai-test/validate` | POST | Validate cases |
| Generate | `POST /api/admin/ai-test/generate` | POST | Generate new cases |
| Analyze failures | `POST /api/admin/ai-test/analyze-failures` | POST | Analyze failed cases |
| Batch run | `POST /api/admin/ai-test/batch` | POST | Batch test run |
| Save history | `POST /api/admin/ai-test/save-history` | POST | Persist run to history |
| Apply improvements | `POST /api/admin/ai-test/apply-improvements` | POST | Apply patch improvements |
| Consistency check | `GET /api/admin/ai-test/consistency` | GET | Consistency report |
| Refactor prompt | `POST /api/admin/ai-test/refactor-prompt` | POST | Refactor prompt from failures |
| Compare runs | `GET /api/admin/ai-test/compare-runs` | GET | Compare two runs |
| Prompt impact | `GET /api/admin/ai-test/prompt-impact?promptVersionId=...` | GET | Impact of version |
| Create prompt version | `POST /api/admin/prompt-versions/create` | POST | Create new version |
| Update prompt version | `PUT /api/admin/prompt-versions` | PUT | Update version |
| Export training | `GET /api/admin/ai-training/export` | GET | Export training data |

---

### 3.9 `/admin/support` & `/admin/users` — User Support

| Function | API | Method | Description |
|----------|-----|--------|-------------|
| Search users | `GET /api/admin/users/search?q=...` | GET | Search by email/ID |
| Set Pro | `POST /api/admin/users/pro` | POST | `{ userId, pro }` |
| Set billing | `POST /api/admin/users/billing` | POST | `{ userId, active }` |
| Resend verification | `POST /api/admin/users/resend-verification` | POST | `{ userId }` |
| GDPR export | `POST /api/admin/users/gdpr-export` | POST | `{ userId }` |
| GDPR delete | `POST /api/admin/users/gdpr-delete` | POST | `{ userId, confirm: 'DELETE' }` |

---

### 3.10 `/admin/obs` — Observability

| Function | API | Method | Description |
|----------|-----|--------|-------------|
| Audit stream | `GET /api/admin/audit` | GET | Latest 200 admin actions |
| Rate limits | `GET /api/admin/rate-limits?hours=24` | GET | Top users/IPs by 429s |
| Error logs | `GET /api/admin/errors?limit=200` | GET | Latest server errors |

---

### 3.11 `/admin/monetize` — Monetization

| Function | API | Method | Description |
|----------|-----|--------|-------------|
| Load config | `GET /api/config` | GET | Monetize toggles |
| Load stats | `GET /api/admin/monetize/subscription-stats` | GET | Subscription stats |
| Load webhook status | `GET /api/admin/stripe/webhook-status` | GET | Stripe webhook health |
| Load subscribers | `GET /api/admin/stripe/subscribers?include_inactive=...` | GET | Subscriber list |
| Save monetize | `POST /api/admin/monetize` | POST | `{ stripe, kofi, paypal }` |

---

### 3.12 `/admin/security` — Security & Compliance

| Function | API | Method | Description |
|----------|-----|--------|-------------|
| Load audit | `GET /api/admin/audit` | GET | Admin audit log |
| Load CSP/keys | `GET /api/admin/config?key=csp_hosts&key=key_rotation` | GET | CSP hosts, key rotation |
| Save CSP | `POST /api/admin/config` | POST | `{ key: 'csp_hosts', value }` |
| Save keys | `POST /api/admin/config` | POST | `{ key: 'key_rotation', value }` |

---

### 3.13 `/admin/backups` — Database Backups

| Function | API | Method | Description |
|----------|-----|--------|-------------|
| Load backups | `GET /api/admin/backups` | GET | Backup list, status |
| Create backup | `POST /api/admin/backups/create` | POST | Trigger manual backup |
| Test restore | `POST /api/admin/backups/test-restore` | POST | `{ backupId }` |

---

### 3.14 `/admin/deploy` — Deployment Awareness

| Function | API | Method | Description |
|----------|-----|--------|-------------|
| Load version/perf | `GET /api/admin/config?key=version_info&key=perf_budgets` | GET | Version, perf budgets |
| Save | `POST /api/admin/config` | POST | `{ key, value }` |

---

### 3.15 `/admin/chat-levers` — Chat Levers

| Function | API | Method | Description |
|----------|-----|--------|-------------|
| Load | `GET /api/admin/config?key=chat_defaults&key=answer_packs&key=rules_sources&key=model_policy` | GET | All chat levers |
| Save defaults | `POST /api/admin/config` | POST | `{ key: 'chat_defaults', value }` |
| Save packs | `POST /api/admin/config` | POST | `{ key: 'answer_packs', value }` |
| Save rules | `POST /api/admin/config` | POST | `{ key: 'rules_sources', value }` |
| Save policy | `POST /api/admin/config` | POST | `{ key: 'model_policy', value }` |

---

### 3.16 `/admin/events` — Events Debug

| Function | API | Method | Description |
|----------|-----|--------|-------------|
| Load summary | `GET /api/admin/events/summary` | GET | Tool usage counters |

---

### 3.17 `/admin/changelog` — Changelog Manager

| Function | API | Method | Description |
|----------|-----|--------|-------------|
| Load | `GET /api/admin/changelog` | GET | Changelog entries |
| Save | `POST /api/admin/changelog` | POST | `{ entries }` |

---

### 3.18 `/admin/seo/pages` — SEO Pages

| Function | API | Method | Description |
|----------|-----|--------|-------------|
| Load list | `GET /api/admin/seo-pages/list?quality=...&indexed=...` | GET | SEO pages |
| Toggle | `POST /api/admin/seo-pages/toggle` | POST | Toggle page |
| Generate | `POST /api/admin/seo-pages/generate` | POST | Generate pages |
| Publish | `POST /api/admin/seo-pages/publish?limit=N&minQuality=N` | POST | Publish top N |
| Set indexing | `POST /api/admin/seo-pages/set-indexing` | POST | Set indexing status |

**Ingest queries:** `POST /api/admin/seo-queries/ingest` (from script or UI).

---

### 3.19 `/admin/analytics-debug`, `/admin/analytics-seed`, `/admin/pricing`, `/admin/badges`

- **analytics-debug:** PostHog consent, distinct_id, capture buffer
- **analytics-seed:** Seed test analytics data
- **pricing:** `GET /api/admin/pricing?timeRange=...` — price charts
- **badges:** Rough badge counts (Mathlete, Scenario, Mull Master, Brewer, Combomancer)

---

## 4. Complete API Route Index

All routes under `app/api/admin/`:

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/admin/config` | GET, POST | Read/write app_config (flags, maintenance, llm_budget, prompts, etc.) |
| `/api/admin/audit` | GET | Admin audit log (latest 200) |
| `/api/admin/audit-pinboard` | GET | System health pinboard |
| `/api/admin/ai/config` | GET, POST | AI config (flags, llm_force_full_routes, etc.) |
| `/api/admin/ai/overview` | GET | AI usage overview (totals, by route/model/day) |
| `/api/admin/ai/top` | GET | Top drivers by dimension |
| `/api/admin/ai/usage/list` | GET | Paginated ai_usage list |
| `/api/admin/ai/usage/[id]` | GET | Single ai_usage detail |
| `/api/admin/ai/config` | GET, POST | AI-specific config (flags, llm_force_full_routes, etc.) |
| `/api/admin/ai/openai-usage` | GET | OpenAI API actual usage |
| `/api/admin/ai/recommendations` | GET | Cost recommendations |
| `/api/admin/ai/health` | GET | AI health probe |
| `/api/admin/ai/model-config` | GET | Model config |
| `/api/admin/ai-usage/summary` | GET | AI usage summary |
| `/api/admin/ai-usage/requests` | GET | Request log (paginated) |
| `/api/admin/ai-usage/cost-summary` | GET | Cost summary |
| `/api/admin/ai-test/cases` | GET | Test cases |
| `/api/admin/ai-test/quality` | GET | Quality metrics |
| `/api/admin/ai-test/patches` | GET | Pending patches |
| `/api/admin/ai-test/history` | GET | Run history |
| `/api/admin/ai-test/coverage` | GET | Coverage stats |
| `/api/admin/ai-test/trends` | GET | Trends |
| `/api/admin/ai-test/schedule` | GET | Schedule |
| `/api/admin/ai-test/composed-prompt` | GET | Rendered prompt |
| `/api/admin/ai-test/run` | POST | Run test |
| `/api/admin/ai-test/validate` | POST | Validate |
| `/api/admin/ai-test/generate` | POST | Generate cases |
| `/api/admin/ai-test/analyze-failures` | POST | Analyze failures |
| `/api/admin/ai-test/batch` | POST | Batch run |
| `/api/admin/ai-test/save-history` | POST | Save to history |
| `/api/admin/ai-test/apply-improvements` | POST | Apply patches |
| `/api/admin/ai-test/consistency` | GET | Consistency |
| `/api/admin/ai-test/refactor-prompt` | POST | Refactor prompt |
| `/api/admin/ai-test/compare-runs` | GET | Compare runs |
| `/api/admin/ai-test/prompt-impact` | GET | Prompt version impact |
| `/api/admin/ai-test/generate-from-failures` | POST | Generate from failures |
| `/api/admin/ai-test/regressions` | GET | Regressions |
| `/api/admin/ai-test/results` | GET | Results |
| `/api/admin/ai-test/templates` | GET | Templates |
| `/api/admin/ai-test/scrape` | POST | Scrape |
| `/api/admin/ai-test/import` | POST | Import |
| `/api/admin/ai-test/import-pdf` | POST | Import PDF |
| `/api/admin/prompt-versions` | GET, POST | Prompt versions |
| `/api/admin/prompt-versions/create` | POST | Create version |
| `/api/admin/prompt-version` | GET, POST | Legacy prompt version |
| `/api/admin/prompt-layers` | GET, PUT | Prompt layers |
| `/api/admin/prompt-layers/versions` | GET | Layer version history |
| `/api/admin/backups` | GET | Backup list |
| `/api/admin/backups/create` | POST | Create backup |
| `/api/admin/backups/test-restore` | POST | Test restore |
| `/api/admin/budget-swaps` | GET, POST | Budget swaps map |
| `/api/admin/changelog` | GET, POST | Changelog CRUD |
| `/api/admin/create-price-cache` | POST | Create price cache |
| `/api/admin/data/table-sizes` | GET | Table sizes |
| `/api/admin/data/cleanup-snapshots` | POST | Cleanup snapshots |
| `/api/admin/data/cleanup-audit-logs` | POST | Cleanup audit |
| `/api/admin/data/cleanup-abandoned-accounts` | POST | Cleanup abandoned |
| `/api/admin/data/optimize-scryfall-cache` | POST | Optimize cache |
| `/api/admin/data/vacuum-analyze` | POST | Vacuum analyze |
| `/api/admin/errors` | GET | Error logs |
| `/api/admin/evals` | GET, POST | Evals |
| `/api/admin/events/summary` | GET | Events summary |
| `/api/admin/knowledge-gaps` | GET | Knowledge gaps |
| `/api/admin/metrics/llm` | GET | LLM metrics |
| `/api/admin/migrate-cache-schema` | POST | Migrate cache |
| `/api/admin/monetize` | GET, POST | Monetize toggles |
| `/api/admin/monetize/subscription-stats` | GET | Subscription stats |
| `/api/admin/monitor` | GET | Monitor |
| `/api/admin/ops/rollback-snapshot` | POST | Rollback snapshot |
| `/api/admin/personas/summary` | GET | Persona usage |
| `/api/admin/price/snapshot/build` | POST | Build today snapshot |
| `/api/admin/price/snapshot/bulk` | POST | Full snapshot |
| `/api/admin/pricing` | GET | Pricing charts |
| `/api/admin/rate-limits` | GET | Rate limit dashboard |
| `/api/admin/scryfall-cache` | GET, POST | Scryfall cache lookup/refresh |
| `/api/admin/snapshots/info` | GET | Snapshot info |
| `/api/admin/suggestion-stats` | GET | Suggestion stats |
| `/api/admin/stripe/webhook-status` | GET | Webhook status |
| `/api/admin/stripe/subscribers` | GET | Subscribers |
| `/api/admin/backfill-commanders` | POST | Backfill commanders |
| `/api/admin/ai-training/export` | GET | Export training |
| `/api/admin/seo-pages/list` | GET | SEO pages list |
| `/api/admin/seo-pages/generate` | POST | Generate |
| `/api/admin/seo-pages/publish` | POST | Publish |
| `/api/admin/seo-pages/set-indexing` | POST | Set indexing |
| `/api/admin/seo-pages/toggle` | POST | Toggle |
| `/api/admin/seo-queries/ingest` | POST | Ingest GSC queries |
| `/api/admin/users/search` | GET | User search |
| `/api/admin/users/pro` | POST | Set Pro |
| `/api/admin/users/billing` | POST | Set billing |
| `/api/admin/users/resend-verification` | POST | Resend verification |
| `/api/admin/users/gdpr-export` | POST | GDPR export |
| `/api/admin/users/gdpr-delete` | POST | GDPR delete |

---

## 5. Key Config Keys (app_config)

| Key | Used by | Description |
|-----|---------|-------------|
| `flags` | Ops | widgets, chat_extras, risky_betas, analytics_clicks_enabled |
| `maintenance` | Ops | enabled, message |
| `llm_budget` | Ops | daily_usd, weekly_usd |
| `prompts` | AI | version, templates, ab |
| `chat_packs` | AI | fast_swaps, combo_checks, rules_snippet |
| `moderation` | AI | allow, block |
| `ai.persona.seeds` | AI | Persona definitions |
| `chat_defaults` | Chat Levers | format, budget_cap, power |
| `answer_packs` | Chat Levers | fast_swaps, combo_checks, rules_snippet |
| `rules_sources` | Chat Levers | prefer (array) |
| `model_policy` | Chat Levers | model_per_route, max_cost_usd |
| `csp_hosts` | Security | img, script allowed hosts |
| `key_rotation` | Security | openai_last_rotated, supabase_last_rotated |
| `version_info` | Deploy | Version metadata |
| `perf_budgets` | Deploy | Performance budgets |
| `job:last:*` | Data | Last run timestamps for jobs |

---

## 6. Related Non-Admin APIs (Triggered from Admin)

| Route | Method | Triggered from |
|-------|--------|----------------|
| `/api/cron/bulk-scryfall` | POST | Data page |
| `/api/cron/bulk-price-import` | POST | Data page |
| `/api/cron/prewarm-scryfall` | POST | AI Usage (Other actions) |
| `/api/bulk-jobs/price-snapshot` | POST | Data page |

---

## 7. Scripts & Verification

- **Backfill AI cost:** `npm run backfill:ai-cost -- --dry-run --limit 10`
- **Verify AI:** `npm run verify:ai:strict -- --days 7 --limit 200`
- **Ingest GSC:** `npx tsx scripts/ingest-gsc-queries.ts` (POSTs to `/api/admin/seo-queries/ingest`)

---

## 8. File Locations

| Area | Path |
|------|------|
| Admin pages | `frontend/app/admin/**/page.tsx` |
| Admin APIs | `frontend/app/api/admin/**/route.ts` |
| Admin check | `frontend/lib/admin-check.ts` |
| Admin help (ELI5, HelpTip) | `frontend/components/AdminHelp.tsx` |
