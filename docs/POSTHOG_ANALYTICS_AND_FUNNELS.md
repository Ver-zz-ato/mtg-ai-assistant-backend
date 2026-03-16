# PostHog analytics: full inventory, flows, and recommended funnels

This document lists all analytics events (from code), the main user flows that generate them, and recommended PostHog dashboards/insights and funnels. Use with [POSTHOG_DASHBOARD_DEFINITIONS.md](POSTHOG_DASHBOARD_DEFINITIONS.md) for correct event semantics.

---

## 1. Event inventory (by category)

### 1.1 Acquisition / visit

| Event | Where it fires | Client/Server | Key properties |
|-------|-----------------|---------------|----------------|
| `user_first_visit` | middleware.ts (first request, no visitor_id cookie) | Server | landing_page, referrer, user_agent, device_type, utm_* |
| `pageview_server` | middleware.ts (real HTML nav, rate-limited) | Server | path, referrer, visitor_id, is_authenticated |
| `$pageview` | AnalyticsProvider, usePageAnalytics (route change) | Client | $current_url |
| `app_open` | Providers.tsx (once per session after PostHog ready) | Client | — |
| `seo_landing_view` | SeoLandingAnalytics | Client | slug, etc. |
| `seo_cta_clicked` | SeoLandingAnalytics | Client | slug, cta_id |

### 1.2 Auth / signup / login

| Event | Where it fires | Client/Server | Key properties |
|-------|-----------------|---------------|----------------|
| `signup_completed` | auth-event API (AnalyticsIdentity) | Server | method, provider, source_path, visitor_id, user_id |
| `login_completed` | auth-event API (AnalyticsIdentity) | Server | same |
| `auth_login_success` | auth-event API (when type=login_completed) | Server | same |
| `auth_login_attempt` | Header.tsx (OAuth / email click) | Client | method, provider |
| `auth_login_failed` | Header.tsx | Client | method, provider, error_type |
| `auth_logout_attempt` / `auth_logout_success` / `auth_logout_failed` / `auth_logout_timeout_fallback` | Header.tsx | Client | — |
| `signup_cta_clicked` | Multiple (HomeVariantB, PlaystyleQuizResults, Chat, etc.) | Client | source |

### 1.3 Consent / privacy

| Event | Where it fires | Client/Server | Key properties |
|-------|-----------------|---------------|----------------|
| `consent_choice` | CookieConsentModal, privacy page | Client | choice (accepted/declined) |
| `privacy_learn_more_opened` | PrivacyDataToggle | Client | — |
| `privacy_data_share_toggled` | profile privacy API (server) | Server | — |

### 1.4 Deck (core product)

| Event | Where it fires | Client/Server | Key properties |
|-------|-----------------|---------------|----------------|
| `deck_saved` | app/api/decks/create/route.ts | Server | deck_id, user_id, inserted, format, commander, prompt_version |
| `deck_updated` | app/api/decks/update/route.ts | Server | deck_id, user_id, fields, format, commander |
| `deck_deleted` | app/api/decks/delete/route.ts | Server | deck_id, user_id |
| `deck_created` | DeckSnapshotPanel (client after create) | Client | — |
| `deck_editor_opened` | my-decks/[id]/Client | Client | — |
| `deck_analyze_started` / `deck_analyzed` | DeckSnapshotPanel | Client | — |
| `deck_card_added` / `deck_card_removed` / `deck_card_quantity_changed` / `bulk_delete_cards` | CardsPane | Client | deck_id, card, etc. |
| `deck_import_attempted` / `deck_import_completed` | ImportDeckModal | Client | — |
| `deck_version_saved` / `deck_version_restored` | DeckVersionHistory | Client | deck_id |
| `deck_comment_posted` / `deck_comment_deleted` | DeckComments | Client | deck_id |

### 1.5 Deck browsing

| Event | Where it fires | Client/Server | Key properties |
|-------|-----------------|---------------|----------------|
| `browse_decks_page_view` / `browse_decks_loaded` / `browse_deck_clicked` / `advanced_filters_applied` / `back_to_top_clicked` | decks/browse/page | Client | deck_id, filters |

### 1.6 AI / chat

