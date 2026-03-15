# PostHog Instrumentation Audit — ManaTap

**Date:** 2026-03-15  
**Scope:** Next.js frontend (mtg_ai_assistant/frontend). Audit only; no code changes.  
**Reference:** Operator state report (Mar 15, 2026) — traffic growth, activation issues, possible tracking/product regressions.

---

## SECTION A — Executive diagnosis

**What is probably broken**
- **Pricing → Stripe flow:** `pro_upgrade_started` is **not** fired when the user clicks upgrade on the **pricing page**. It is only fired from gate components (ProBadge, DeckSnapshotPanel, HandTestingWidget). So most conversions (pricing page → checkout) have no “started” event, which explains **pro_upgrade_started < pro_upgrade_completed**.
- **Visitor → signup identity:** `user_first_visit` is server-side with `distinct_id = visitor_id`. Signup/login events are sent with `distinct_id = user_id`. Merge depends on the client calling `alias(visitorId)` after `identify(userId)` in `AnalyticsIdentity`. If the user signs up in a different browser, or before the client has loaded/cookies, the funnel is split across two persons.
- **Geographic breakdown on first visit:** `user_first_visit` is sent from middleware via `captureServer()` with no IP/geo in properties. PostHog may not attach geo to server-side node events the same way as to client events, so the report’s “geographic breakdown missing on user_first_visit” is consistent with the implementation.

**What is probably just tracked badly**
- **deck_saved:** Only fired on **create** (POST `/api/decks/create`), not on update. If the report treats “deck_saved” as “any save”, it undercounts because **deck_updated** is the event for edits. So “deck_saved collapsed” can be a mix of: (1) fewer new-deck creations, or (2) more usage going through “edit existing deck” (only `deck_updated`).
- **thread_created:** Fires only when a **logged-in** user sends a message **without** a `threadId` (new thread). **Guests never** get `thread_created` (they have no persistent thread). So “no new first-time chatters” can mean “no new logged-in users creating a new thread” — a mix of activation and definition (thread_created ≠ “first chat”, it’s “first new thread by a logged-in user”).
- **ai_prompt_path:** Fired on **every** chat request (and deck analyze) as internal model-routing telemetry. High volume vs “real chat activity” is expected; it should not be used as an engagement KPI.

**What metrics can be trusted**
- **login_completed / signup_completed:** Sent server-side via POST `/api/analytics/auth-event` with correct `distinct_id` (user when authenticated). Trust if you filter by `source: auth_event_api`.
- **chat_sent:** Fired server-side on every chat message (guest + auth). Good for “chat activity” volume.
- **pro_upgrade_completed:** Fired server-side from Stripe webhook (and client on thank-you). Reliable for conversions.
- **deck_updated / deck_saved:** Reliable for what they represent: edit vs create.

**What metrics are misleading**
- **thread_created** as “activation”: Excludes guests and counts only “new thread created by logged-in user.”
- **deck_saved** as “deck usage”: Excludes all edits; use **deck_updated** + **deck_saved** together for full picture.
- **ai_prompt_path** as engagement: Internal telemetry; do not use for user engagement.
- **pro_upgrade_started** in funnel: Undercounts because the main path (pricing page) does not fire it.

**Is the report’s overall conclusion fair?**
- Largely yes. The report correctly flags identity/merge risk, pro funnel asymmetry, and activation drops. Some “regressions” are better explained by **event semantics** (deck_saved vs deck_updated, thread_created for new threads only) and **missing instrumentation** (pro_upgrade_started on pricing page) than by a single product regression.

---

## SECTION B — Analytics file inventory

