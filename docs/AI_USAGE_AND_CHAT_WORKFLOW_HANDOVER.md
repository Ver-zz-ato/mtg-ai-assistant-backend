# AI Usage Analytics + Chat/Analysis Workflow — Handover

Comprehensive handover for the AI Usage Admin Board work and the current chat/deck-analysis flow. Use this for onboarding, debugging, and ops.

---

## 1. What Was Introduced Today (Phases Overview)

### Phase 1: Database (Migrations 040 + 041)

- **040_ai_usage_admin_analytics.sql**  
  - New nullable columns on `ai_usage`: `request_kind`, `has_deck_context`, `deck_card_count`, `used_v2_summary`, `used_two_stage`, `planner_model`, `planner_tokens_in`, `planner_tokens_out`, `planner_cost_usd`, `stop_sequences_enabled`, `max_tokens_config`, `response_truncated`, `user_tier`, `is_guest`, `deck_id`, `latency_ms`, `cache_hit`, `cache_kind`, `error_code`.  
  - Indexes: `(created_at DESC)`, `(route, created_at DESC)`, `(model, created_at DESC)`, `(user_id, created_at DESC)`, `(deck_id, created_at DESC)`.  
  - `request_kind` is the canonical analytics field; app can write `request_kind` and/or `layer0_mode` (we set `request_kind = payload.request_kind ?? payload.layer0_mode` in log-usage).

- **041_admin_audit_log.sql**  
  - New table `admin_audit_log`: `id` (UUID), `created_at`, `admin_user_id`, `action`, `payload_json`.  
  - Used for config-change audit; `payload_json` holds `{ key, before, after }` for `config_set`.  
  - Existing `admin_audit` is unchanged and still used for other admin actions.

### Phase 2: Instrumentation (log-usage + call sites)

- **lib/ai/log-usage.ts**  
  - `RecordAiUsagePayload` extended with all new optional fields (e.g. `request_kind`, `has_deck_context`, `used_v2_summary`, `used_two_stage`, `planner_*`, `user_tier`, `is_guest`, `deck_id`, `latency_ms`, `cache_hit`, `cache_kind`, `error_code`).  
  - Insert builds a full row with `request_kind = payload.request_kind ?? payload.layer0_mode`; on failure, falls back to inserts without new columns so behavior is correct before/after migrations.

- **Call sites**  
  - **Chat (app/api/chat/route.ts):**  
    - NO_LLM path: `recordAiUsage` with `route: 'chat'`, `request_kind: 'NO_LLM'`, `user_tier`, `is_guest`.  
    - Main path: single `recordAiUsage` at the end (no double-record). `skipRecordAiUsage: true` is passed to `callLLM` so the route owns the one row.  
    - Two-stage: planner call uses `skipRecordAiUsage: true`; outline usage is captured and written on the same final row via `used_two_stage`, `planner_model`, `planner_tokens_in/out`, `planner_cost_usd` (writer `cost_usd` only; total = planner_cost_usd + cost_usd).  
    - Payload includes: `request_kind`, `has_deck_context`, `deck_card_count`, `used_v2_summary`, `used_two_stage`, `planner_*`, `stop_sequences_enabled`, `max_tokens_config`, `deck_id`, `latency_ms`, `user_tier`, `is_guest`.  
  - **Chat stream (app/api/chat/stream/route.ts):**  
    - NO_LLM and final usage both call `recordAiUsage` with the new fields; `latency_ms` from stream start; `has_deck_context`, `used_v2_summary`, `deck_id`, `user_tier`, `is_guest`.  
  - **Deck analyze (app/api/deck/analyze/route.ts):**  
    - NO_LLM (no deck) path: `recordAiUsage` with `route: 'deck_analyze'`, `request_kind: 'NO_LLM'`.  
  - **unified-llm-client (lib/ai/unified-llm-client.ts):**  
    - `LLMConfig` has `skipRecordAiUsage` and optional extended fields. When `skipRecordAiUsage` is false, `recordAiUsage` is called with base + extended fields (including `latency_ms`). Routes that record a single combined row (e.g. chat) set `skipRecordAiUsage: true`.

- **Scoping fix:** `pastedDeckTextRaw` was hoisted to the same scope as `deckIdToUse` / `pastedDecklistContext` in the chat route so Layer 0 and v2 context blocks can reference it.

### Phase 3: Runtime config (app_config + env overrides)

