# PostHog Analytics Architecture - Target Design

## Overview

This document defines the **target architecture** for PostHog analytics in the ManaTap codebase, based on the discovery findings from STEP 1.

**Goal**: Single initialization point, unified pageview tracking, centralized event names, and no duplicate events.

---

## 1. Client Initialization - Single Source of Truth

### ✅ KEEP: `frontend/components/Providers.tsx`

**Status**: This is the **ONLY** file that should call `posthog.init()`.

**Responsibilities**:
- Initialize PostHog with consent check
- Handle consent changes (re-init/reset)
- Send `app_open` event (once per session)
- Configure PostHog settings:
  - `capture_pageview: false` (we track manually)
  - `autocapture: false`
  - `disable_toolbar: true`
  - `disable_session_recording: true`

**No changes needed** - already correct.

### ❌ DELETE: `frontend/components/PosthogInit.tsx`

**Reason**: Unused duplicate initialization component.

### ✅ VERIFY: `frontend/instrumentation-client.ts`

**Status**: Already safe - exports posthog but never initializes it.

**Action**: No changes needed.

### ❌ DELETE: `frontend/lib/analytics.ts`

**Reason**: Legacy file with unused `initAnalytics()` function.

**Action**: Delete entire file (unused).

---

## 2. Pageview Tracking - Unified Mechanism

### ✅ REFACTOR: `frontend/components/AnalyticsProvider.tsx`

**Current Issues**:
- Uses `posthog.capture('$pageview')` directly
- Should use centralized `capture()` helper
- Should use event name constant

**Target Implementation**:
```typescript
'use client';
import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { capture } from '@/lib/ph';
import { AnalyticsEvents } from '@/lib/analytics/events';

function AnalyticsInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  useEffect(() => {
    const href = typeof window !== 'undefined' ? window.location.href : (pathname || '/');
    capture(AnalyticsEvents.PAGE_VIEW, { $current_url: href });
  }, [pathname, searchParams?.toString()]);
  
  return null;
}

export default function AnalyticsProvider() {
  return (
    <Suspense fallback={null}>
      <AnalyticsInner />
    </Suspense>
  );
}
```

**Changes**:
- Replace `posthog.capture()` with `capture()` from `lib/ph.ts`
- Use `AnalyticsEvents.PAGE_VIEW` constant instead of `'$pageview'` string

### ❌ DELETE: `frontend/components/PostHogRouteTracker.tsx`

**Reason**: Unused duplicate pageview tracker.

---

## 3. Centralized Event Names

### ✅ CREATE: `frontend/lib/analytics/events.ts`

**Purpose**: Single source of truth for all PostHog event names.

