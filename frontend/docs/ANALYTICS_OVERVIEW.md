# Analytics Overview

This document describes what analytics we collect, when we collect it, and how it relates to cookie consent.

---

## 1. Consent Model

- **Storage:** Consent status is stored in `localStorage` under `manatap_cookie_consent` (`accepted` | `declined` | `unknown`). Legacy key `analytics:consent` (`granted`) is also supported.
- **UI:** `CookieConsentModal` blocks interaction until the user chooses **Accept** or **Decline**. On first visit (`unknown`), the modal opens automatically (`CookieConsentContext`).
- **Events:** `manatap:consent-change` and `analytics:consent-granted` / `analytics:consent-revoked` fire on change. PostHog initializes only when consent is **accepted**; it is **reset** when consent is **declined**.

---

## 2. Analytics **Without** Cookie Consent (No PostHog Client)

The following run **regardless of consent**. No PostHog client SDK is loaded; no PH cookies or local storage are used for analytics.

### 2.1 Server-side only (no cookies)

| What | Where | Purpose |
|------|--------|---------|
| **First-visit event** | `middleware.ts` | When no `visitor_id` cookie exists, we set one and send `user_first_visit` to PostHog **server-side** via `captureServer()`. Includes `landing_page`, `referrer`, `user_agent` (truncated), `timestamp`. |
| **Server-side event API** | `POST /api/analytics/track-event` | Generic server-side tracking. Used as **fallback** when client-side PostHog is not used (e.g. consent declined or not yet given). Adds `user_id` from auth when available. |
| **Other server-side events** | Various API routes | e.g. `deck_saved`, `collection_created`, `feedback_sent`, etc. Sent via `captureServer()` in API routes. No consent check. |

### 2.2 Cookies set regardless of consent

| Cookie | Set by | Purpose |
|--------|--------|---------|
| **`visitor_id`** | Middleware | First-visit detection and `user_first_visit` association. Set on first page load, 1-year expiry. |
| **`guest_session_token`** | Middleware | Guest chat session and **guest message limit** (10 messages). HttpOnly, 30-day expiry. Only set when user has no auth cookie. |

These are **functional** (session / rate limiting), not optional marketing analytics, but they do support analytics (e.g. first-visit server-side event).

### 2.3 Client-side tracking without PostHog (fallback)

| What | Where | When |
|------|--------|------|
| **`track()`** | `lib/analytics/track.ts` | UI click/interaction events. **Requires** `analytics_clicks_enabled` (from `/api/config?key=flags`) and **respects DNT** (`navigator.doNotTrack === '1'`). If **consent accepted** and PostHog available → client-side PostHog. Else → **server-side** `POST /api/analytics/track-event`. So without consent we only use the server fallback when clicks tracking is enabled. |

---

## 3. Analytics **With** Cookie Consent (PostHog Client + More)

When the user **accepts** cookies:

1. **PostHog** is initialized (`Providers.tsx`): `posthog.init()` with `capture_pageview: false`, `autocapture: false`, `disable_session_recording: true`, `disable_toolbar: true`.
2. **Web Vitals** (`lib/analytics/webVitals.ts`) are enabled: CLS, FCP, FID, INP, LCP, TTFB → sent as `web_vital_*` events via `capture()`.
3. **Pageviews** are tracked client-side via `AnalyticsProvider` (`$pageview` / `PAGE_VIEW`) on route change.
4. **`capture()`** (`lib/ph.ts`) is used across the app for custom events. It **checks consent**; without it, `capture()` is a no-op. All such events are sent to PostHog when consent is accepted.
5. **`identify()`** is used to associate a `distinctId` (and optional user props) with the PostHog user. Also consent-gated.

### 3.1 Consent-gated client-side flow

- **`capture(event, props, options)`**  
  - Enriches with `getSessionContext()` (e.g. `landing_page`, `referrer`, `utm_*`, `device_type`, `current_path`, `is_authenticated`).  
  - Sends to PostHog only when `hasConsent()` is true.  
  - No-op if consent not granted or PostHog not ready.

- **`identify(distinctId, props)`**  
  - Sets user identity and properties in PostHog.  
  - Consent-gated.

- **`reset()`**  
  - Used on logout or when consent is **declined**; clears PostHog user state.

### 3.2 Event taxonomy (client + server)

Centralized names live in `lib/analytics/events.ts` (`AnalyticsEvents`). Examples:

