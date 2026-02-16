# ManaTap Analytics & Tracking Overview

A reference for understanding what we track, where it goes (PostHog vs our DB), and how it works.

---

## 1. PostHog (Third-Party Product Analytics)

### 1.1 Consent Model

- **Cookie consent required** for client-side PostHog. No PostHog client SDK loads until user accepts cookies.
- **Server-side events** (`captureServer`) run regardless of consent — used for critical business events (signups, conversions, first visit, pageviews).

### 1.2 Client-Side (Requires Consent)

**Init:** `Providers.tsx` — PostHog initializes only after `analytics:consent-granted` event. Deferred 1.5s for performance.

**Helpers:** `lib/ph.ts`
- `capture(event, props)` — sends to PostHog when consented; no-op otherwise
- `identify(distinctId, props)` — associate user with PostHog profile
- `reset()` — clear identity (e.g. on logout or consent revoked)

**Events (examples):**
- `$pageview` — manual pageviews via `AnalyticsProvider`
- `app_open` — once per session when PostHog ready
- `user_first_visit` — from `FirstVisitTracker` (client) when `analytics_first_visit` not in localStorage; includes landing_page, referrer, UTM, user_agent, screen_size
- Chat: `chat_sent`, `chat_stream_stop`, `chat_feedback`, `chat_stream_error`, `guest_limit_warning_*`, `guest_chat_restored`
- Decks: `deck_saved`, `deck_deleted`, `deck_duplicated`, `deck_card_click`, `browse_decks_page_view`, `browse_deck_clicked`
- Profile: `profile_view`, `profile_pricing_cta_clicked`, `profile_avatar_change`
- Pro funnel: `pro_gate_viewed`, `pro_upgrade_started`, `pro_upgrade_completed`
- AI: `ai_suggestion_shown`, `ai_suggestion_accepted`
- Guest: `guest_exit_warning_triggered`, `guest_exit_warning_signup_clicked`
- Web Vitals: `web_vital_cls`, `web_vital_fcp`, etc. (CLS, FCP, FID, INP, LCP, TTFB)

**`track()` vs `capture()`:** `lib/analytics/track.ts` — `track()` prefers PostHog when consented; falls back to `POST /api/analytics/track-event` (server-side) when not. `capture()` is PostHog-only and no-ops without consent.

### 1.3 Server-Side (No Consent Check)

**Helper:** `lib/server/analytics.ts` — `captureServer(event, properties, distinctId)`

**Events:**
- `user_first_visit` — from middleware when no `visitor_id` cookie; includes path, referrer, user_agent, UTM, device_type
- `pageview_server` — every page load (rate-limited per path); includes path, referrer, visitor_id, is_authenticated
- `signup_completed` / `login_completed` — from auth callback via `POST /api/analytics/auth-event`; includes method, provider, source_path, visitor_id
- `deck_saved`, `deck_deleted`, `deck_updated` — from deck API routes
- `collection_created`, `collection_deleted`, `csv_uploaded`, `cost_computed`
- `thread_created`, `thread_renamed`, `thread_deleted`, `thread_linked`, `thread_unlinked`
- `chat_sent`, `ai_prompt_path` — from chat/stream and deck analyze
- `wishlist_item_added`, `watchlist_item_added`, `watchlist_item_removed`
- `profile_share`, `feedback_sent`
- Stripe: `pro_upgrade_completed` (from webhook)

**Distinct ID:** `visitor_id` (anon) or `user_id` (auth). `visitor_id` is set in middleware cookie when missing.

---

## 2. Our Own DB Tracking (Supabase)

### 2.1 First-Touch Attribution (`user_attribution`)

**Purpose:** Answer “What landing page / referrer / UTM led to AI usage?” First-touch only — never overwritten.