| File path | Role | Client/Server | Notes |
|-----------|------|----------------|-------|
| `frontend/lib/ph.ts` | Helpers | Client | `capture()`, `identify()`, `alias()`, `reset()`, `getDistinctId()`, `getVisitorIdFromCookie()`. Consent-gated; no-op if no consent or PostHog not ready. |
| `frontend/lib/server/analytics.ts` | Server capture | Server | `captureServer(event, properties, distinctId)`. Uses posthog-node; no consent. |
| `frontend/lib/analytics/events.ts` | Event names | Shared | `AnalyticsEvents` constants; no firing. |
| `frontend/lib/analytics/track.ts` | Generic track | Client | `track()` — PostHog or server fallback; respects DNT and flags. |
| `frontend/lib/analytics/capture-buffer.ts` | Debug buffer | Client | `pushCaptureEvent()` for admin debug page. |
| `frontend/lib/analytics/session-bootstrap.ts` | Session context | Client | `getSessionContext()`, landing_page, referrer, UTM, device_type for enrichment. |
| `frontend/lib/analytics/middleware-helpers.ts` | Middleware helpers | Server (Edge) | `isExcludedPath`, `isBot`, `isRealHtmlNavigation`, `getDeviceTypeFromUA`, `getUtmFromUrl`, PV cookies. |
| `frontend/lib/analytics/fallback-id.ts` | Distinct ID | Server | `ensureDistinctId(userId, visitorId, cookies)` — avoids `anon`. |
| `frontend/lib/analytics/webVitals.ts` | Web Vitals | Client | Sends CLS, FCP, LCP, etc. via `capture()` after PostHog ready. |
| `frontend/lib/analytics-pro.ts` | Pro funnel | Client | `trackProGateViewed`, `trackProUpgradeStarted`, `captureProEvent`; also POSTs to track-event for pro_gate_viewed, pro_upgrade_started, pro_upgrade_completed. |
| `frontend/lib/analytics-onboarding.ts` | Onboarding | Client | onboarding_*, funnel_*, time_to_first_value, etc. |
| `frontend/lib/analytics-workflow.ts` | Workflow | Client | workflow.started, step_completed, abandoned, completed. |
| `frontend/lib/analytics/workflow-abandon.ts` | Abandon | Client | workflow.abandoned. |
| `frontend/components/Providers.tsx` | PostHog init | Client | `posthog.init()` after consent (deferred 1.5s); capture_pageview: false, autocapture: false; dispatches `analytics:ready`. |
| `frontend/components/AnalyticsIdentity.tsx` | Identity + auth events | Client | On auth: `identify(userId)`, `alias(visitorId)`; fires POST `/api/analytics/auth-event` (signup_completed / login_completed). On logout: `reset()`, then `identify(visitorId)`. |
| `frontend/components/AnalyticsProvider.tsx` | Pageview on route | Client | `capture(AnalyticsEvents.PAGE_VIEW, { $current_url })` on pathname change. |
| `frontend/app/api/analytics/track-event/route.ts` | Generic server track | Server | POST body: event, properties; uses ensureDistinctId, captureServer; stores pro funnel in pro_gate_events. |
| `frontend/app/api/analytics/auth-event/route.ts` | Auth funnel only | Server | POST body: type (signup_completed \| login_completed), method, provider, source_path, visitor_id; captureServer(type, props, distinctId); also sends auth_login_success for login_completed. |
| `frontend/middleware.ts` | First visit + pageview | Server (Edge) | Sets visitor_id cookie; captureServer('user_first_visit', props, visitorId) on first visit; captureServer('pageview_server', ...) with rate limit. |
| `frontend/app/admin/analytics-debug/page.tsx` | Debug UI | Client | Shows PostHog loaded, recent capture buffer (client-only). |

---

## SECTION C — Event schema from code

Events below are grouped by category. **Active** = fired in current code paths; **Legacy** = in events.ts or docs but not found firing; **Uncertain** = depends on flow.