**Structure**:
```typescript
/**
 * Centralized PostHog event names
 * 
 * All event names used in the application should be defined here.
 * This ensures consistency and prevents typos.
 * 
 * Usage:
 *   import { AnalyticsEvents } from '@/lib/analytics/events';
 *   capture(AnalyticsEvents.APP_OPEN);
 */

export const AnalyticsEvents = {
  // Core app events
  APP_OPEN: 'app_open',
  PAGE_VIEW: '$pageview',
  USER_FIRST_VISIT: 'user_first_visit',
  
  // Consent & privacy
  CONSENT_CHOICE: 'consent_choice',
  
  // Authentication
  AUTH_LOGIN_ATTEMPT: 'auth_login_attempt',
  AUTH_LOGIN_SUCCESS: 'auth_login_success',
  AUTH_LOGIN_FAILED: 'auth_login_failed',
  AUTH_LOGOUT_ATTEMPT: 'auth_logout_attempt',
  AUTH_LOGOUT_SUCCESS: 'auth_logout_success',
  AUTH_LOGOUT_FAILED: 'auth_logout_failed',
  AUTH_LOGOUT_TIMEOUT_FALLBACK: 'auth_logout_timeout_fallback',
  
  // Email verification
  EMAIL_VERIFICATION_REMINDER_SHOWN: 'email_verification_reminder_shown',
  EMAIL_VERIFICATION_RESENT: 'email_verification_resent',
  EMAIL_VERIFICATION_RESENT_ON_LOGIN: 'email_verification_resent_on_login',
  EMAIL_VERIFICATION_RESENT_FROM_PROFILE: 'email_verification_resent_from_profile',
  EMAIL_VERIFICATION_RESEND_FAILED: 'email_verification_resend_failed',
  EMAIL_VERIFICATION_REMINDER_DISMISSED: 'email_verification_reminder_dismissed',
  EMAIL_VERIFIED_SUCCESS: 'email_verified_success',
  EMAIL_VERIFICATION_POPUP_DISMISSED: 'email_verification_popup_dismissed',
  EMAIL_VERIFICATION_RESENT_ON_SIGNUP: 'email_verification_resent_on_signup',
  
  // Deck events
  DECK_SAVED: 'deck_saved',
  DECK_UPDATED: 'deck_updated',
  DECK_DELETED: 'deck_deleted',
  DECK_CREATED: 'deck_created',
  DECK_ANALYZED: 'deck_analyzed',
  DECK_IMPORTED: 'deck_imported',
  DECK_IMPORT_ATTEMPTED: 'deck_import_attempted',
  DECK_IMPORT_COMPLETED: 'deck_import_completed',
  DECK_IMPORT_MODAL_OPENED: 'deck_import_modal_opened',
  DECK_EDITOR_OPENED: 'deck_editor_opened',
  DECK_CARD_ADDED: 'deck_card_added',
  DECK_CARD_REMOVED: 'deck_card_removed',
  DECK_CARD_QUANTITY_CHANGED: 'deck_card_quantity_changed',
  DECK_CARD_CLICK: 'deck_card_click',
  DECK_DUPLICATED: 'deck_duplicated',
  DECK_VERSION_SAVED: 'deck_version_saved',
  DECK_VERSION_RESTORED: 'deck_version_restored',
  DECK_COMMENT_POSTED: 'deck_comment_posted',
  DECK_COMMENT_DELETED: 'deck_comment_deleted',
  BULK_DELETE_CARDS: 'bulk_delete_cards',
  
  // Deck browsing
  BROWSE_DECKS_PAGE_VIEW: 'browse_decks_page_view',
  BROWSE_DECKS_LOADED: 'browse_decks_loaded',
  BROWSE_DECK_CLICKED: 'browse_deck_clicked',
  BACK_TO_TOP_CLICKED: 'back_to_top_clicked',
  ADVANCED_FILTERS_APPLIED: 'advanced_filters_applied',
  
  // AI & Chat events
  CHAT_SENT: 'chat_sent',
  CHAT_STREAM_STOP: 'chat_stream_stop',
  CHAT_STREAM_FALLBACK: 'chat_stream_fallback',
  CHAT_STREAM_ERROR: 'chat_stream_error',
  CHAT_GUEST_LIMIT: 'chat_guest_limit',
  CHAT_GUEST_LIMIT_WARNING_15: 'guest_limit_warning_15',
  CHAT_GUEST_LIMIT_WARNING_18: 'guest_limit_warning_18',
  CHAT_FEEDBACK: 'chat_feedback',
  GUEST_CHAT_RESTORED: 'guest_chat_restored',
  
  // AI suggestions
  AI_SUGGESTION_SHOWN: 'ai_suggestion_shown',
  AI_SUGGESTION_ACCEPTED: 'ai_suggestion_accepted',
  
  // Collections
  COLLECTION_IMPORTED: 'collection_imported',
  COLLECTION_CREATED: 'collection_created',
  COLLECTION_DELETED: 'collection_deleted',
  COLLECTION_CARD_CLICK: 'collections.card_click',
  BULK_DELETE_COLLECTION_ITEMS: 'bulk_delete_collection_items',
  CSV_UPLOADED: 'csv_uploaded',
  
  // Wishlist
  WISHLIST_PAGE_VIEW: 'wishlist_page_view',
  WISHLIST_CREATED: 'wishlist_created',
  WISHLIST_RENAMED: 'wishlist_renamed',
  WISHLIST_DELETED: 'wishlist_deleted',
  WISHLIST_ITEM_ADDED: 'wishlist_item_added',
  BULK_DELETE_WISHLIST_ITEMS: 'bulk_delete_wishlist_items',
  
  // Watchlist
  WATCHLIST_PAGE_VIEW: 'watchlist_page_view',
  WATCHLIST_ITEM_ADDED: 'watchlist_item_added',
  WATCHLIST_ITEM_REMOVED: 'watchlist_item_removed',
  
  // Cost analysis
  COST_TO_FINISH_OPENED: 'cost_to_finish_opened',
  COST_COMPUTED: 'cost_computed',
  
  // Profile
  PROFILE_VIEW: 'profile_view',
  PROFILE_WISHLIST_SAVE: 'profile_wishlist_save',
  PROFILE_USERNAME_CHANGE: 'profile_username_change',
  PROFILE_FAV_COMMANDER_SET: 'profile_fav_commander_set',
  PROFILE_AVATAR_CHANGE: 'profile_avatar_change',
  PROFILE_PRICING_CTA_CLICKED: 'profile_pricing_cta_clicked',
  PROFILE_PRICING_LEARN_MORE_CLICKED: 'profile_pricing_learn_more_clicked',
  PROFILE_SHARE: 'profile_share',
  PRIVACY_DATA_SHARE_TOGGLED: 'privacy_data_share_toggled',
  
  // Pricing & Pro
  PRICING_PAGE_VIEWED: 'pricing_page_viewed',
  PRICING_UPGRADE_CLICKED: 'pricing_upgrade_clicked',
  PRICING_INTERVAL_CHANGED: 'pricing_interval_changed',
  BILLING_PORTAL_CLICKED: 'billing_portal_clicked',
  
  // Navigation
  NAV_LINK_CLICKED: 'nav_link_clicked',
  HELP_MENU_CLICKED: 'help_menu_clicked',
  
  // UI interactions
  UI_CLICK: 'ui_click',
  THEME_CHANGED: 'theme_changed',
  CONTENT_SHARED: 'content_shared',
  EMPTY_STATE_PRIMARY_ACTION: 'empty_state_primary_action',
  EMPTY_STATE_SECONDARY_ACTION: 'empty_state_secondary_action',
  
  // Command palette
  COMMAND_PALETTE_OPENED: 'command_palette_opened',
  COMMAND_PALETTE_ACTION: 'command_palette_action',
  SHORTCUT_USED: 'shortcut_used',
  SHORTCUTS_HELP_OPENED: 'shortcuts_help_opened',
  
  // Rate limiting
  RATE_LIMIT_WARNING_SHOWN: 'rate_limit_warning_shown',
  RATE_LIMIT_INDICATOR_CLICKED: 'rate_limit_indicator_clicked',
  
  // Guest limits
  GUEST_LIMIT_MODAL_SHOWN: 'guest_limit_modal_shown',
  GUEST_LIMIT_SIGNUP_CLICKED: 'guest_limit_signup_clicked',
  GUEST_LIMIT_SIGNIN_CLICKED: 'guest_limit_signin_clicked',
  GUEST_EXIT_WARNING_TRIGGERED: 'guest_exit_warning_triggered',
  GUEST_EXIT_WARNING_SIGNUP_CLICKED: 'guest_exit_warning_signup_clicked',
  GUEST_EXIT_WARNING_LEFT_ANYWAY: 'guest_exit_warning_left_anyway',
  GUEST_EXIT_WARNING_DISMISSED_SESSION: 'guest_exit_warning_dismissed_session',
  
  // PWA & Install
  APP_OPENED_STANDALONE: 'app_opened_standalone',
  PWA_VISIT_TRACKED: 'pwa_visit_tracked',
  PWA_INSTALL_PROMPTED: 'pwa_install_prompted',
  PWA_INSTALL_ACCEPTED: 'pwa_install_accepted',
  PWA_INSTALL_DISMISSED: 'pwa_install_dismissed',
  IOS_PWA_VISIT_TRACKED: 'ios_pwa_visit_tracked',
  IOS_PWA_PROMPTED: 'ios_pwa_prompted',
  IOS_PWA_DISMISSED: 'ios_pwa_dismissed',
  IOS_PWA_INSTRUCTIONS_VIEWED: 'ios_pwa_instructions_viewed',
  
  // Onboarding & Tour
  ONBOARDING_TOUR_STEP: 'onboarding_tour_step',
  ONBOARDING_TOUR_SKIPPED: 'onboarding_tour_skipped',
  ONBOARDING_TOUR_COMPLETED: 'onboarding_tour_completed',
  
  // AI Memory
  AI_MEMORY_GREETING_SHOWN: 'ai_memory_greeting_shown',
  AI_MEMORY_CONSENT: 'ai_memory_consent',
  AI_MEMORY_GREETING_DISMISSED: 'ai_memory_greeting_dismissed',
  AI_MEMORY_CLEARED: 'ai_memory_cleared',
  
  // Coach & Tips
  COACH_BUBBLE_SHOWN: 'coach_bubble_shown',
  COACH_BUBBLE_DISMISSED: 'coach_bubble_dismissed',
  COACH_BUBBLE_ACTION_CLICKED: 'coach_bubble_action_clicked',
  CONTEXTUAL_TIP_SHOWN: 'contextual_tip_shown',
  
  // Sample decks
  SAMPLE_DECK_IMPORT_STARTED: 'sample_deck_import_started',
  SAMPLE_DECK_IMPORT_COMPLETED: 'sample_deck_import_completed',
  SAMPLE_DECK_IMPORT_FAILED: 'sample_deck_import_failed',
  SAMPLE_DECK_BUTTON_CLICKED: 'sample_deck_button_clicked',
  
  // Pro features
  PRO_FEATURE_AWARENESS: 'pro_feature_awareness',
  PRO_FEATURE_CTA_CLICKED: 'pro_feature_cta_clicked',
  
  // Badges
  BADGE_SHARE_ACTION: 'badge_share_action',
  
  // Server-side events (from API routes)
  THREAD_CREATED: 'thread_created',
  THREAD_RENAMED: 'thread_renamed',
  THREAD_LINKED: 'thread_linked',
  THREAD_UNLINKED: 'thread_unlinked',
  THREAD_DELETED: 'thread_deleted',
  FEEDBACK_SENT: 'feedback_sent',
  SIGNUP_COMPLETED: 'signup_completed',
  
  // Performance & timing (from server)
  STAGE_TIME_RESEARCH: 'stage_time_research',
  STAGE_TIME_ANSWER: 'stage_time_answer',
  STAGE_TIME_REVIEW: 'stage_time_review',
} as const;

/**
 * Type-safe event name
 * 
 * Usage:
 *   function trackEvent(event: AnalyticsEventName, props?: Record<string, any>) {
 *     capture(event, props);
 *   }
 */
export type AnalyticsEventName =
  (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];
```

