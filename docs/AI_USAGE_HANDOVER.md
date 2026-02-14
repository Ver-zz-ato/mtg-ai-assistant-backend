# AI Usage System — Full Handover Document

This document describes how the AI usage tracking and admin dashboard are built, what they record, and how to maintain or extend them. Intended for LLM handover and human developers.

---

## 1. Overview

The AI usage system tracks every OpenAI (LLM) request made by the application: cost, tokens, model, route/feature, user, deck, and many contextual fields. Data is stored in the `ai_usage` table (Supabase) and surfaced in the admin dashboard at `/admin/ai-usage`.

**Key files:**
- `frontend/lib/ai/log-usage.ts` — Central recording function `recordAiUsage()`
- `frontend/lib/ai/route-to-page.ts` — Maps route names to site locations
- `frontend/lib/ai/pricing.ts` — Cost calculation and `PRICING_VERSION`
- `frontend/app/admin/ai-usage/page.tsx` — Admin UI (Board, Summary, Request log)
- `frontend/app/api/admin/ai/*` — Admin APIs (overview, list, detail, etc.)
- `frontend/db/migrations/*_ai_usage*.sql` — Schema migrations

---

## 2. What Gets Recorded

### 2.1 Core Fields (always present when possible)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Auto-generated primary key |
| `created_at` | timestamptz | When the request completed |
| `user_id` | UUID \| null | Authenticated user; null for guests |
| `thread_id` | text \| null | Chat thread ID (for chat routes) |
| `model` | text | Actual model used (e.g. `gpt-4o`, `gpt-4o-mini`, `none`, `cached`) |
| `input_tokens` | int | Input/prompt tokens |
| `output_tokens` | int | Output/completion tokens |
| `cost_usd` | numeric | Cost in USD (from pricing.ts or passed) |
| `route` | text | **Feature/route identifier** (see §3) |
| `pricing_version` | text | Version tag for cost interpretation (e.g. `2026-02-14`) |

### 2.2 Previews (truncated to 1000 chars)

| Column | Description |
|--------|--------------|
| `prompt_preview` | Truncated user input / prompt |
| `response_preview` | Truncated AI response |

### 2.3 Prompt / Model Context

| Column | Description |
|--------|--------------|
| `model_tier` | e.g. `pro`, `free` |
| `prompt_path` | Composed prompt path (prompt layers) |
| `format_key` | Output format key |
| `prompt_tier` | 3-tier: `micro` \| `standard` \| `full` |
| `system_prompt_token_estimate` | Rough estimate (chars/4) |

### 2.4 Deck Context (LLM v2)

| Column | Description |
|--------|--------------|
| `deck_size` | Number of cards in deck |
| `context_source` | `linked_db` \| `paste_ttl` \| `raw_fallback` |
| `summary_tokens_estimate` | Estimated tokens from deck summary |
| `deck_hash` | Hash of deck list when context used |
| `deck_id` | Deck UUID when applicable |
| `has_deck_context` | Whether deck summary/context was available |
| `deck_card_count` | Card count when deck context used |
| `used_v2_summary` | Whether v2 summary was injected |

### 2.5 Layer 0 Gate

| Column | Description |
|--------|--------------|
| `layer0_mode` | `NO_LLM` \| `MINI_ONLY` \| `FULL_LLM` |
| `layer0_reason` | Explainable reason from gate |
| `request_kind` | Canonical alias for `layer0_mode` (analytics) |

### 2.6 Two-Stage (Planner + Writer)

| Column | Description |
|--------|--------------|
| `used_two_stage` | Whether planner outline was used |
| `planner_model` | Model used for planner call |
| `planner_tokens_in` | Planner input tokens |
| `planner_tokens_out` | Planner output tokens |
| `planner_cost_usd` | Cost of planner call |

### 2.7 Request Config

| Column | Description |
|--------|--------------|
| `stop_sequences_enabled` | Whether stop sequences were used |
| `max_tokens_config` | Configured max output tokens |
| `response_truncated` | Whether response was truncated |

### 2.8 User / Session

| Column | Description |
|--------|--------------|
| `user_tier` | User tier (e.g. pro, free) |
| `is_guest` | Whether request was from guest |

### 2.9 Performance / Errors

| Column | Description |
|--------|--------------|
| `latency_ms` | Request latency in ms |
| `cache_hit` | Whether response came from cache |
| `cache_kind` | `exact` \| `paste_ttl` \| `linked_db` \| `none` |
| `error_code` | e.g. `429_budget`, `timeout`, `provider_error` |

---

## 3. Route / Feature Mapping

The `route` column stores a **feature identifier**, not necessarily the HTTP path. Different callers use different values:

| Stored `route` | Site Location | API Path | Description |
|----------------|---------------|----------|-------------|
| `chat` | Chat (non-stream) | `/api/chat` | Legacy/batch chat |
| `chat_stream` | Chat (streaming) | `/api/chat/stream` | ManaTap AI chat in deck builder, deck page, homepage |
| `deck_analyze` | Deck Analyze | `/api/deck/analyze` | Full deck analysis |
| `deck_analyze_slot_planning` | Deck Analyze (slot planning) | `/api/deck/analyze` | Two-stage: planning phase |
| `deck_analyze_slot_candidates` | Deck Analyze (slot candidates) | `/api/deck/analyze` | Two-stage: candidates phase |
| `swap_why` | Budget Swap Why | `/api/deck/swap-why` | Why a swap was suggested |
| `swap_suggestions` | Budget Swaps | `/api/deck/swap-suggestions` | Cost to finish / budget swap suggestions |
| `suggestion_why` | Suggestion Why | `/api/deck/suggestion-why` | Why a card was suggested |
| `deck_scan` | Deck Health / Scan | `/api/deck/health-suggestions` | Deck health suggestions |
| `deck_compare` | Deck Compare | `/api/deck/compare-ai` | Compare two decks |
| `reprint_risk` | Reprint Risk | `/api/cards/reprint-risk` | Card reprint risk analysis |
| `debug_ping` | Admin AI Health | `/api/admin/ai/health` | Admin probe/ping |

The mapping is defined in `frontend/lib/ai/route-to-page.ts` and used by the admin UI to show "Called from: [page]" context.

---

## 4. Where `recordAiUsage` Is Called

### 4.1 Direct Calls (route handlers)

| File | When | Route stored |
|------|------|--------------|
| `app/api/chat/route.ts` | NO_LLM (Layer 0 skip), cache hit, or after LLM completion | `chat` |
| `app/api/chat/stream/route.ts` | NO_LLM (Layer 0 skip) or after stream completion | `chat_stream` |
| `app/api/deck/analyze/route.ts` | NO_LLM when no deck text | `deck_analyze` |
| `app/api/deck/analyze/route.ts` | After full analysis (via callLLM with `skipRecordAiUsage`) | `/api/deck/analyze` (route) + feature in callLLM |

### 4.2 Via `callLLM` (unified-llm-client)

When `skipRecordAiUsage` is **false**, `callLLM` in `frontend/lib/ai/unified-llm-client.ts` calls `recordAiUsage` with `route: config.feature`. The `feature` is passed by each route:

| Route | Feature passed |
|-------|----------------|
| `/api/chat` | `chat` |
| `/api/deck/analyze` | `deck_analyze`, `deck_analyze_slot_planning`, `deck_analyze_slot_candidates` |
| `/api/deck/swap-why` | `swap_why` |
| `/api/deck/swap-suggestions` | `swap_suggestions` |
| `/api/deck/suggestion-why` | `suggestion_why` |
| `/api/deck/health-suggestions` | `deck_scan` |
| `/api/deck/compare-ai` | `deck_compare` |
| `/api/cards/reprint-risk` | `reprint_risk` |
| `/api/admin/ai/health` | `debug_ping` |

### 4.3 Insert Fallback Strategy

`recordAiUsage` tries multiple insert payloads so the DB works with or without newer migrations:

1. **Full** — All optional columns
2. **Without previews** — If `prompt_preview`/`response_preview` columns missing
3. **Legacy** — Without newer analytics columns
4. **Minimal** — `user_id`, `thread_id`, `model`, `input_tokens`, `output_tokens`, `cost_usd`, optionally `route`, `prompt_preview`, `response_preview`

---

## 5. Cost Calculation

- **Source:** `frontend/lib/ai/pricing.ts`
- **Version:** `PRICING_VERSION = "2026-02-14"` (bump when pricing changes)
- **Function:** `costUSD(model, inputTokens, outputTokens)` — uses per-1K-token rates
- **OpenAI 2025 rates (approx):**
  - `gpt-4o`: $2.50/1M in, $10/1M out
  - `gpt-4o-mini`: $0.15/1M in, $0.60/1M out
- If `cost_usd` is passed and valid, it is used; otherwise computed from tokens.

---

## 6. Admin Dashboard (`/admin/ai-usage`)

### 6.1 Tabs

| Tab | Purpose |
|-----|---------|
| **Board** | New overview: KPIs, time series, by model/route/request_kind, top drivers, usage log, config, recommendations, OpenAI actual |
| **Summary** | Legacy: by route, model, day, top users; price snapshots |
| **Request log** | Paginated request list with filters, sort, expandable details, export |

### 6.2 Board Tab Features