| Event name | Category | File(s) | Client/Server | Important properties | Status |
|------------|----------|---------|---------------|----------------------|--------|
| user_first_visit | Acquisition | middleware.ts | Server | landing_page, referrer, user_agent, device_type, utm_* | Active |
| pageview_server | Acquisition | middleware.ts | Server | path, referrer, visitor_id, is_authenticated | Active |
| $pageview | Acquisition | AnalyticsProvider, usePageAnalytics | Client | $current_url | Active |
| app_open | Acquisition | Providers.tsx | Client | — | Active |
| signup_completed | Auth | auth-event/route.ts (called by AnalyticsIdentity) | Server | method, provider, source_path, visitor_id, user_id | Active |
| login_completed | Auth | auth-event/route.ts | Server | same as above | Active |
| auth_login_success | Auth | auth-event/route.ts (when type=login_completed) | Server | same | Active |
| auth_login_attempt / auth_login_failed / auth_logout_* | Auth | Header.tsx | Client | method, provider | Active |
| deck_saved | Core (deck) | app/api/decks/create/route.ts | Server | deck_id, user_id, inserted, format, commander, prompt_version | Active |
| deck_updated | Core (deck) | app/api/decks/update/route.ts | Server | deck_id, user_id, fields, format, commander | Active |
| deck_deleted | Core (deck) | app/api/decks/delete/route.ts | Server | deck_id, user_id | Active |
| deck_created | Core (deck) | DeckSnapshotPanel.tsx | Client | — | Active |
| thread_created | AI/Chat | app/api/chat/route.ts | Server | thread_id, user_id (only when created=true; never for guests) | Active |
| chat_sent | AI/Chat | app/api/chat/route.ts | Server | thread_id, user_id, provider, format_key, etc. | Active |
| ai_prompt_path | Internal telemetry | app/api/chat/route.ts, stream/route.ts, deck/analyze/route.ts | Server | prompt_path, model, etc. | Active (internal) |
| pro_gate_viewed | Pricing/Pro | lib/analytics-pro.ts (+ track-event) | Client + Server | pro_feature, source_path, is_logged_in, is_pro, visitor_id | Active |
| pro_upgrade_started | Pricing/Pro | lib/analytics-pro.ts (+ track-event); ProBadge, DeckSnapshotPanel, HandTestingWidget | Client + Server | pro_feature, source_path, workflow_run_id | Active but **not** on pricing page |
| pro_upgrade_completed | Pricing/Pro | Stripe webhook; thank-you page (captureProEvent) | Server + Client | user_id, source_path (thank_you_page \| stripe_webhook) | Active |
| pricing_upgrade_clicked | Pricing/Pro | app/pricing/page.tsx (+ track-event) | Client + Server | plan, source: pricing_page | Active |
| pricing_page_viewed | Pricing/Pro | app/pricing/page.tsx | Client | is_authenticated, is_pro, source | Active |
| profile_share | Sharing | app/api/profile/share/route.ts | Server | user_id, is_public | Active |
| feedback_sent | Feedback | app/api/feedback/route.ts | Server | user_id, rating | Active |
| mulligan_advice_requested | Product | app/api/mulligan/advice/route.ts | Server | — | Active |
| collection_created | Product | app/api/collections/create/route.ts | Server | collection_id, user_id, name | Active |

Other client-only events (sample): consent_choice, theme_changed, nav_link_clicked, deck_card_added, ai_suggestion_accepted, sample_deck_import_completed, guest_exit_warning_*, etc. All require consent and PostHog ready.

---

## SECTION D — Identity audit

**How anonymous-to-auth identity works today**

1. **Anonymous browsing**
   - Middleware sets `visitor_id` cookie (first request, non-bot, real HTML nav).
   - `user_first_visit` and `pageview_server` are sent with `distinctId = visitorId` via `captureServer()` in middleware. No `identify()` on server.

2. **Client after consent**
   - PostHog is initialized in `Providers.tsx` (after consent, deferred 1.5s). Default distinct_id is PostHog-generated (e.g. UUID). The client may set a persistent distinct_id; the app does not set it to visitor_id on load.
   - `AnalyticsIdentity.tsx`: On mount and when `user` appears, it calls `identify(user.id, { $set: { email } })` and then `alias(visitorId)` if visitor_id cookie is present. So **after** login/signup, the same browser’s previous anonymous activity (visitor_id) is aliased to the user. Merge depends on:
     - Same browser (cookie visitor_id).
     - Client running and consent given (so identify + alias run).

3. **Auth events**
   - Signup/login are **not** fired from Supabase callbacks. They are fired from the client: `AnalyticsIdentity` calls `POST /api/analytics/auth-event` with `type: signup_completed | login_completed`, `visitor_id` from cookie, and optional provider/source_path. The API uses `ensureDistinctId(userId, visitorId, cookies)` → distinctId is **user_id** when authenticated. So `signup_completed` and `login_completed` are sent with **user_id** as distinct_id. They do **not** use visitor_id as distinct_id.

