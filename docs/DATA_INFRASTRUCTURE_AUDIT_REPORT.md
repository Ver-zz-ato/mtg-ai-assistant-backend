# ManaTap Data Infrastructure Audit Report

**Purpose:** Understand what telemetry, analytics, and deck data already exist to support (1) behavioral learning from AI suggestions, (2) meta trend tracking over time, and (3) deck structure / synergy modeling.  
**Scope:** mtg_ai_assistant (Next.js website + backend). Audit only — no code changes.

---

## 1. Analytics & Telemetry

### 1.1 Stack

- **PostHog** (EU): Primary analytics. Client-side via `posthog-js` (initialized in `Providers.tsx` after consent); server-side via `posthog-node` in `lib/server/analytics.ts`.
- **Consent:** Cookie consent gates client PostHog; server-side `captureServer` uses distinctId (visitor_id or user_id); fallback ID avoids `anon` merge.
- **Helpers:** `lib/ph.ts` — `capture()`, `identify()`, `reset()`; `lib/analytics/track.ts` — feature-flagged UI click tracking with PostHog or server fallback (`/api/analytics/track-event`).

### 1.2 Event Names & Properties (Relevant to AI / Decks / Meta)

| Event | Properties (typical) | Where triggered |
|-------|----------------------|------------------|
| **ai_suggestion_shown** | `suggestion_count`, `deck_id`, `categories`, `prompt_version` | `DeckAnalyzerPanel.tsx` when suggestions list is set |
| **ai_suggestion_accepted** | `suggestion_id`, `card`, `category`, `deck_id`, `prompt_version` | `DeckAnalyzerPanel.tsx` on Add/Accept (synergy-upgrade, optional) |
| **ai_prompt_path** | `prompt_path`, `kind`, `formatKey`, `modules_attached_count`, `prompt_version_id`, `tier`, `model`, `route`, `request_id` | `app/api/chat/stream/route.ts` after compose |
| **deck_saved** | `deck_id`, `inserted`, `user_id`, `ms`, `format`, `commander`, `prompt_version` | `app/api/decks/create/route.ts` (server) |
| **deck_updated** | (similar) | `app/api/decks/update/route.ts` (server) |
| **deck_deleted** | `deck_id`, `user_id` | `app/api/decks/delete/route.ts` (server) |
| **deck_editor_opened** | `deck_id` | `app/my-decks/[id]/Client.tsx` |
| **deck_card_added** | `deck_id`, `card`, `qty` | `CardsPane.tsx` |
| **deck_card_removed** | `deck_id`, `card` | `CardsPane.tsx` |
| **deck_card_quantity_changed** | `deck_id`, `card`, `old_qty`, `new_qty` | `CardsPane.tsx` |
| **deck_analyzed** | (from `DeckSnapshotPanel`) | DeckSnapshotPanel.tsx |
| **deck_analyze_started** | (context) | DeckSnapshotPanel.tsx |
| **mulligan_hand_drawn** | (hand/deck context) | `HandTestingWidget.tsx` |
| **mulligan_advice_requested** | (client) | `HandTestingWidget.tsx` |
| **mulligan_advice_received** | (client) | `HandTestingWidget.tsx` |
| **mulligan_decision** | (keep/mull) | `HandTestingWidget.tsx` |
| **mulligan_advice_requested** (server) | `user_id`, `visitor_id`, `effective_tier`, `placement`, `hand_size`, `mulligan_count`, `action`, `cached` | `app/api/mulligan/advice/route.ts` |
| **chat_sent** | Enriched via `enrichChatEvent`: `thread_id`, `persona`, `prompt_version`, `format`, `commander_name`, `message_id`, `user_message`, `assistant_message` (truncated) | `Chat.tsx` |
| **chat_stream_stop** | Same context + `stopped_by`, `duration_ms`, `tokens_if_known` | `Chat.tsx` |
| **chat_feedback** | Enriched context | `Chat.tsx` |
| **cost_computed** | `currency`, `total`, `usedOwned`, `rows`, `ms` | Collections cost APIs (server) |
| **collection_created** | `collection_id`, `user_id`, `name` | `app/api/collections/create/route.ts` |
| **wishlist_item_added** | `wishlist_id`, `user_id`, `count` | `app/api/wishlists/add/route.ts` |
| **feedback_sent** | `user_id`, `rating` | `app/api/feedback/route.ts` |
| **thread_renamed** / **thread_deleted** | `thread_id`, `user_id` | Chat thread APIs |