- **KPI cards:** Total cost, requests, avg cost/req, P95 latency, tokens in/out
- **OpenAI actual:** Fetches from OpenAI Usage/Costs API (`OPENAI_ADMIN_API_KEY`); compares our estimate vs actual
- **Time series:** Daily or hourly cost chart
- **Breakdowns:** By model, route, request kind
- **Top drivers:** By user, deck, thread, error_code
- **Usage log:** Paginated list; click row → detail modal
- **Detail modal:** Cost, "Called from" (route→page), prompt/response preview, all fields table, raw JSON
- **Export full CSV:** Fetches up to 2000 rows for selected days, exports all columns

### 6.3 Request Log Tab Features

- **Filters:** Days, sort (cost/time/tokens), route
- **Columns:** Time, User, Route, Called from, Model, Tier, Cost, In/Out, Prompt path, Details
- **Expandable row:** Input/output preview
- **Export request log CSV:** All columns including `route_page` (page + description), prompt/response truncated to 5000 chars

### 6.4 APIs (all require admin)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/admin/ai/overview?days=` | Totals, by_model, by_route, by_request_kind, series_daily, series_hourly |
| `GET /api/admin/ai/top?dimension=user|deck|thread|error_code` | Top 20 by cost |
| `GET /api/admin/ai/usage/list?days=&limit=&next_cursor=&model=&route=...` | Keyset-paginated list (select `*`) |
| `GET /api/admin/ai/usage/[id]` | Single row + cost_reasons + route_context |
| `GET /api/admin/ai-usage/requests?days=&limit=&offset=&model=&route=` | Request log with user resolution |
| `GET /api/admin/ai/openai-usage?days=` | OpenAI actual usage/costs |
| `GET /api/admin/ai/config` | Runtime config |
| `GET /api/admin/ai/recommendations?days=` | Suggested switch changes |

---

## 7. Database Schema (Migrations)

| Migration | Columns added |
|-----------|---------------|
| `034_ai_usage_request_previews.sql` | `route`, `prompt_preview`, `response_preview` |
| `031_ai_usage_prompt_path_columns.sql` | `prompt_path`, `prompt_version_id`, `modules_attached_count`, `format_key`, `model_tier` |
| `038_ai_usage_context_source.sql` | `context_source`, `summary_tokens_estimate`, `deck_hash` |
| `039_ai_usage_layer0.sql` | `layer0_mode`, `layer0_reason` |
| `040_ai_usage_admin_analytics.sql` | `request_kind`, `has_deck_context`, `deck_card_count`, `used_v2_summary`, `used_two_stage`, `planner_*`, `stop_sequences_enabled`, `max_tokens_config`, `response_truncated`, `user_tier`, `is_guest`, `deck_id`, `latency_ms`, `cache_hit`, `cache_kind`, `error_code` |
| `052_ai_usage_allow_guest_user_id_null.sql` | Allow `user_id` NULL for guests |
| `055_ai_usage_prompt_tier.sql` | `prompt_tier`, `system_prompt_token_estimate` |

**Indexes:** `created_at DESC`, `(route, created_at DESC)`, `(model, created_at DESC)`, `(user_id, created_at DESC)`, `(deck_id, created_at DESC)`

---

## 8. Environment Variables

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | OpenAI API key for LLM calls |
| `OPENAI_ADMIN_API_KEY` | Admin API key for OpenAI Usage/Costs API (Board "OpenAI actual") |
| `ADMIN_USER_IDS` / `ADMIN_EMAILS` | Who can access `/admin/ai-usage` |

---

## 9. Maintenance Notes

1. **Adding a new route:** Add the route/feature to `route-to-page.ts` and ensure the API passes `feature` (or `route`) to `callLLM` or `recordAiUsage`.
2. **New columns:** Add to `RecordAiUsagePayload` in `log-usage.ts`, include in full/fallback payloads, add migration, optionally add to requests API select and export.
3. **Pricing changes:** Update `pricing.ts`, bump `PRICING_VERSION`; historical rows keep old version for interpretation.
4. **Double-write:** Chat uses `skipRecordAiUsage: true` so the route records a single row; unified-llm-client does not double-record.
5. **RLS:** Admin read paths may need service-role client if `ai_usage` has RLS restricting by `auth.uid()`.

---

## 10. Related Docs

- `docs/AI_USAGE_ADMIN.md` — Config switches, safe operating playbook
- `docs/AI_USAGE_AND_CHAT_WORKFLOW_HANDOVER.md` — Chat workflow and ai_usage integration
- `frontend/lib/ai/layer0-gate.ts` — Layer 0 gate logic (NO_LLM / MINI_ONLY / FULL_LLM)