4. **Server-side events (e.g. deck_saved, chat_sent)**
   - API routes use `createClient()` and get user from Supabase; they send `user_id` in properties. They do not call `captureServer(..., distinctId)` with a consistent pattern everywhere: e.g. deck create passes no third arg, so `captureServer` uses `properties.user_id` or `properties.visitor_id` or fallback. So server-side events typically have **user_id** when logged in.

5. **user_first_visit vs signup**
   - `user_first_visit` is sent with **visitor_id** as distinct_id (no user yet). Later, when the same person signs up, `signup_completed` is sent with **user_id** as distinct_id. For PostHog to show one person, the **client** must run and call `alias(visitorId)` after `identify(userId)`. If the user never loads the app after signup (e.g. closes tab), or signs up on another device, or clears cookies before signup, the two events stay on two persons. So the report is **correct** that user_first_visit can be disconnected from signup/login identity.

**Answers to specific questions**

1. **Is user_first_visit disconnected from signup/login identity?**  
   Yes, unless the same browser later runs the client and runs `identify(userId)` + `alias(visitorId)`. Cross-device or no-client-load breaks the link.

2. **Can visitor → signup → login funnels be trusted?**  
   Only if you accept that: (a) visitor and signup may be two persons when alias doesn’t run; (b) filtering by `source: auth_event_api` for auth events is correct; (c) dashboard uses “unique users” in a way that accounts for merge (e.g. by person after merge).

3. **Are client and server events attributed to the same person?**  
   When the user is logged in and the client has run: client uses PostHog’s distinct_id (after identify = user_id); server events that send user_id as distinct_id will match. When the user is anonymous: server uses visitor_id; client uses PostHog default until identify. So they can differ until alias is called.

4. **Is there a missing identify/alias call?**  
   Alias is only called when **user** is present and consent is true. So if consent is false, we never identify or alias; server-side auth events still fire with user_id. So we have “identified” events on the server that may never be merged with the same person’s client-side or first-visit events if the client never runs with consent.

5. **Any reset() that could sever identity?**  
   `reset()` is called in `AnalyticsIdentity` when the user logs out (and when consent is declined in Providers). That’s correct. Error boundaries and “Clear data” buttons also call `reset()` — intended.

---

## SECTION E — Regression investigation

### E.1 deck_saved collapse after March 2

- **Where it fires:** Only in `frontend/app/api/decks/create/route.ts` after a successful insert into `decks` and `deck_cards`. One call per request.
- **Trigger:** POST `/api/decks/create` (authenticated). Used by: NewDeckInline, CreateDeckFAB, DeckSnapshotPanel, CommanderBuilderModules, MyDecksList, PlaystyleQuizResults, BuildDeckFromCollectionModal, swap-suggestions Client, DeckGenerationResultsModal, deck/swap-suggestions, new-deck/Client, DeckDeleteButton (restore).
- **Conditions:** User must be authenticated; request body must pass zod parse (title, format, etc.). No feature flag or env guard around the capture.
- **Naming:** Still `deck_saved` in code; no rename.
- **Likely cause:** (1) **Semantic:** Report may be counting “saves” but `deck_saved` is only “new deck created.” Edits go through POST `/api/decks/update` and fire **deck_updated**, not deck_saved. If more users duplicate then edit, or edit more than create, deck_saved would drop. (2) **Traffic:** Fewer new-deck creations (e.g. more returning users editing). (3) **Product change:** If a major entry point (e.g. “new deck” from builder or quiz) was changed to “update” or a different flow, that could reduce create calls.
- **Evidence:** Single code path; no second fire of deck_saved elsewhere. deck_updated is the only other save-related event and is in update route.
- **Confidence:** High that the event is still active; high that “collapse” can be explained by definition (create vs update) and/or traffic mix.

### E.2 No new first-time chatters since March 8