Full event taxonomy: `frontend/lib/analytics/events.ts` (`AnalyticsEvents`).

### 1.3 User & Deck Identifiers

- **User:** `user_id` (Supabase auth) when logged in; `visitor_id` (cookie) or `anonymous_fallback_id` for anon. PostHog `identify()` and `alias()` used in `AnalyticsIdentity.tsx` and Header.
- **Deck:** `deck_id` (UUID) included in deck_* and ai_suggestion_* events where applicable.
- **Thread:** `thread_id` on chat events for session grouping.
- **Suggestion:** `suggestion_id` on `ai_suggestion_accepted` (and implied for “shown but not accepted” in PostHog guidance).

### 1.4 Gaps for Behavioral Learning

- **Rejection:** No `ai_suggestion_rejected` event with `suggestion_id`/`card`/`reason`; admin suggestion-stats endpoint describes how to infer rejections in PostHog (shown but not accepted). No DB table for acceptance/rejection.
- **Suggestion content in DB:** Individual suggested card, replaced card, and confidence are not stored in Supabase; only in PostHog as event properties (and only for “accepted” with card/category).

---

## 2. Supabase Database Schema (Relevant Tables)

*Note: Base `decks` and `deck_cards` and `ai_usage` CREATE TABLE may live in Supabase dashboard or an early migration not under `frontend/db/migrations`; the following is inferred from ALTERs and code.*

### 2.1 Decks & Cards

| Table | Purpose | Key columns | Timestamps | Relationships |
|-------|---------|-------------|------------|---------------|
| **decks** | User-owned deck metadata | id, user_id, title, format, plan, colors, currency, deck_text, commander, is_public, meta (JSONB, archetype scores), deck_aim | updated_at (from code) | deck_cards.deck_id, deck_context_summary.deck_id, deck_costs.deck_id |
| **deck_cards** | Cards in a deck | deck_id, name, qty | (none in code) | decks.id |

- **deck_aim:** AI-inferred or user-edited strategy text (e.g. from infer-aim / overview).
- **decks.meta:** Used for archetype scores (aggro, control, combo, midrange, stax) computed on save in `app/api/decks/save/route.ts` via `computeArchetype()`.

### 2.2 AI Usage & Instrumentation

| Table | Purpose | Key columns | Timestamps | Relationships |
|-------|---------|-------------|------------|---------------|
| **ai_usage** | Per-request LLM usage & analytics | user_id, anon_id, thread_id, model, input_tokens, output_tokens, cost_usd, route, pricing_version; prompt_preview, response_preview; model_tier, prompt_path, format_key, deck_size; context_source, summary_tokens_estimate, deck_hash; layer0_mode, layer0_reason, request_kind; has_deck_context, deck_card_count, used_v2_summary, used_two_stage; planner_*, stop_sequences_enabled, max_tokens_config, response_truncated; user_tier, is_guest, deck_id, latency_ms, cache_hit, cache_kind, error_code; prompt_tier, system_prompt_token_estimate, source_page, eval_run_id, source | created_at (implied) | — |

- **Insert:** `lib/ai/log-usage.ts` — `recordAiUsage()`. Used by chat/stream, deck/analyze, swap-why, swap-suggestions, etc.
- **deck_id** and **source_page** allow attributing AI usage to a specific deck and surface (e.g. deck_page_analyze, build_assistant).

### 2.3 Deck Analysis & Context

| Table | Purpose | Key columns | Timestamps | Relationships |
|-------|---------|-------------|------------|---------------|
| **deck_context_summary** | Compact deck summary for LLM context (v2) | deck_id, deck_hash, summary_json (JSONB) | created_at | decks.id |