- **lib/ai/runtime-config.ts**  
  - `getRuntimeAIConfig(supabase)` reads `app_config` for `flags`, `llm_budget`, `llm_models`, `llm_thresholds`.  
  - Merges with env: `LLM_V2_CONTEXT=off` → `flags.llm_v2_context = false`; `LLM_LAYER0 !== 'on'` → `flags.llm_layer0 = false`. Env “off” wins.  
  - In-memory cache TTL 30s.

- **Consumers**  
  - Chat, chat/stream, and deck/analyze no longer rely only on `process.env.LLM_LAYER0` / `LLM_V2_CONTEXT`. They call `getRuntimeAIConfig(supabase)` and use `flags.llm_layer0`, `flags.llm_v2_context`. Env is still the override (e.g. `LLM_V2_CONTEXT=off` forces v2 off).

### Phase 4: Admin API (`/api/admin/ai/`)

All routes use `isAdmin(user)` from `lib/admin-check.ts`; 403 if not admin.

- **GET /api/admin/ai/overview?from=&to=&days=**  
  - Aggregates `ai_usage` in range: totals (cost, requests, tokens, avg cost, p95 latency), by_model, by_route, by_request_kind (uses `request_kind ?? layer0_mode`), by_context_source, by_used_two_stage, by_cache_hit, series_daily, series_hourly.

- **GET /api/admin/ai/top?from=&to=&dimension=model|route|user|deck|thread|error_code**  
  - Top 20 by cost for the chosen dimension.

- **GET /api/admin/ai/usage/list**  
  - Keyset pagination (`next_cursor` = `created_at|id`), filters: model, route, request_kind, context_source, used_two_stage, is_guest, user_tier, min_cost, min_tokens_in, error_code, deck_id, thread_id, user_id. Returns `{ items, next_cursor, has_more }`.

- **GET /api/admin/ai/usage/[id]**  
  - Single row plus a short `cost_reasons` narrative (route, request_kind, context, two-stage, cache, latency, error).

- **GET /api/admin/ai/config**  
  - Returns current runtime config (from `getRuntimeAIConfig`) and “last updated” from `admin_audit_log` (latest config_set per key).

- **POST /api/admin/ai/config**  
  - Body: `{ key, value }` or `{ updates: { key: value } }`. Allowed keys: `flags`, `llm_budget`, `llm_models`, `llm_thresholds`. Writes to `app_config` and inserts into `admin_audit_log` with `payload_json: { key, before, after }`.

- **GET /api/admin/ai/recommendations?from=&to=&days=**  
  - Suggests config changes from usage (e.g. enable v2 context, enable Layer 0). No auto-apply.

### Phase 5: Admin UI (Board)

- **Route:** `/admin/ai-usage` (existing page). New **Board** tab (default).

- **Sections (in order):**  
  1. **KPI cards** — Total cost, requests, avg cost/request, P95 latency, tokens in/out (from overview). Refresh every 60s + manual Refresh.  
  2. **Time-series** — Recharts cost over time (daily/hourly toggle from overview).  
  3. **Breakdown tables** — By model, route, request_kind; row click → Request log tab with that filter.  
  4. **Top cost drivers** — Top 20 user, deck, thread, error_code from `/api/admin/ai/top`.  
  5. **Usage log** — Paginated list from `/api/admin/ai/usage/list`; row click → drawer with full row + cost_reasons from `/api/admin/ai/usage/[id]`.  
  6. **Switchboard** — Shows current flags/config and last_updated; actual changes via POST to `/api/admin/ai/config`.  
  7. **Recommendations** — List from `/api/admin/ai/recommendations`; “Apply switch” suggests change (user must confirm).

- **Summary** and **Request log** tabs and price-snapshot block are unchanged (snapshot in collapsible).

### Phase 6: Docs

- **docs/AI_USAGE_ADMIN.md** — How to read the dashboard, config switches, safe operating playbook, suggested thresholds, API summary.

---

## 2. Current Supabase Schema (Relevant Tables)