- **App / session:** `app_open`, `$pageview`, `user_first_visit`
- **Consent:** `consent_choice` (status `accepted` | `declined`, source, path)
- **Auth:** `auth_login_attempt`, `auth_login_success`, `auth_logout_success`, `signup_completed`, etc.
- **Decks:** `deck_created`, `deck_saved`, `deck_updated`, `deck_deleted`, `deck_analyzed`, `deck_import_completed`, etc.
- **Chat:** `chat_sent`, `chat_guest_limit`, `guest_limit_warning_*`, `chat_feedback`, etc.
- **Collections / wishlist / watchlist:** `collection_created`, `collection_deleted`, `wishlist_item_added`, `watchlist_item_added`, etc.
- **Pro funnel:** `pro_gate_viewed`, `pro_gate_clicked`, `pro_upgrade_started`, `pro_upgrade_completed`, `pro_feature_used`, `pro_downgrade`
- **Guests:** `guest_limit_modal_shown`, `guest_limit_signup_clicked`, `guest_limit_sigin_clicked`, `guest_exit_warning_*`, etc.
- **UI:** `ui_click` (area, action, pathname, etc.), `theme_changed`, `content_shared`
- **Performance:** `web_vital_CLS`, `web_vital_LCP`, etc.
- **Workflows:** `workflow.started`, `workflow.step_completed`, `workflow.abandoned`, `workflow.completed`

Many of these are sent via `capture()` (consent-gated) or `useCapture()` (adds auth context). Server-side events use `captureServer()` and do not check consent.

### 3.3 `track()` vs `capture()`

| | **`track()`** | **`capture()`** |
|---|----------------|------------------|
| **Purpose** | UI clicks / interactions | General analytics events |
| **Consent** | Prefers PostHog when consented; else server fallback | PostHog only when consented; else no-op |
| **DNT** | Respected (no send if DNT) | Not explicitly checked |
| **Feature flag** | `analytics_clicks_enabled` required | None |
| **Props** | `area`, `action`, plus pathname, ts, optional user context | Arbitrary; often enriched with session context |

---

## 4. Summary Table

| Layer | Without consent | With consent |
|-------|------------------|--------------|
| **PostHog client** | Not loaded | Loaded, pageviews + custom events |
| **Web Vitals** | Not sent | Sent via `capture()` |
| **`capture()` / `identify()`** | No-op | Send to PostHog |
| **`track()`** | Server fallback only (if clicks enabled + !DNT) | Prefer PostHog; fallback to server on PH failure |
| **Server-side events** | Yes (first visit, track-event fallback, API-owned events) | Same, plus client-driven events when consented |
| **Cookies** | `visitor_id`, `guest_session_token` (functional) | Same; PostHog may set its own when used |

---

## 5. Configuration & Environment

- **PostHog:** `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` (default `/ingest`). Server-side uses `POSTHOG_KEY` or `NEXT_PUBLIC_POSTHOG_KEY` and `POSTHOG_HOST` or `NEXT_PUBLIC_POSTHOG_HOST`.
- **Clicks:** `analytics_clicks_enabled` in `app_config` (key `flags`) gates `track()`.
- **Validation:** `npm run validate-analytics` / `scripts/validate-analytics.ts` checks event names and PRO/workflow taxonomy.

---

## 6. References

- `lib/consent.ts` – consent read/write, `hasConsent()`, `onConsentChange()`
- `lib/ph.ts` – `capture()`, `identify()`, `reset()`, consent check
- `lib/analytics/track.ts` – `track()`, DNT, feature flag, PostHog vs server fallback
- `lib/analytics/events.ts` – `AnalyticsEvents` taxonomy
- `lib/analytics/session-bootstrap.ts` – `getSessionContext()`, landing page, referrer, UTM, device
- `lib/analytics/webVitals.ts` – Web Vitals → `capture()`
- `lib/server/analytics.ts` – `captureServer()`
- `app/api/analytics/track-event/route.ts` – server-side event ingestion
- `components/Providers.tsx` – PostHog init, consent listener, Web Vitals
- `components/CookieConsentModal.tsx` – consent UI, `consent_choice` event
- `components/CookieConsentContext.tsx` – modal state, auto-open when unknown
- `middleware.ts` – `visitor_id`, `user_first_visit`, `guest_session_token`
- `ANALYTICS_IMPLEMENTATION.md` – implementation history and patterns