- **summary_json:** Contains structure from `lib/deck/deck-context-summary.ts`: format, commander, colors, land_count, curve_histogram, ramp/removal/draw counts, archetype_tags, card_names, deck_facts, synergy_diagnostics, etc. Built at request time and cached by (deck_id, deck_hash).

### 2.4 Evaluations / AI Quality

| Table | Purpose | Key columns | Timestamps | Relationships |
|-------|---------|-------------|------------|---------------|
| **ai_eval_sets** | Eval set definitions | (id, name, etc.) | — | ai_eval_set_runs |
| **ai_eval_set_runs** | Runs of eval sets | — | — | ai_usage.eval_run_id |
| **ai_pairwise_results** | Pairwise comparison results | — | — | — |
| **ai_test_mutations** | Mutations for tests | — | — | — |
| **ai_test_schedules** | Test schedules | — | — | — |
| **ai_human_reviews** | Human review records | — | — | — |
| **ai_response_reports** | Response quality reports | — | — | — |
| **ai_prompt_candidates** / **ai_improvement_reports** / **ai_prompt_history** | Auto-improve engine | — | — | — |
| **ai_prompt_change_proposals** / **ai_dynamic_test_cases** | Prompt change tracking | — | — | — |

These support internal AI eval and prompt iteration, not end-user suggestion acceptance.

### 2.5 Mulligan

| Table | Purpose | Key columns | Timestamps | Relationships |
|-------|---------|-------------|------------|---------------|
| **mulligan_advice_runs** | Log of mulligan advice API runs | id, created_at, source (admin_playground \| production_widget), user_id, deck_summary, hand_summary, input_json, output_json, llm_used, model_used, cost_usd, cached, effective_tier, gate_action | created_at | — |

- **Insert:** `lib/mulligan/run-logger.ts` — `logMulliganRun()`. Called from both admin and production mulligan APIs.
- **Production:** Every production mulligan advice request can be logged here (full input/output in JSON), so hand keep rates and curve stability can be derived from this table plus PostHog events.

### 2.6 Price & Meta Trends

| Table | Purpose | Key columns | Timestamps | Relationships |
|-------|---------|-------------|------------|---------------|
| **price_snapshots** | Daily card price history | snapshot_date, name_norm, currency, unit (and user_id in some flows) | — | — |
| **meta_signals** | Cached meta (trending/most-played/budget) | signal_type (PK), data (JSONB) | updated_at | — |
| **commander_aggregates** | Per-commander aggregates | commander_slug, top_cards (JSONB), deck_count, recent_decks (JSONB) | updated_at | — |
| **deck_costs** | Cached deck total cost | deck_id, total_usd | updated_at | decks.id |
| **top_cards** | Top cards cache | — | — | — |

### 2.7 Other

| Table | Purpose | Key columns | Timestamps |
|-------|---------|-------------|------------|
| **request_metrics** | Sampled API metrics (billing forensics) | route, method, status, duration_ms, caller_type, ip_prefix, etc. | ts |
| **pro_gate_events** | Pro gating events | — | — |
| **ops_reports** | Ops report blobs | — | — |
| **admin_audit_log** | Admin actions | — | — |
| **user_attribution** | User attribution | — | — |
| **chat_messages** / **chat_threads** | Chat persistence | — | — |
| **ai_public_cache** / **ai_private_cache** | AI response cache | — | — |
| **scryfall_cache** | Card metadata/images | name (norm), small, normal, type_line, oracle_text, etc. | updated_at |

---

## 3. AI Pipeline Logging

### 3.1 What is logged

- **ai_usage:** Every LLM request (chat, deck/analyze, swap-why, swap-suggestions, mulligan when LLM used) is recorded with:
  - model, tokens, cost_usd, route, prompt_path, format_key, deck_id, source_page, context_source, deck_hash, has_deck_context, used_v2_summary, cache_hit, latency_ms, error_code, etc.
- **Deck analyze:** No separate table for “analysis runs” or “suggestions.” The API returns suggestions in the HTTP response; the same request is logged in ai_usage with route `/api/deck/analyze`, deck_id when available, and source_page.
- **Prompt/compose:** Chat stream logs `ai_prompt_path` to PostHog with prompt_path, formatKey, prompt_version_id, tier, model. ai_usage row has prompt_path, prompt_version_id, format_key, model_tier.
- **Mulligan:** Full request/response logged in `mulligan_advice_runs` (input_json, output_json, llm_used, model_used, cost_usd, cached).