- **ai_usage** — Identity `id`, `user_id` (NOT NULL), `thread_id`, `model`, `input_tokens`, `output_tokens`, `cost_usd`, `created_at`, plus prompt/response previews, `route`, `context_source`, `summary_tokens_estimate`, `deck_hash`, `layer0_mode`, `layer0_reason`, and all new analytics columns (request_kind, has_deck_context, deck_card_count, used_v2_summary, used_two_stage, planner_*, stop_sequences_enabled, max_tokens_config, response_truncated, user_tier, is_guest, deck_id, latency_ms, cache_hit, cache_kind, error_code). Optional: persona_id, teaching, prompt_path, prompt_version_id, modules_attached_count, format_key, model_tier.
- **admin_audit** — Existing; actor_id, action, target, payload (used for non-config admin actions).
- **admin_audit_log** — New; id (UUID), created_at, admin_user_id, action, payload_json (config_set with key, before, after).
- **app_config** — key (PK), value (JSONB), updated_at. Keys include `flags`, `llm_budget`, `llm_models`, `llm_thresholds`.
- **deck_context_summary** — deck_id, deck_hash, summary_json (v2 summary for chat).
- **chat_threads** / **chat_messages** — Used by chat and stream.

---

## 3. End-to-End Workflow: Chat

1. **Auth & rate limits**  
   - Resolve user (or guest token). Check durable rate limit and (if applicable) free/pro daily limits.

2. **Thread & history**  
   - Resolve or create thread; load recent messages. Detect pasted decklist in history; set `pastedDeckTextRaw` and build `pastedDecklistContext` / `pastedDecklistForCompose`. If thread has linked deck, load deck and `deckText` / `entries`.

3. **Runtime config**  
   - `getRuntimeAIConfig(supabase)` → `flags.llm_layer0`, `flags.llm_v2_context` (env overrides applied).

4. **Layer 0 (if `flags.llm_layer0 === true`)**  
   - `layer0Decide(text, hasDeckContext, …)` → NO_LLM | MINI_ONLY | FULL_LLM.  
   - If NO_LLM: respond with static/FAQ or “need deck”; `recordAiUsage(route: 'chat', request_kind: 'NO_LLM', …)`; return.  
   - If MINI_ONLY: set `layer0MiniOnly` (model + max_tokens) for the main call.

5. **V2 context (if `flags.llm_v2_context !== false`)**  
   - Linked deck: get-or-build `deck_context_summary` (deck_id + deck_hash); inject summary JSON into system prompt.  
   - Pasted deck: get or build summary (paste cache by hash); inject.  
   - Set `context_source` (linked_db | paste_ttl | raw_fallback), `summaryTokensEstimate`, `deckHashForLog`.

6. **System prompt**  
   - Compose via `buildSystemPromptForRequest`; append deck context (v2 summary or full list), RAG, conversation summary, format knowledge, etc.

7. **Cache (optional)**  
   - If response cache hit, return cached text and skip LLM; no ai_usage row for that path (cache hit path does not currently write a row; main path writes one).

8. **Budget**  
   - `allowAIRequest(supabase)`; if not allowed, return 429.

9. **Two-stage (non-stream, when enabled)**  
   - If complex + deck context + long-answer: call planner (mini) with `skipRecordAiUsage: true`; capture planner usage; append outline to system prompt for writer.

10. **Main LLM call**  
    - `callOpenAI(…, { skipRecordAiUsage: true })` → `callLLM(…, skipRecordAiUsage: true)`. No recording inside client.

11. **Post-processing**  
    - Review/guard step, validation, price injection, cache write on success.

12. **Single ai_usage row**  
    - `recordAiUsage(route: 'chat', model, tokens, cost_usd, request_kind/layer0_mode, has_deck_context, deck_card_count, used_v2_summary, used_two_stage, planner_*, stop_sequences_enabled, max_tokens_config, deck_id, latency_ms, user_tier, is_guest, …)`.

---

## 4. End-to-End Workflow: Chat Stream

- Same auth, thread, deck/paste detection, and runtime config.  
- Layer 0: if NO_LLM, stream static response and `recordAiUsage(route: 'chat_stream', request_kind: 'NO_LLM', …)`.  
- V2 context: same as chat (linked_db / paste_ttl / raw_fallback).  
- Single LLM stream; on completion, one `recordAiUsage` with full payload and `latency_ms` from stream start.

---

## 5. End-to-End Workflow: Deck Analyze

- Load deck (body.deckId or pasted).  
- Runtime config: `getRuntimeAIConfig(supabase)`. If `flags.llm_layer0 === true` and no deck text → NO_LLM: `recordAiUsage(route: 'deck_analyze', request_kind: 'NO_LLM', …)` and return need_more_info.  
- Otherwise run full analyze; usage recorded by callers/unified-llm-client as before (feature `deck_analyze` etc.).

