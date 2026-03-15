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

## 4. Rollback reference

| Fix | Rollback |
|-----|----------|
| Pricing page | In `app/pricing/page.tsx`, remove the import of `trackProUpgradeStarted` and `setActiveProFeature`, and remove the two lines that call them. |
| Server-side alias | In `auth-event/route.ts`, remove the `aliasServer` import and the `if (visitorId && userId ...)` block. In `lib/server/analytics.ts`, remove the `aliasServer` function. |
| Definitions doc | Delete or revert `docs/POSTHOG_DASHBOARD_DEFINITIONS.md` and any manual PostHog dashboard edits. |

---

## 5. Verification (PostHog)

- **Pro funnel:** In Live Events, go to /pricing (logged in), click upgrade → confirm one `pro_upgrade_started` with pro_feature/source_path; after checkout, confirm `pro_upgrade_completed`. Funnel: count(pro_upgrade_started) ≥ count(pro_upgrade_completed) over time.
- **Identity:** Incognito → land on site (user_first_visit) → sign up in same session → in PostHog, open the person by user_id and confirm they have both user_first_visit and signup_completed (merged).