---

## 4. Web Vitals Integration

### ✅ CREATE: `frontend/lib/analytics/webVitals.ts`

**Purpose**: Single integration point for Web Vitals tracking.

**Implementation**:
```typescript
/**
 * Web Vitals tracking for PostHog
 * 
 * Tracks Core Web Vitals (LCP, FID, CLS) and other performance metrics.
 * Each metric is sent exactly once per page load.
 */

import { onCLS, onFCP, onFID, onINP, onLCP, onTTFB } from 'web-vitals';
import { capture } from '@/lib/ph';
import { AnalyticsEvents } from './events';

type Metric = {
  name: string;
  value: number;
  id: string;
  delta: number;
  rating: 'good' | 'needs-improvement' | 'poor';
};

function sendToPostHog(metric: Metric) {
  capture(`${AnalyticsEvents.WEB_VITAL}_${metric.name}`, {
    value: Math.round(metric.value),
    id: metric.id,
    delta: Math.round(metric.delta),
    rating: metric.rating,
    path: typeof window !== 'undefined' ? window.location.pathname : '/',
  });
}

let initialized = false;

export function initWebVitals() {
  if (typeof window === 'undefined' || initialized) return;
  initialized = true;

  // Core Web Vitals
  onCLS(sendToPostHog);
  onFCP(sendToPostHog);
  onFID(sendToPostHog);
  onINP(sendToPostHog);
  onLCP(sendToPostHog);
  onTTFB(sendToPostHog);
}
```