| Event | Where it fires | Client/Server | Key properties |
|-------|-----------------|---------------|----------------|
| `chat_sent` | app/api/chat/route.ts (every message) | Server | thread_id, user_id, provider, format_key, etc. |
| `chat_sent` | Chat.tsx (client mirror) | Client | enriched via enrichChatEvent |
| `thread_created` | app/api/chat/route.ts (new thread, logged-in only) | Server | thread_id, user_id |
| `thread_deleted` / `thread_renamed` / `thread_linked` / `thread_unlinked` | chat threads API routes | Server | thread_id, user_id |
| `chat_stream_stop` / `chat_stream_fallback` / `chat_stream_error` | Chat.tsx | Client | duration_ms, reason, etc. |
| `chat_guest_limit` / `guest_limit_warning_*` | Chat.tsx | Client | message_count |
| `chat_feedback` | Chat.tsx | Client | rating, etc. |
| `guest_chat_restored` | Chat.tsx | Client | message_count |
| `ai_prompt_path` | app/api/chat/route.ts, stream/route.ts, deck/analyze/route.ts | Server | prompt_path, model (internal telemetry) |

### 1.7 AI suggestions (deck analysis)

| Event | Where it fires | Client/Server | Key properties |
|-------|-----------------|---------------|----------------|
| `ai_suggestion_shown` / `ai_suggestion_accepted` | DeckAnalyzerPanel | Client | suggestion_id, card, category, deck_id, prompt_version |

### 1.8 Pricing / Pro

| Event | Where it fires | Client/Server | Key properties |
|-------|-----------------|---------------|----------------|
| `pricing_page_viewed` | pricing/page.tsx | Client | is_authenticated, is_pro, source |
| `pricing_upgrade_clicked` | pricing/page.tsx + track-event | Client + Server | plan, source: pricing_page |
| `pricing_interval_changed` | pricing/page.tsx | Client | interval |
| `billing_portal_clicked` | pricing/page.tsx | Client | source |
| `pro_gate_viewed` | analytics-pro + track-event | Client + Server | pro_feature, source_path, is_logged_in, is_pro, visitor_id |
| `pro_gate_clicked` | analytics-pro | Client | pro_feature, gate_location |
| `pro_upgrade_started` | analytics-pro + track-event; pricing page (after fix), ProBadge, DeckSnapshotPanel, HandTestingWidget | Client + Server | pro_feature, source_path, workflow_run_id |
| `pro_upgrade_completed` | Stripe webhook (checkout.session.completed, or subscription.updated only when status transitions to active); thank-you page | Server + Client | user_id, source_path (thank_you_page \| stripe_webhook) |
| `pro_badge_upgrade_clicked` | ProBadge | Client | source |
| `pro_feature_awareness` / `pro_feature_cta_clicked` | ProValueTooltip | Client | — |

### 1.9 Collections / wishlist / watchlist

| Event | Where it fires | Client/Server | Key properties |
|-------|-----------------|---------------|----------------|
| `collection_created` / `collection_deleted` | API routes | Server | collection_id, user_id |
| `collection_imported` / `collections.card_click` | CollectionCsvUpload, collections page | Client | — |
| `csv_uploaded` | collections upload-csv API | Server | added, updated, skipped |
| `cost_computed` | collections cost API, cost-to-finish | Server | currency, total, rows, ms |
| `wishlist_page_view` / `wishlist_created` / `wishlist_renamed` / `wishlist_deleted` / `bulk_delete_wishlist_items` | wishlist page, API | Client + Server | wishlist_id, etc. |
| `wishlist_item_added` | API | Server | wishlist_id, user_id, count |
| `watchlist_page_view` / `watchlist_item_added` / `watchlist_item_removed` | watchlist page, API | Client + Server | — |

### 1.10 Profile / sharing / feedback

| Event | Where it fires | Client/Server | Key properties |
|-------|-----------------|---------------|----------------|
| `profile_share` | app/api/profile/share/route.ts | Server | user_id, is_public |
| `profile_view` / `profile_wishlist_save` / `profile_username_change` / `profile_fav_commander_set` / `profile_avatar_change` / `profile_pricing_*` | profile Client | Client | — |
| `feedback_sent` | app/api/feedback/route.ts | Server | user_id, rating |
| `content_shared` | ShareButton | Client | content_type, method |
| `badge_share_action` | BadgeShareBanner | Client | — |

### 1.11 Mulligan / hand testing

| Event | Where it fires | Client/Server | Key properties |
|-------|-----------------|---------------|----------------|
| `mulligan_hand_drawn` / `mulligan_advice_requested` / `mulligan_advice_received` / `mulligan_decision` | HandTestingWidget; mulligan/advice API | Client + Server | — |

### 1.12 Guest / limits / onboarding