### 3.2 What is not stored in DB

- **Suggested card / replaced card:** Only in API response and in PostHog on accept (ai_suggestion_accepted: card, category). Not in ai_usage or any suggestion table.
- **Confidence score:** Not in DB; if present at all, only in API response shape.
- **User acceptance/rejection:** Only in PostHog (ai_suggestion_accepted). No `ai_suggestion_rejected` event; rejection is inferred from “shown but not accepted” (see admin suggestion-stats).

---

## 4. Deck Structure Data

### 4.1 Stored in DB

- **decks:** title, format, plan, colors, commander, deck_text, deck_aim, meta (archetype scores: aggro, control, combo, midrange, stax).
- **deck_cards:** name, qty per deck.
- **deck_context_summary:** Precomputed summary_json (curve_histogram, land_count, ramp/removal/draw, archetype_tags, card_names, deck_facts, synergy_diagnostics) keyed by deck_id + deck_hash.

### 4.2 Computed at runtime (not stored as columns)

- **Mana curve:** Derived in `lib/deck/deck-context-summary.ts` and in deck/analyze (counts, curveBuckets). Stored only inside deck_context_summary.summary_json and in analyze API response.
- **Card types / tags:** From Scryfall + role tagging (e.g. ramp, removal, draw) in deck-context-summary and analysis-generator; not stored as a separate deck-level table.
- **Synergy labels / health score:** Computed in synergy-diagnostics and deck-facts; appear in summary_json and in analyze response. No dedicated “deck_synergy” or “deck_health” table.
- **Archetype classification:** Stored in decks.meta.archetype (scores). Also in summary_json.archetype_tags.

### 4.3 Cached

- **deck_context_summary:** Cached by (deck_id, deck_hash); regenerated when decklist changes.
- **deck_costs:** Cached total_usd per deck (cron).
- **commander_aggregates / meta_signals / top_cards:** Cached meta (cron).

---

## 5. Time-Based & Historical Data

### 5.1 Cron jobs (vercel.json)

- **cleanup-price-cache** (daily 04:00)
- **deck-costs** (daily 04:30) — refreshes deck_costs
- **commander-aggregates** (daily 05:00)
- **cleanup-guest-sessions** (daily 05:00)
- **meta-signals** (daily 05:15)
- **top-cards** (daily 05:30)
- **cleanup-rate-limits** (weekly Sun 06:00)
- **cleanup-request-metrics** (weekly Sun 06:30)
- **ops-report/daily** (06:00), **ops-report/weekly** (Sun 07:00)
- **shout/auto-generate**, **shout/cleanup**
- **budget-swaps-update** (weekly Sun 03:00)

### 5.2 Historical storage

- **price_snapshots:** Daily snapshots; retention/archive discussed in sql (e.g. 60-day, archive to CSV). Used for price history and movers.
- **Deck snapshots:** No dedicated “deck_snapshots” or “deck_versions” table that stores full decklist per day; deck_versions API uses decks + deck_cards at current state (versions are edit checkpoints, not time-series).
- **Meta trends:** meta_signals and commander_aggregates are overwritten daily (current snapshot), not appended history. So “meta evolution” over time would require either exporting snapshots elsewhere or adding a time-series table.
- **ai_usage:** Kept indefinitely (no cron cleanup in audit); has created_at for time-series of usage/cost.
- **mulligan_advice_runs:** Kept; created_at for time-series of mulligan behavior.
- **request_metrics:** 14-day retention (cleanup_request_metrics).

---

## 6. Mulligan Simulator