**Table:** `user_attribution`
- `anon_id` (text, unique) — hash of `guest_session_token` or `user_id`; matches `ai_usage.anon_id`
- `user_id` (uuid, nullable, unique when not null) — attached when user logs in
- `first_seen_at`, `initial_pathname`, `initial_referrer_domain`
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`

**Capture:** `AnalyticsAttribution.tsx` (client)
- Runs once on first page load
- Checks `localStorage.mt_attribution_recorded` — if set, does nothing
- Captures pathname, referrer domain (hostname only), UTM params
- POSTs to `POST /api/analytics/attribution`
- On 200, sets `mt_attribution_recorded`

**API:** `POST /api/analytics/attribution`
- Derives `anon_id` server-side from `guest_session_token` cookie or auth `user_id` (or `anon_id_fallback` from body)
- Idempotent: if row exists for `anon_id`, returns 200 without updating
- Never overwrites `initial_*` fields

**Admin:** `/admin/attribution` — funnel views: top landing pages, top referrers, repeat usage, commander funnel.

### 2.2 AI Usage (`ai_usage`)

**Purpose:** Cost, model, and feature usage for every AI call (chat, deck analyze, swap-why, swap-suggestions, etc.).

**Table:** `ai_usage`
- `user_id`, `anon_id` — `anon_id` = hash(guest_token) or hash(user_id); joins with `user_attribution`
- `thread_id`, `model`, `input_tokens`, `output_tokens`, `cost_usd`, `route`
- `prompt_preview`, `response_preview`, `model_tier`, `prompt_path`, `format_key`
- `context_source`, `layer0_mode`, `layer0_reason`, `request_kind`
- `has_deck_context`, `deck_card_count`, `source_page` (e.g. deck_page_analyze, homepage)
- `cache_hit`, `cache_kind`, `is_guest`, `deck_id`, `latency_ms`, etc.

**Recording:** `recordAiUsage()` in `lib/ai/log-usage.ts` — called from chat, chat/stream, deck/analyze, swap-why, swap-suggestions.

**Admin:** `/admin/ai-usage` — cost summaries, by model, by route, by day.

### 2.3 Join: Attribution → AI Usage

`user_attribution.anon_id = ai_usage.anon_id` — used for funnel SQL:
- Top landing pages leading to AI usage
- Top referrer domains leading to AI usage
- Repeat usage (users with 2+ AI requests by pathname)
- Commander funnel (pathname LIKE `/commanders/%`)

---

## 3. Identifiers Summary

| Identifier        | Where set                    | Used for                                      |
|------------------|-----------------------------|-----------------------------------------------|
| `visitor_id`     | Middleware cookie           | PostHog distinct_id (anon), pageviews         |
| `guest_session_token` | Middleware (HttpOnly) | Rate limits, guest chat; hashed → `anon_id`   |
| `anon_id`        | Derived server-side         | `user_attribution`, `ai_usage` (joins)         |
| `user_id`        | Supabase Auth               | PostHog distinct_id (auth), ai_usage, attribution |

---

## 4. Key Files

| Purpose                    | File(s)                                                |
|---------------------------|--------------------------------------------------------|
| PostHog client init       | `components/Providers.tsx`                             |
| PostHog capture/identify  | `lib/ph.ts`                                            |
| Server-side PostHog       | `lib/server/analytics.ts`                              |
| Track (PostHog + fallback)| `lib/analytics/track.ts`                               |
| First visit (PostHog)     | `components/FirstVisitTracker.tsx`, `lib/analytics-enhanced.ts` |
| First-touch attribution   | `components/AnalyticsAttribution.tsx`, `api/analytics/attribution/route.ts` |
| AI usage logging          | `lib/ai/log-usage.ts`                                  |
| Middleware (visitor_id, pageviews) | `middleware.ts`                               |

---

## 5. Quick Rules

- **PostHog:** Product analytics, funnels, behavior. Client needs consent; server does not.
- **user_attribution:** First-touch only. Never overwrite. One row per anon_id.
- **ai_usage:** Every AI call. `anon_id` must match attribution for funnel joins.
- **visitor_id:** Anonymous session cookie for PostHog before login.
- **guest_session_token:** HttpOnly; hashed for anon_id. Client never reads it.