**Integration**: Call `initWebVitals()` in `Providers.tsx` after PostHog is initialized.

---

## 5. Helper Modules - Keep & Enhance

### ✅ KEEP: `frontend/lib/ph.ts`

**Status**: Main client helper - already correct.

**Enhancement**: Add JSDoc comment referencing `AnalyticsEvents`:
```typescript
/**
 * Capture an analytics event
 * 
 * @param event - Event name (prefer AnalyticsEvents constants)
 * @param props - Event properties
 * 
 * @example
 *   import { AnalyticsEvents } from '@/lib/analytics/events';
 *   capture(AnalyticsEvents.DECK_SAVED, { deck_id: '123' });
 */
export function capture(event: string, props?: Props): void {
  // ... existing implementation
}
```

### ✅ KEEP: `frontend/lib/server/analytics.ts`

**Status**: Server-side helper - already correct.

**Enhancement**: Add JSDoc comment referencing `AnalyticsEvents`:
```typescript
/**
 * Capture a server-side analytics event
 * 
 * @param event - Event name (prefer AnalyticsEvents constants)
 * @param properties - Event properties
 * @param distinctId - Optional distinct ID (defaults to 'anon' or properties.user_id)
 * 
 * @example
 *   import { AnalyticsEvents } from '@/lib/analytics/events';
 *   await captureServer(AnalyticsEvents.DECK_SAVED, { deck_id: '123' }, userId);
 */
export async function captureServer(...) {
  // ... existing implementation
}
```