- **Where thread_created fires:** `frontend/app/api/chat/route.ts`: `if (created) await captureServer("thread_created", { thread_id: tid, user_id: userId })`. So only when `created === true`.
- **When is created true?** When the user is **not** a guest and did **not** send a `threadId`; the code then creates a new row in `chat_threads` and sets `created = true`. **Guests:** `tid = null`, `created = false` — so **thread_created never fires for guests**.
- **chat_sent:** Fires for every message (guest and auth) later in the same route. So “chat activity” is tracked by chat_sent; “first-time new thread” is tracked by thread_created (logged-in only).
- **Likely cause:** (1) **Definition:** “First-time chatters” in the report may be “users who triggered thread_created.” That excludes all guests and only counts logged-in users who start a **new** thread (no threadId). (2) **Activation:** If new signups don’t reach chat, or only use guest chat, thread_created would stay flat. (3) **Gate/UX:** If new users hit a gate (e.g. sign-in wall) before sending a message and never sign in, they’d never create a thread.
- **Evidence:** Code clearly ties thread_created to new-thread creation for non-guest users only; chat_sent is separate and fires for everyone.
- **Confidence:** High that “no new first-time chatters” is consistent with “no new logged-in users creating a new thread” and/or heavy guest usage.

### E.3 pro_upgrade_started < pro_upgrade_completed

- **Where pro_upgrade_started fires:** `trackProUpgradeStarted()` in `lib/analytics-pro.ts`, which calls `captureProEvent('pro_upgrade_started', ...)`. That does client `capture()` and, because it’s in PRO_EVENTS_ALSO_SERVER, also `fetch('/api/analytics/track-event', { event: 'pro_upgrade_started', ... })`. So both client and server get it when the function is called.
- **Where trackProUpgradeStarted is called:** ProBadge (header), DeckSnapshotPanel (export deck analysis), HandTestingWidget (mulligan), admin seed, dev test panel. **Not** called from the pricing page.
- **Pricing page:** `app/pricing/page.tsx` `handleUpgradeClick` does: `capture('pricing_upgrade_clicked', ...)`, POST to track-event for `pricing_upgrade_clicked`, then redirect to Stripe. So the main conversion path (pricing → Stripe) emits **pricing_upgrade_clicked** but **not** pro_upgrade_started.
- **pro_upgrade_completed:** Fired from Stripe webhook (checkout.session.completed and subscription.updated) and from thank-you page after sync. So every conversion is counted at least once (often twice: webhook + thank-you).
- **Likely cause:** Most users go to /pricing and click upgrade; that path never calls `trackProUpgradeStarted`. So started is undercounted; completed is not. Hence started < completed.
- **Evidence:** Grep and reading of pricing page and analytics-pro.ts.
- **Confidence:** High.

### E.4 login_completed → thread_created drop (87%)

- **Where thread_created fires:** As above — only when a logged-in user creates a new thread (no threadId).
- **Funnel meaning:** “Login” is a one-time (or per-session) event; “thread_created” is “started a new conversation.” So the drop is “many who log in never start a new thread.” That can be: (1) They only use existing threads. (2) They use chat as guest first and never create a thread after login. (3) They use other product areas (decks, browse) and don’t chat. (4) thread_created is a strict proxy for “first meaningful chat” and is expected to be lower than login.
- **Is thread_created a bad proxy for activation?** It’s a strict proxy: “first new thread by a logged-in user.” Broader “activation” might be better measured with chat_sent (any message) or “first chat_sent per user.” So the report’s 87% drop is likely real and partly by definition; whether it’s “broken” depends on whether you want to optimize for “new thread” or “any chat.”
- **Confidence:** High that the funnel is correct; medium that the “problem” is definition vs product.

---

## SECTION F — Report query mismatches or misleading metrics

1. **ai_prompt_path**  
   Used as if it were user engagement. In code it’s internal model-routing telemetry (every chat and deck analyze request). High volume is expected. **Do not** use for activation or engagement KPIs.

2. **thread_created**  
   Treated as “first-time chat” or “activation.” In code it’s “new thread created by a logged-in user.” Guests never trigger it. Use **chat_sent** (and/or first chat_sent per user) for “chat activity” and “first chat.”

3. **deck_saved**  
   Treated as “deck save” or “deck usage.” In code it’s only “new deck created” (POST create). Edits are **deck_updated**. For “all saves” use deck_saved + deck_updated and label clearly.

4. **pro_upgrade_started**  
   Used in funnel with pro_upgrade_completed. The main path (pricing page) does not emit started, so the funnel undercounts “started” and overstates the drop from started to completed. Prefer **pricing_upgrade_clicked** for “clicked upgrade (pricing)” or add pro_upgrade_started on the pricing page.