| Event | Where it fires | Client/Server | Key properties |
|-------|-----------------|---------------|----------------|
| `guest_limit_modal_shown` / `guest_limit_signup_clicked` / `guest_limit_signin_clicked` | GuestLimitModal | Client | — |
| `guest_exit_warning_triggered` / `guest_exit_warning_signup_clicked` / `guest_exit_warning_left_anyway` / `guest_exit_warning_dismissed_session` | GuestExitWarning | Client | trigger, to |
| `onboarding_started` / `onboarding_step` / `onboarding_completed` / `onboarding_skipped` | analytics-onboarding | Client | step, funnel |
| `onboarding_tour_step` / `onboarding_tour_skipped` / `onboarding_tour_completed` | OnboardingTour | Client | — |
| `time_to_first_value` / `user_return_visit` / `first_feature_use` | analytics-onboarding | Client | — |

### 1.13 Quiz / sample decks / PWA

| Event | Where it fires | Client/Server | Key properties |
|-------|-----------------|---------------|----------------|
| `quiz_started` / `quiz_completed` / `quiz_build_deck_clicked` / `quiz_show_samples_clicked` | PlaystyleQuizModal, PlaystyleQuizResults | Client | — |
| `sample_deck_import_started` / `sample_deck_import_completed` / `sample_deck_import_failed` / `sample_deck_button_clicked` | SampleDeckSelector | Client | deck_id |
| `pwa_install_prompted` / `pwa_install_accepted` / `pwa_install_dismissed` / `app_opened_standalone` | InstallPrompt, PWAProvider | Client | — |
| `ios_pwa_*` | iOSInstallPrompt | Client | visit_count |

### 1.14 Workflow / performance / internal

| Event | Where it fires | Client/Server | Key properties |
|-------|-----------------|---------------|----------------|
| `workflow.started` / `workflow.step_completed` / `workflow.abandoned` / `workflow.completed` | analytics-workflow, workflow-abandon | Client | workflow_name, step |
| `stage_time_research` / `stage_time_answer` / `stage_time_review` | app/api/chat/route.ts | Server | ms, persona_id |
| `api_request` | observability (withMetrics, requestMetrics) | Server | route, etc. |
| `web_vital_*` | webVitals.ts | Client | CLS, FCP, LCP, etc. |

### 1.15 Other UI / nav

| Event | Where it fires | Client/Server | Key properties |
|-------|-----------------|---------------|----------------|
| `nav_link_clicked` | Header | Client | destination, source |
| `theme_changed` | ThemeToggle | Client | theme |
| `shortcut_used` / `shortcuts_help_opened` / `command_palette_opened` | useKeyboardShortcuts | Client | key, action |
| `rate_limit_warning_shown` / `rate_limit_indicator_clicked` | RateLimitIndicator | Client | percent_used |
| `undo_toast_*` | undo-toast | Client | — |

---

## 2. Main user flows (what events fire in order)

### 2.1 Anonymous visitor → first visit

1. Request hits middleware → no visitor_id cookie → set cookie → `user_first_visit` (Server, distinct_id = visitor_id).
2. Same request or next → `pageview_server` (Server, distinct_id = visitor_id).
3. Client loads → consent banner; if user accepts → PostHog init → `app_open` (Client), then `$pageview` on route changes.

### 2.2 Visitor → signup (same browser)

1. Events above (user_first_visit, pageview_server).
2. User signs up (Supabase); client mounts AnalyticsIdentity → POST /api/analytics/auth-event with type=signup_completed, visitor_id from cookie.
3. auth-event: `signup_completed` (Server, distinct_id = user_id); then `aliasServer(visitorId, userId)` so PostHog merges visitor → user.
4. Client: identify(userId), alias(visitorId) (if consent).

### 2.3 Visitor → login (returning)

1. Same as 2.1 for first visit if new device.
2. User logs in → AnalyticsIdentity → POST auth-event with type=login_completed.
3. auth-event: `login_completed` + `auth_login_success` (Server); `aliasServer(visitorId, userId)` if visitor_id present.

### 2.4 User → first chat message

1. User (or guest) sends message → POST /api/chat.
2. If logged-in and no threadId: create thread → `thread_created` (Server). If guest: no thread_created.
3. Every message → `chat_sent` (Server). Client may also fire `chat_sent` (enriched).

### 2.5 User → create deck

1. POST /api/decks/create (e.g. from New Deck, import, quiz).
2. After successful insert → `deck_saved` (Server). Client may fire `deck_created` (e.g. DeckSnapshotPanel).

### 2.6 User → edit deck

1. PATCH/POST /api/decks/update.
2. After successful update → `deck_updated` (Server).

### 2.7 User → upgrade to Pro (pricing page)

