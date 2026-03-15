# PostHog fixes applied (audit follow-up)

**Date:** 2026-03-15  
**Context:** Follow-up to [POSTHOG_INSTRUMENTATION_AUDIT.md](POSTHOG_INSTRUMENTATION_AUDIT.md) and the minimal safe-fix plan. This document records exactly what was changed in code and docs.

---

## 1. Fix 1 — Pricing funnel: fire `pro_upgrade_started` on pricing page

**Problem:** The main conversion path (user goes to /pricing and clicks upgrade) did not fire `pro_upgrade_started`. Only gate components (ProBadge, DeckSnapshotPanel, HandTestingWidget) called `trackProUpgradeStarted`, so the funnel showed pro_upgrade_started &lt; pro_upgrade_completed.

**Files changed**

- `frontend/app/pricing/page.tsx`

**Exact changes**

1. **Import added** (after existing analytics imports):
   ```ts
   import { trackProUpgradeStarted, setActiveProFeature } from '@/lib/analytics-pro';
   ```

2. **Logic added** in `handleUpgradeClick`, after the existing block that:
   - calls `capture('pricing_upgrade_clicked', ...)`
   - POSTs to `/api/analytics/track-event` for `pricing_upgrade_clicked`
   - calls `track('ui_click', ...)`
   and **before** `setUpgrading(true)`:
   ```ts
   // Pro funnel: started (so funnel started ≥ completed)
   setActiveProFeature('pricing_page');
   trackProUpgradeStarted('pricing', { feature: 'pricing_page', location: 'pricing_page' });
   ```

**Result:** Every upgrade click from the pricing page now emits `pro_upgrade_started` (client + server via track-event), so the Pro funnel “started” step includes the main path. Thank-you page and Stripe webhook continue to emit `pro_upgrade_completed`.

---

## 2. Fix 3 — Visitor → signup identity merge (server-side alias)

**Problem:** `user_first_visit` is sent with distinct_id = visitor_id (middleware). Signup/login events are sent with distinct_id = user_id (auth-event API). Merge only happened when the client ran and called `identify(userId)` then `alias(visitorId)`. If the user closed the tab before the client ran, or had no consent, visitor and signup stayed as two persons in PostHog.

**Files changed**

- `frontend/lib/server/analytics.ts`
- `frontend/app/api/analytics/auth-event/route.ts`

**Exact changes**

1. **`frontend/lib/server/analytics.ts`**
   - Added `aliasServer(previousDistinctId: string, distinctId: string): Promise<void>`.
   - Uses the same lazy-initialized PostHog instance as `captureServer`.
   - No-op if either id is missing or if `previousDistinctId === distinctId`.
   - Calls `ph.alias({ distinctId, alias: previousDistinctId })` (PostHog Node SDK) so the person previously identified by `previousDistinctId` (visitor_id) is merged into the person identified by `distinctId` (user_id).
   - Inserted **before** the existing `shutdownAnalytics` function.

2. **`frontend/app/api/analytics/auth-event/route.ts`**
   - Import: added `aliasServer` from `@/lib/server/analytics`.
   - After `captureServer(type, props, distinctId)` and the optional `captureServer('auth_login_success', ...)` block, added:
     ```ts
     if (visitorId && userId && visitorId !== userId) {
       try {
         await aliasServer(visitorId, userId);
       } catch {}
     }
     ```

**Result:** When signup_completed or login_completed is sent and the request includes a visitor_id cookie (and we have userId from Supabase), the server sends an alias so PostHog merges the visitor person into the user person. The visitor → signup funnel can be one person even when the client never runs.

---

## 3. Fix 2, 4, 5 — Definitions doc and process (no code)

**Files created**

- `docs/POSTHOG_DASHBOARD_DEFINITIONS.md`

**Content summary**

- **Pro funnel:** Started = `pro_upgrade_started` (now includes pricing page); Completed = `pro_upgrade_completed`; filter LIBRARY = posthog-node to dedupe.
- **Deck:** `deck_saved` = create only; `deck_updated` = edit only; “total saves” = both.
- **Chat/activation:** `chat_sent` = all messages (use for activity and first chat); `thread_created` = new thread by logged-in user only; do not use `ai_prompt_path` for engagement.
- **Identity:** Auth events filter `source: auth_event_api`; visitor → signup merge via server-side alias.
- **Manual dashboard checklist:** What to add/relabel in PostHog UI.
- **Re-run operator report:** Steps to deploy, re-run the report, apply definitions, and evaluate activation.

**Result:** Single source of truth for event semantics and recommended dashboard setup; operator report and activation evaluation can use consistent definitions.

---

## 4. Fix 5 — GeoIP enrichment on server events

**Problem:** user_first_visit and pageview_server (and other server-side events) had no client IP, so PostHog could not run GeoIP enrichment ($geoip_country_name etc.).

**Files changed**