---

## 6. Key Files (Quick Reference)

| Area | Files |
|------|--------|
| Migrations | `frontend/db/migrations/040_ai_usage_admin_analytics.sql`, `041_admin_audit_log.sql` |
| Logging | `frontend/lib/ai/log-usage.ts` |
| Runtime config | `frontend/lib/ai/runtime-config.ts` |
| Chat flow | `frontend/app/api/chat/route.ts` |
| Stream flow | `frontend/app/api/chat/stream/route.ts` |
| Deck analyze | `frontend/app/api/deck/analyze/route.ts` |
| LLM client | `frontend/lib/ai/unified-llm-client.ts` |
| Layer 0 | `frontend/lib/ai/layer0-gate.ts` |
| Admin API | `frontend/app/api/admin/ai/overview/route.ts`, `top/route.ts`, `usage/list/route.ts`, `usage/[id]/route.ts`, `config/route.ts`, `recommendations/route.ts` |
| Admin UI | `frontend/app/admin/ai-usage/page.tsx` |
| Admin check | `frontend/lib/admin-check.ts` |
| Docs | `docs/AI_USAGE_ADMIN.md`, `docs/LLM_V2_HANDOVER.md`, `docs/REDUCE_API_USAGE_GUIDE.md` |

---

## 7. Config and Audit

- **Runtime flags** live in `app_config.key = 'flags'`, value = JSON (e.g. llm_v2_context, llm_layer0, llm_two_stage, llm_stop_sequences, llm_dynamic_ceilings, llm_force_mini_only, llm_disable_stream).  
- **Budget** in `app_config.key = 'llm_budget'`, value = `{ daily_usd, weekly_usd }`.  
- **Env overrides:** `LLM_V2_CONTEXT=off` forces v2 off; `LLM_LAYER0` must be `on` to enable Layer 0.  
- **Config changes:** POST `/api/admin/ai/config` updates `app_config` and inserts into `admin_audit_log` with before/after.  
- **Cache:** `getRuntimeAIConfig` cached in process for 30s.

---

## 8. Build and Verification

- `npm run build` in `frontend` completes successfully.  
- Admin Board: open `/admin/ai-usage` as an admin user; Board tab shows overview, charts, breakdowns, top drivers, usage log, switchboard, recommendations.  
- Usage and cost can be cross-checked with the provider dashboard; ai_usage totals and request_kind/context_source breakdowns should align within rounding.

This handover plus **AI_USAGE_ADMIN.md** (operating the Board and config) and **LLM_V2_HANDOVER.md** (context summary + generation efficiency) give full coverage of the current chat/analysis and AI usage analytics setup.

---

## 9. Ops sanity checks (where these systems usually wobble)

- **Double-writing ai_usage**  
  Chat uses `skipRecordAiUsage: true` so the route owns a single row; no double-write from unified-llm-client + route. Stream has two code paths: (1) NO_LLM → one `recordAiUsage` then return; (2) normal completion → one `recordAiUsage` at end. No mid-flight switch that writes both; worth keeping an eye if stream logic is extended.

- **ai_usage.user_id NOT NULL vs guests**  
  Schema may have `user_id NOT NULL`. We pass `user_id: userId ?? null` for guests. If the table is still NOT NULL, guest inserts will fail unless you: use a synthetic guest user_id, relax the constraint, or write to a separate guest-usage store. If guests work in prod, one of these is already in place—otherwise this is the classic footgun.

- **Cache-hit path not writing ai_usage**  
  Cache hits do not write a row. Dashboard request counts will be lower than app traffic; to measure “how often we avoided LLM via cache” you’d need a zero-cost cache_hit row or a separate ai_events table. Accounting semantics are intentional; just be aware.

- **Admin endpoints + RLS**  
  Routes are guarded by `isAdmin(user)`. Overview, top, usage/list, usage/[id], recommendations use `getServerSupabase()` (anon + user context). If `ai_usage` has RLS that restricts by `auth.uid()`, admins will only see their own rows unless you add an RLS policy for admins or use a service-role client for those reads. Config POST correctly uses `getAdmin()` (service role) for app_config and admin_audit_log writes. If you see “works locally, empty in prod” for admin analytics, check RLS and consider service-role for admin read paths.

- **Runtime config cache**  
  30s TTL is documented; config changes take effect within that window.