### ✅ KEEP: `frontend/lib/analytics/track.ts`

**Status**: UI click tracking - already correct.

### ✅ KEEP: `frontend/lib/analytics-enhanced.ts`

**Status**: Enhanced tracking functions - already correct.

### ✅ KEEP: `frontend/lib/analytics-performance.ts`

**Status**: Performance tracking - already correct.

---

## 6. File Structure Summary

### Files to DELETE:
- ❌ `frontend/components/PosthogInit.tsx`
- ❌ `frontend/components/PostHogRouteTracker.tsx`
- ❌ `frontend/lib/analytics.ts`

### Files to CREATE:
- ✅ `frontend/lib/analytics/events.ts` - Event name constants
- ✅ `frontend/lib/analytics/webVitals.ts` - Web vitals integration

### Files to REFACTOR:
- ✅ `frontend/components/AnalyticsProvider.tsx` - Use `capture()` and `AnalyticsEvents`
- ✅ `frontend/components/Providers.tsx` - Add web vitals init
- ✅ `frontend/lib/ph.ts` - Add JSDoc comments
- ✅ `frontend/lib/server/analytics.ts` - Add JSDoc comments

### Files to KEEP (no changes):
- ✅ `frontend/instrumentation-client.ts`
- ✅ `frontend/lib/analytics/track.ts`
- ✅ `frontend/lib/analytics-enhanced.ts`
- ✅ `frontend/lib/analytics-performance.ts`
- ✅ `frontend/middleware.ts`

---

## 7. Migration Strategy

### Phase 1: Create Infrastructure
1. Create `lib/analytics/events.ts` with all event names
2. Create `lib/analytics/webVitals.ts`
3. Delete unused files (`PosthogInit.tsx`, `PostHogRouteTracker.tsx`, `lib/analytics.ts`)

### Phase 2: Refactor Core Components
1. Update `AnalyticsProvider.tsx` to use `capture()` and `AnalyticsEvents.PAGE_VIEW`
2. Update `Providers.tsx` to initialize web vitals
3. Update `lib/ph.ts` and `lib/server/analytics.ts` with JSDoc comments

### Phase 3: Gradual Migration (Optional)
- Over time, migrate direct `capture('event_name')` calls to use `AnalyticsEvents.EVENT_NAME`
- This is optional but recommended for type safety

---

## 8. Final Architecture Diagram

```
app/layout.tsx
  └── <Providers> (ONLY init point)
       ├── posthog.init() with consent check
       ├── initWebVitals() after PostHog ready
       └── <AnalyticsProvider> (ONLY pageview tracker)
            └── Uses capture(AnalyticsEvents.PAGE_VIEW)

Components/Pages
  └── import { capture } from '@/lib/ph'
  └── import { AnalyticsEvents } from '@/lib/analytics/events'
  └── capture(AnalyticsEvents.EVENT_NAME, props)

API Routes
  └── import { captureServer } from '@/lib/server/analytics'
  └── import { AnalyticsEvents } from '@/lib/analytics/events'
  └── await captureServer(AnalyticsEvents.EVENT_NAME, props, userId)

Middleware
  └── Uses captureServer(AnalyticsEvents.USER_FIRST_VISIT, ...)
```

---

## 9. Benefits

1. **No Duplicate Initialization**: Single `posthog.init()` in `Providers.tsx`
2. **No Duplicate Pageviews**: Single tracker in `AnalyticsProvider.tsx`
3. **No Duplicate Web Vitals**: Single integration in `webVitals.ts`
4. **Type Safety**: Event names are constants, reducing typos
5. **Maintainability**: All event names in one place
6. **Consistency**: All code uses same helpers and patterns

---

## 10. Testing Checklist

After implementation, verify:
- [ ] PostHog initializes exactly once (check Network tab)
- [ ] Pageview fires exactly once per navigation (check PostHog dashboard)
- [ ] Web vitals fire exactly once per page load (check PostHog dashboard)
- [ ] No console errors about PostHog
- [ ] All existing events still work
- [ ] Server-side events still work

---

**Ready for STEP 3 implementation?**