- **Logic:** `lib/mulligan/advice-handler.ts`, `lib/mulligan/hand-eval.ts`, `lib/mulligan/deck-profile.ts`, `lib/mulligan/hand-tags.ts`.
- **Probability:** Hand evaluation and tags (e.g. hasRamp, hasInteraction) are computed; LLM or deterministic advice returns KEEP/MULLIGAN with reasons.
- **Logging:**
  - **DB:** `mulligan_advice_runs` — source, user_id, deck_summary, hand_summary, input_json, output_json, llm_used, model_used, cost_usd, cached, effective_tier, gate_action. So simulation runs, hand configuration, and outcome (action, reasons) are stored; keep rate and curve stability can be computed from this table.
  - **PostHog:** mulligan_hand_drawn, mulligan_advice_requested, mulligan_advice_received, mulligan_decision (client); mulligan_advice_requested (server with action, cached).

---

## 7. Summary: What We Have vs What’s Missing

### 7.1 Already in place

- **Behavioral learning (partial):**
  - PostHog: ai_suggestion_shown, ai_suggestion_accepted (with suggestion_id, card, category, deck_id, prompt_version). No DB table; acceptance only.
  - ai_usage: request-level link to deck_id and source_page for deck/analyze and chat.
- **Meta / trends:**
  - meta_signals, commander_aggregates, top_cards (current snapshot); price_snapshots (daily history); deck_costs (current); cron jobs refresh these.
  - ai_usage and mulligan_advice_runs have created_at for time-series.
- **Deck structure / synergy:**
  - decks.meta (archetype scores); deck_context_summary.summary_json (curve, pillars, synergy_diagnostics, deck_facts); computed at runtime and cached by deck_hash.
- **Mulligan:**
  - mulligan_advice_runs stores each run (input/output, action, cached); PostHog has hand/advice/decision events.

### 7.2 Gaps for stated goals

1. **Suggestion acceptance tracking (for AI learning):**
   - No DB table linking suggestion_id → suggested_card, replaced_card, category, confidence, accepted (boolean), deck_id, prompt_version, created_at.
   - Rejection is only inferable from PostHog (shown but not accepted); no explicit reject event or reason.

2. **Meta evolution over time:**
   - meta_signals and commander_aggregates are overwritten daily; no historical series. Either snapshot these into a time-series table or export to warehouse for trend analysis.

3. **Synergy density / health as first-class time-series:**
   - Synergy and “health” exist inside summary_json and API response but are not stored as queryable metrics per deck per day. No deck_snapshots or deck_health_history table.

### 7.3 Tables that can be reused

- **ai_usage:** Already has deck_id, source_page, route, prompt_path, prompt_version_id, format_key, created_at. Good for “which decks get analyzed” and cost attribution; add nothing for per-suggestion acceptance.
- **mulligan_advice_runs:** Already supports keep-rate and curve analysis; no schema change needed for basic mulligan learning.
- **deck_context_summary:** Already has synergy_diagnostics and structure; could add a “summary_snapshot” or “deck_metrics” table that stores key metrics (e.g. synergy score, health score) by deck_id and date if you want historical deck quality trends.
- **price_snapshots:** Already supports price trends; no change needed for meta price evolution.

### 7.4 Recommended minimal schema additions (conceptual; do not implement in this audit)

1. **Suggestion outcomes (for AI learning):**
   - New table, e.g. `ai_suggestion_outcomes`:
     - suggestion_id (UUID), deck_id (FK), run_id (optional, link to ai_usage if desired), suggested_card, replaced_card (nullable), category, prompt_version_id, accepted (boolean), created_at.
   - Populate from backend when user adds a card from a suggestion (and optionally when user explicitly “rejects” if you add that UI and event). Optionally backfill from PostHog for historical acceptance only.

2. **Meta / commander trend history (optional):**
   - Table, e.g. `meta_signals_history` or `commander_aggregates_snapshot`: snapshot_date, signal_type (or commander_slug), data (JSONB), created_at. Append-only; cron writes daily snapshot alongside overwriting the current cache. Enables “meta evolution” queries.

3. **Deck metrics over time (optional):**
   - Table, e.g. `deck_metrics_snapshot`: deck_id, snapshot_date, metrics (JSONB) — e.g. land_count, ramp_count, synergy_score, health_score, archetype_scores. Cron or on-save job can write a row per deck per day. Enables synergy density and deck health trends.

---

**End of audit.** No code or schema changes were made.
