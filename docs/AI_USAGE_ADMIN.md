# AI Usage Admin Dashboard

This document describes how to use the AI Usage Analytics + Admin Overview Board, the meaning of config switches, and a safe operating playbook.

## Dashboard location

- **URL**: `/admin/ai-usage` (requires admin; see `ADMIN_USER_IDS` / `ADMIN_EMAILS`).
- **Tabs**: **Board** (new overview), **Summary** (legacy by route/model/day/user), **Request log** (legacy request list).

## How to read the Board

1. **KPI cards**  
   Total cost, request count, average cost per request, P95 latency, and tokens in/out for the selected day range. Use **Refresh** to reload; the overview auto-refreshes every 60 seconds.

2. **Time-series chart**  
   Cost over time (daily or hourly). Toggle **Daily** / **Hourly** to switch buckets. Use this to spot spikes or trends.

3. **Breakdown tables**  
   - **By model**: which models are costing the most; click a row to open the Request log tab filtered by that model.  
   - **By route**: same for route (e.g. `chat`, `chat_stream`, `deck_analyze`).  
   - **By request kind**: FULL_LLM vs MINI_ONLY vs NO_LLM; shows how often Layer 0 is routing to mini or skipping the LLM.

4. **Top cost drivers**  
   Top users, decks, threads, and error codes by cost. Use these to find heavy users or problematic dimensions.

5. **Usage log**  
   Paginated list of recent `ai_usage` rows. Click a row to open a **detail drawer** with the full row and a short “cost reasons” narrative (context used, two-stage, cache, etc.). Use **Load more** for keyset pagination.

6. **Config switchboard**  
   Displays current runtime flags and (when available) “last updated” from the config audit log. Changes are made via **POST** to `/api/admin/ai/config` (e.g. from an admin tool or API client). See “Config switches” below.

7. **Recommendations**  
   Suggestions such as “enable v2 context” or “enable Layer 0” based on recent usage. **Apply switch** only pre-fills or suggests a change; you must confirm and apply it yourself (no auto-apply).

## Config switches (runtime toggles)

Stored in `app_config` under the key `flags` (one JSON object). Env kill-switches override when set to `off`.

| Flag | Meaning | Safe default |
|------|--------|----------------|
| `llm_v2_context` | Use v2 deck summary instead of full decklist in chat. | `true` |
| `llm_layer0` | Enable Layer 0 gate (NO_LLM / MINI_ONLY / FULL_LLM). | `false` |
| `llm_two_stage` | Use two-stage planner (outline then writer) for long answers. | `true` |
| `llm_stop_sequences` | Use stop sequences to cut filler. | `true` |
| `llm_dynamic_ceilings` | Use dynamic token ceilings by complexity. | `true` |
| `llm_force_mini_only` | **Emergency**: force all requests to mini model. | `false` |
| `llm_disable_stream` | **Emergency**: disable streaming. | `false` |

- **Budget** is stored under `llm_budget`: `{ daily_usd, weekly_usd }`.  
- Env overrides: `LLM_V2_CONTEXT=off` forces v2 context off; `LLM_LAYER0` must be `on` to enable Layer 0 (otherwise it stays off even if the flag is true).  
- Runtime config is cached ~30 seconds; changes in `app_config` take effect within that window.

## Safe operating playbook

1. **Spike in cost**  
   - Check the time-series chart and “By model” / “By route” breakdowns.  
   - Open the Usage log and sort/filter by cost; use the detail drawer to see “why this cost” (context, two-stage, model).  
   - If a single user or deck dominates, check Top cost drivers.

2. **Reduce cost quickly**  
   - Enable **Layer 0** (`llm_layer0: true`) to route more traffic to MINI or NO_LLM.  
   - Consider **Force MINI only** (`llm_force_mini_only: true`) as a temporary emergency brake; turn off once the situation is under control.  
   - Lower **Budget** caps (`llm_budget.daily_usd`, `llm_budget.weekly_usd`) to hard-cap spend.

3. **High “raw_fallback” or low cache hit rate**  
   - Ensure v2 summary is on (`llm_v2_context: true`) so more requests use linked_db or paste_ttl context.  
   - Check Recommendations for suggestions.

4. **Changing config**  
   - Use **POST /api/admin/ai/config** with body `{ updates: { flags: { ... } } }` or `{ key: "llm_budget", value: { daily_usd, weekly_usd } }`.  
   - Every change is written to `admin_audit_log` with before/after; “Last updated” in the UI reflects this.  
   - For emergency toggles (`llm_force_mini_only`, `llm_disable_stream`), use a confirm step in your workflow before applying.

5. **Verifying behavior**  
   - After changing flags, send a few test requests and check the Usage log and detail drawer to confirm request_kind, context_source, and model match expectations.  
   - Compare totals on the Board with your provider dashboard (e.g. OpenAI) within rounding.

## Suggested thresholds

- **Daily budget**: set `llm_budget.daily_usd` to a value that matches your risk tolerance (e.g. 10–50 USD for a small app).  
- **Layer 0**: enable when you want to cap cost and are comfortable with more MINI/NO_LLM; keep off if you prefer full model quality.  
- **P95 latency**: if the Board shows P95 &gt; 30s consistently, consider lowering max tokens or enabling MINI for more routes.  
- **Cache hit rate**: use “By cache_hit” on the overview; aim to increase linked_db/paste_ttl usage if raw_fallback is high.

## APIs (all require admin)

- `GET /api/admin/ai/overview?from=&to=&days=` — totals, breakdowns, series_daily, series_hourly.  
- `GET /api/admin/ai/top?dimension=model|route|user|deck|thread|error_code` — top 20 by cost.  
- `GET /api/admin/ai/usage/list?from=&to=&limit=&next_cursor=&model=&route=&request_kind=&...` — keyset-paginated list.  
- `GET /api/admin/ai/usage/[id]` — single row + cost_reasons narrative.  
- `GET /api/admin/ai/config` — current runtime config + last_updated.  
- `POST /api/admin/ai/config` — body `{ key, value }` or `{ updates: { key: value } }`; valid keys: `flags`, `llm_budget`, `llm_models`, `llm_thresholds`.  
- `GET /api/admin/ai/recommendations?from=&to=&days=` — suggested switch changes (no auto-apply).