- `frontend/lib/server/analytics.ts` — captureServer() now accepts optional 4th argument `options?: CaptureServerOptions` with `{ ip?: string }`. When set, we add `$ip` to the event properties so PostHog can enrich.
- `frontend/middleware.ts` — Read client IP from `x-forwarded-for` (first entry) or `x-real-ip`, pass to captureServer for `user_first_visit` and `pageview_server`.
- `frontend/app/api/analytics/auth-event/route.ts` — Use `extractIP(req)` from guest-tracking, pass to captureServer for signup_completed / login_completed / auth_login_success when IP is not `'unknown'`.
- `frontend/app/api/analytics/track-event/route.ts` — Same: extractIP(req), pass to captureServer when not `'unknown'`.

**Result:** Server-side events that go through middleware or the two analytics API routes now send `$ip` when the request includes a real client IP. PostHog can populate $geoip_* properties. Other API routes that call captureServer() directly (e.g. chat, decks, stripe webhook) do not pass IP unless we add it at those call sites; the main attribution events (first visit, pageview, auth, track-event) are covered.

---

## 5. Rollback reference

| Fix | Rollback |
|-----|----------|
| Pricing page | In `app/pricing/page.tsx`, remove the import of `trackProUpgradeStarted` and `setActiveProFeature`, and remove the two lines that call them. |
| Server-side alias | In `auth-event/route.ts`, remove the `aliasServer` import and the `if (visitorId && userId ...)` block. In `lib/server/analytics.ts`, remove the `aliasServer` function. |
| GeoIP (captureServer IP) | In `lib/server/analytics.ts`, remove the 4th param and `$ip` logic. In middleware, remove `clientIp` and the 4th arg to captureServer. In auth-event and track-event, remove extractIP and ipOpt. |
| Definitions doc | Delete or revert `docs/POSTHOG_DASHBOARD_DEFINITIONS.md` and any manual PostHog dashboard edits. |

---

## 6. Section F (report priority) — what we fixed vs what remains

| # | Item | Fixed? | Notes |
|---|------|--------|--------|
| **1** | **deck_saved collapse since March 2** | **No** | We did not change deck_saved instrumentation. Audit found: deck_saved fires only on **create** (POST /api/decks/create); deck_updated fires on edit. So “collapse” may be fewer new-deck creations, not a missing event. We documented semantics (deck_saved = create, deck_updated = edit) and that “total saves” = both. **Next step:** Confirm in UI that deck creation still works; if it does, use deck_saved + deck_updated in Health – Core event collapse. If deck creation is broken, fix product, not analytics. |
| **2** | **Zero new first-time chatters since March 8** | **No** | We did not change chat_sent or thread_created. We documented: thread_created = new thread by **logged-in** user only (guests never); chat_sent = all messages. So “first-time chatter” should be measured as “first chat_sent per user” in Activation. **Next step:** Use chat_sent for “First chat per user over time”; if still zero new users, the issue is product/UX (signup friction, gate, session), not tracking. |
| **3** | **pro_upgrade_started tracking broken** | **Yes** | We added `setActiveProFeature('pricing_page')` and `trackProUpgradeStarted('pricing', ...)` on the pricing page so the main path (pricing → Stripe) now fires pro_upgrade_started. Confirm with Health – Pro funnel sanity (started ≥ completed). |
| **4** | **Referrer not captured on server events** | **Already present** | Middleware already reads `req.headers.get('referer')` and sends it as `referrer` in user_first_visit and pageview_server (see middleware.ts). If 74% show referrer = None, that is likely clients not sending the Referer header (direct navigation, Referrer-Policy, or bots). No code change made. |
| **5** | **GeoIP not enriched on server events** | **Yes** | captureServer() now accepts optional `options?: { ip?: string }`. Middleware passes client IP (x-forwarded-for / x-real-ip) for user_first_visit and pageview_server. auth-event and track-event pass client IP when available. PostHog receives `$ip` and can run GeoIP enrichment ($geoip_country_name etc.). |
| **6** | **Signup decline trend** | **Indirect** | No signup-event change. We added server-side alias so visitor→signup funnel merges correctly; that improves measurement. The decline itself is product/UX (landing pages, CTA, form). **Next step:** Cross-reference visitor→signup funnel in Dashboard 2; investigate SEO/landing pages and signup CTA. |
| **7** | **Retention structurally poor** | **Monitor** | No fix; prioritize after deck_saved/activation clarity. |
| **8** | **Dec–Jan bot contamination** | **Monitor** | No fix; be cautious with historical cohorts. |
| **9** | **Delete duplicate dashboard** | **Manual** | Archive duplicate “analytics health” (507257) in PostHog UI. |

---

## 7. Verification (PostHog)

- **Pro funnel:** In Live Events, go to /pricing (logged in), click upgrade → confirm one `pro_upgrade_started` with pro_feature/source_path; after checkout, confirm `pro_upgrade_completed`. Funnel: count(pro_upgrade_started) ≥ count(pro_upgrade_completed) over time.
- **Identity:** Incognito → land on site (user_first_visit) → sign up in same session → in PostHog, open the person by user_id and confirm they have both user_first_visit and signup_completed (merged).
- **GeoIP:** After deploy, trigger a first visit or pageview (or signup) and in PostHog check the event properties for `$ip` and enriched `$geoip_country_name` (if PostHog project has GeoIP enabled).