5. **user_first_visit**  
   Used for geographic or device breakdown. It’s server-side only; no IP/geo is attached in the code. If PostHog doesn’t enrich server events with geo the same way, geographic breakdown will be missing or different from client events.

6. **signup_completed / login_completed**  
   If the report filters by “PostHog library” or “client,” these are sent from the **server** (auth-event API). Filter by `source: auth_event_api` or event name; don’t assume they’re client-only.

7. **Events that might be legacy or rare**  
   Many names in `AnalyticsEvents` (e.g. deck_import_modal_opened, workflow.step_completed) may be defined but fired from few places. Validate in code or live events before building critical dashboards.

---

## SECTION G — Priority fixes

### P0 — Urgent

1. **Fire pro_upgrade_started on pricing page**  
   - **Why:** Funnel “started → completed” is wrong because the main path doesn’t fire “started.”  
   - **Where:** `frontend/app/pricing/page.tsx` in `handleUpgradeClick`, before `fetch('/api/billing/create-checkout-session', ...)`.  
   - **What:** Call `trackProUpgradeStarted('pricing', { feature: 'pricing_page', location: 'pricing_page' })` (and optionally `setActiveProFeature('pricing_page')` so thank-you can attribute).  
   - **Verify:** In PostHog live events, click upgrade on /pricing and confirm one pro_upgrade_started and later one pro_upgrade_completed; filter by LIBRARY=posthog-node to avoid double-count.

2. **Clarify deck_saved vs deck_updated in reporting**  
   - **Why:** “deck_saved collapsed” may be misinterpreted as “saves broken” when it only means “new deck creates.”  
   - **What:** In dashboards, use “Deck created” (deck_saved) and “Deck updated” (deck_updated) separately, or a combined “Deck save (create or update)” = deck_saved + deck_updated.  
   - **No code change required** if you only fix the report; optionally add a single server event “deck_save” for both create and update if you want one metric.

### P1 — Important

3. **Improve identity merge for visitor → signup**  
   - **Why:** user_first_visit and signup_completed can be two persons if alias never runs (different device, no consent, tab closed).  
   - **Where:** Keep current client identify/alias; add server-side alias if PostHog API supports it when we send signup_completed (e.g. send an alias from auth-event route so server can link visitor_id to user_id). Alternatively document that funnel is “same-browser + consent” and add a dashboard filter for “has alias” or “same device.”  
   - **Verify:** In PostHog, one person with both user_first_visit and signup_completed when signing up in same browser with consent.

4. **Add geo/device to user_first_visit if needed**  
   - **Why:** Report says geographic breakdown is missing on user_first_visit.  
   - **Where:** `frontend/middleware.ts` where firstVisitProps is built. If PostHog doesn’t auto-enrich server events, add IP (from request headers, e.g. x-forwarded-for) to properties so PostHog can geo-enrich, or add a server-side geo lookup and put country/region in properties.  
   - **Verify:** In PostHog, user_first_visit events have country or equivalent.

5. **Define “first-time chatter” in reporting**  
   - **Why:** “No new first-time chatters” depends on definition. thread_created excludes guests.  
   - **What:** Either: (a) Define “first-time chatter” as “first thread_created per user” (logged-in only) and document it, or (b) Add a derived metric “first chat_sent per user” (including guests) and use that for activation.  
   - **Verify:** Dashboard and report use the chosen definition consistently.

### P2 — Cleanup

6. **Rename or document ai_prompt_path**  
   - In docs and any internal dashboards, label ai_prompt_path as “internal / model routing” and exclude from user engagement views.

7. **Consistent distinct_id for server events**  
   - Audit all captureServer() calls: ensure they pass distinctId (user_id when auth, visitor_id when anon) so all server events merge to the same person when possible. Today most use properties.user_id / visitor_id; fallback in captureServer uses those, but explicit passing is clearer.

8. **Optional: Single “deck_save” event**  
   - If you want one “save” metric, have both create and update routes send a shared event (e.g. deck_save with is_new: true/false) in addition to deck_saved and deck_updated, and use that for a single KPI.

---

## SECTION H — Manual verification script (QA checklist)

Use incognito and a new account; watch PostHog live events (filter by your test user or visitor_id).