1. User on /pricing → `pricing_page_viewed` (Client).
2. User clicks upgrade → `pricing_upgrade_clicked` (Client + Server), then `setActiveProFeature('pricing_page')` + `trackProUpgradeStarted('pricing', ...)` → `pro_upgrade_started` (Client + Server).
3. Redirect to Stripe; user pays; webhook → `pro_upgrade_completed` (Server). Thank-you page may also fire `pro_upgrade_completed` (Client).

### 2.8 User → upgrade from a Pro gate

1. User hits gate (e.g. export analysis, hand testing) → `pro_gate_viewed` (Client + Server).
2. User clicks upgrade → `trackProUpgradeStarted('gate', ...)` → `pro_upgrade_started` (Client + Server).
3. Same as 2.7 step 3 for completion.

---

## 3. Recommended PostHog dashboards and insights

### 3.1 Funnels (create as PostHog Funnel insights)

| Funnel name | Steps (in order) | Filters / notes |
|-------------|------------------|------------------|
| **Acquisition → Signup** | user_first_visit → signup_completed | Filter signup_completed by source = auth_event_api. After alias fix, same person. |
| **Acquisition → Login** | user_first_visit → login_completed | Same; use for returning users. |
| **Signup → First chat** | signup_completed → chat_sent | One chat_sent per user (first) = activation. Filter auth by source = auth_event_api. |
| **Signup → First deck save** | signup_completed → (deck_saved OR deck_updated) | First deck_saved or deck_updated per user = “saved a deck”. |
| **Pro upgrade (full funnel)** | pro_upgrade_started → pro_upgrade_completed | Filter pro_upgrade_completed by LIBRARY = posthog-node to dedupe. Include all source_path for started. |
| **Pricing page → Pro** | pricing_upgrade_clicked → pro_upgrade_completed | Subset of Pro funnel (pricing page only). |

### 3.2 Key metrics (Trend or other insights)

| Metric / insight | Event(s) | Breakdown / filter |
|------------------|----------|---------------------|
| **First visits** | user_first_visit | By day; optional: device_type, landing_page |
| **Signups** | signup_completed | Filter source = auth_event_api; by day |
| **Logins** | login_completed | Filter source = auth_event_api; by day |
| **Chat activity** | chat_sent | By day; unique users; do not use ai_prompt_path |
| **New threads (logged-in)** | thread_created | By day; unique users |
| **Deck creates** | deck_saved | By day; unique users |
| **Deck edits** | deck_updated | By day; unique users |
| **Pro upgrade started** | pro_upgrade_started | By day; by source_path (pricing_page vs gate) |
| **Pro upgrade completed** | pro_upgrade_completed | Filter LIBRARY = posthog-node; by day |
| **Activation: first chat_sent per user** | chat_sent | Count unique users with ≥1 chat_sent in period |

### 3.3 Dashboards to create or update

1. **Activation**
   - Funnel: user_first_visit → signup_completed → chat_sent (first per user).
   - Trends: signup_completed, login_completed, chat_sent (total and unique users), thread_created (unique users).
   - Definition note: “First chat” = first chat_sent per user; thread_created = new thread (logged-in only).

2. **Deck usage**
   - Trends: deck_saved (“Deck created”), deck_updated (“Deck updated”), or combined “Deck saves” (both).
   - Do not use deck_saved alone as “all saves.”

3. **Pro / revenue**
   - Funnel: pro_upgrade_started → pro_upgrade_completed (with LIBRARY filter on completed).
   - Trend: pro_upgrade_started by source_path (pricing_page, header_upgrade, export_deck_analysis, hand_testing, etc.).
   - Trend: pro_upgrade_completed (server-only).

4. **Acquisition**
   - Trends: user_first_visit, pageview_server (optional).
   - Funnel: user_first_visit → signup_completed (rely on alias for same person).

5. **Internal / debug (exclude from main KPIs)**
   - ai_prompt_path: label as “Internal – model routing”; do not use for engagement.
   - api_request: for billing/forensics if needed.

---

## 4. Identity and filters (recap)

- **Auth events:** Always filter `source: auth_event_api` for signup_completed and login_completed so you use server-side only.
- **Pro completed:** Filter `LIBRARY = posthog-node` to avoid double-count (webhook + thank-you page).
- **Visitor merge:** Server-side alias in auth-event links visitor_id to user_id; use “by person” in funnels so merged users count once.

See [POSTHOG_DASHBOARD_DEFINITIONS.md](POSTHOG_DASHBOARD_DEFINITIONS.md) for short definitions and manual checklist.