**1. Anonymous visitor → SEO/content page**
- [ ] Open incognito; go to e.g. /blog or a content page.
- [ ] In PostHog: one `user_first_visit` (distinct_id = visitor_...) and one `pageview_server` for that path.
- [ ] Accept cookies; confirm PostHog loads (e.g. admin analytics-debug page shows “PostHog loaded”).
- [ ] Navigate; confirm client `$pageview` (or PAGE_VIEW) with $current_url.

**2. Visitor signs up**
- [ ] From same incognito window, click sign up and complete signup (email or OAuth).
- [ ] In PostHog: one `signup_completed` (or `login_completed` if OAuth) with distinct_id = user UUID; properties should include source_path, visitor_id.
- [ ] Same person (after merge) should have both user_first_visit and signup_completed if alias ran (check person profile).

**3. User logs in (returning)**
- [ ] Log out; log back in (same or new session).
- [ ] In PostHog: one `login_completed` and one `auth_login_success` with distinct_id = user UUID.

**4. First meaningful AI/deck interaction**
- [ ] Open chat; send a message **without** an existing thread (new conversation).
- [ ] In PostHog: one `thread_created` (thread_id, user_id) and one `chat_sent`.
- [ ] Send another message in same thread: only `chat_sent`, no second thread_created.
- [ ] (Optional) Use chat as guest: confirm `chat_sent` and **no** thread_created.

**5. User saves a deck**
- [ ] Create a new deck (e.g. “New deck” or import then save as new).
- [ ] In PostHog: one `deck_saved` (deck_id, user_id).
- [ ] Edit the same deck (e.g. change title or add card); confirm one `deck_updated`, no second deck_saved.

**6. User upgrades to Pro**
- [ ] Go to /pricing; click upgrade (monthly or yearly).
- [ ] **Before fix:** In PostHog you should see `pricing_upgrade_clicked` and possibly **no** pro_upgrade_started. **After P0 fix:** one `pro_upgrade_started` then redirect to Stripe.
- [ ] Complete checkout (Stripe test card); return to thank-you.
- [ ] In PostHog: at least one `pro_upgrade_completed` (from webhook and/or thank-you page; filter LIBRARY=posthog-node to dedupe if needed).

**7. Pro funnel from a gate**
- [ ] While not Pro, trigger a Pro gate (e.g. export deck analysis or hand testing).
- [ ] In PostHog: one `pro_gate_viewed`.
- [ ] Click upgrade from that gate.
- [ ] In PostHog: one `pro_upgrade_started` (pro_feature set). Then complete checkout and confirm `pro_upgrade_completed`.

**8. Identity**
- [ ] In one incognito session: first visit → sign up → use chat. In PostHog, open the person profile: should show user_first_visit, signup_completed, thread_created, chat_sent under one person (if alias ran).
- [ ] If possible, test from a second device with same account: login_completed and chat_sent should be under the same person; user_first_visit from device 2 may be a different person unless you add server-side alias.

---

## Likely regression-inducing code changes (from structure and git context)

Git history was inspected for frontend/app/api/decks/create, frontend/app/api/chat/route.ts, middleware, AnalyticsIdentity, pricing, analytics-pro. No commit was found that clearly removes or renames deck_saved or thread_created in the March 2 / March 8 window. The following are **inferred from current code** and may explain report findings:

| Area | What could have changed | Why it could explain the report | Confidence |
|------|-------------------------|----------------------------------|------------|
| Deck creation vs update | More flows might call “update” or “duplicate then edit” instead of “create.” | Fewer POSTs to /api/decks/create → fewer deck_saved. | Medium |
| Pricing page | pricing_upgrade_clicked was always there; trackProUpgradeStarted was never added on this page. | pro_upgrade_started has always been undercounted on the main path. | High |
| Chat / thread_created | thread_created only for new thread by logged-in user; guests never. | “First-time chatters” (if defined as thread_created) can stay flat if traffic is guest-heavy or new signups don’t start new threads. | High |
| Identity | Auth events and first_visit use different distinct_ids; merge depends on client alias. | Visitor → signup funnel can look broken when alias doesn’t run (different device, no consent, tab closed). | High |

No specific “deleted capture” or “renamed event” was found in the inspected files for the regression windows; the issues above are semantic and path-coverage related.

---

*End of audit. No code was modified; findings and fixes are recommendations only.*
