# PostHog Integration Guide

## Overview

PostHog is used for product analytics, user behavior tracking, and conversion funnel analysis. This application implements a **dual-tracking system** with both client-side and server-side tracking to ensure GDPR compliance while maintaining complete analytics coverage.

## Architecture

### Dual-Tracking System

1. **Client-Side Tracking** (Cookie Consent Required)
   - Location: `frontend/lib/ph.ts`
   - Requires: User must accept cookie banner
   - Events: User interactions, UI events, navigation
   - Silent failure if no consent (GDPR compliant)

2. **Server-Side Tracking** (No Cookie Consent Required)
   - Location: `frontend/lib/server/analytics.ts`
   - Always works regardless of cookie consent
   - Events: Critical business metrics (signups, logins, conversions)
   - Used for: Revenue tracking, user activation, critical funnel events

## Setup & Configuration

### Environment Variables

```env
# Required
NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxxxxxxxxxx
NEXT_PUBLIC_POSTHOG_HOST=https://eu.posthog.com  # or https://us.i.posthog.com

# Server-side (optional fallback)
POSTHOG_KEY=phc_xxxxxxxxxxxxx
POSTHOG_HOST=https://eu.posthog.com
```

### Key Files

- **Client-side helper**: `frontend/lib/ph.ts`
  - `capture()` - Track events (requires consent)
  - `identify()` - Identify users with properties
  - `reset()` - Clear user identification
  - `hasConsent()` - Check if user granted consent

- **Server-side helper**: `frontend/lib/server/analytics.ts`
  - `captureServer()` - Track events server-side (always works)
  - `serverAnalyticsEnabled()` - Check if PostHog is configured

- **Initialization**: `frontend/components/Providers.tsx`
  - Initializes PostHog only after cookie consent
  - Defers initialization by 1.5s for performance
  - Listens for `analytics:consent-granted` event

- **Cookie Consent**: `frontend/components/CookieBanner.tsx`
  - Shows banner if consent not granted
  - Stores consent in `localStorage: 'analytics:consent' = 'granted'`
  - Emits `analytics:consent-granted` window event

### API Endpoints for Server-Side Tracking

- `frontend/app/api/analytics/track-signup/route.ts` - Track signups server-side
- `frontend/app/api/analytics/track-event/route.ts` - Generic server-side event tracking

## Event Tracking Patterns

### Client-Side Events (Require Consent)

```typescript
import { capture } from '@/lib/ph';

// Basic event
capture('button_clicked', { button_name: 'signup' });

// User identification
import { identify } from '@/lib/ph';
identify(userId, { email, subscription_tier: 'pro' });
```

**Important**: These events silently fail if user hasn't accepted cookies.

### Server-Side Events (Always Work)

```typescript
import { captureServer } from '@/lib/server/analytics';

// Track from API route
await captureServer('signup_completed', {
  method: 'email',
  user_id: userId,
  user_email: email
}, userId);
```

### Client-Side with Server-Side Fallback

For critical events, use both:

```typescript
// Track client-side (may fail if no consent)
capture('signup_completed', { method: 'email' });

// Also track server-side (always works)
try {
  await fetch('/api/analytics/track-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      event: 'signup_completed',
      properties: { method: 'email', user_id: userId }
    })
  });
} catch (e) {
  // Silent fail - best effort
}
```

## Critical Events Tracked Server-Side

These events are **always tracked** regardless of cookie consent:

- `signup_completed` - New user registrations
- `auth_login_success` - User logins
- `email_verified_success` - Email verification completions
- `pricing_upgrade_clicked` - Revenue funnel events

## Events Tracked Client-Side (Require Consent)

See `docs/POSTHOG_EVENTS_SUMMARY.md` for complete list. Examples:

- Navigation events (`nav_link_clicked`)
- Chat events (`chat_sent`, `chat_feedback`)
- Deck events (`deck_created`, `deck_card_added`)
- UI events (`theme_changed`, `shortcut_used`)

## Cookie Consent Flow

1. **User visits site** → CookieBanner checks `localStorage.getItem('analytics:consent')`
2. **If no consent** → Banner shown at bottom of page
3. **User clicks "Accept"** → Consent saved to localStorage, `analytics:consent-granted` event fired
4. **Providers component** → Listens for event, initializes PostHog
5. **PostHog init** → Delayed by 1.5s to avoid blocking page load

## Configuration Options

### PostHog Init Settings (Providers.tsx)

```typescript
posthog.init(key, {
  api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || '/ingest',
  capture_pageview: false,      // Manual pageview tracking
  autocapture: false,           // Disabled for privacy
  capture_pageleave: true,      // Track when users leave
  disable_session_recording: true,  // No session recordings
  disable_toolbar: true,        // PostHog toolbar disabled
  debug: false                  // Production: false
});
```

## Troubleshooting

### Events Not Showing in PostHog

**Client-Side Events Missing:**
1. Check if user accepted cookies: `localStorage.getItem('analytics:consent')`
2. Check browser console for PostHog errors
3. Verify `NEXT_PUBLIC_POSTHOG_KEY` is set
4. Check PostHog dashboard for blocked events (GDPR settings)

**Server-Side Events Missing:**
1. Verify `POSTHOG_KEY` or `NEXT_PUBLIC_POSTHOG_KEY` is set
2. Check server logs for PostHog initialization errors
3. Ensure `posthog-node` package is installed

### PostHog Not Initializing

**Symptoms**: No events tracked, console shows PostHog undefined

**Solutions**:
1. Check environment variables are set correctly
2. Verify consent was granted (check localStorage)
3. Check if offline mode is preventing init (`navigator.onLine`)
4. Check browser console for initialization errors

### Testing Tracking

**Client-Side:**
```typescript
// In browser console (after accepting cookies)
window.posthog?.capture('test_event', { test: true });
```

**Server-Side:**
```typescript
// In API route
await captureServer('test_event', { test: true });
```

### Common Issues

**Issue**: Events fire but don't appear in PostHog
- **Cause**: PostHog project filters or GDPR settings
- **Fix**: Check PostHog project settings, verify API key matches project

**Issue**: Consent banner keeps appearing
- **Cause**: localStorage blocked or cleared
- **Fix**: Check browser settings, try incognito mode

**Issue**: Server-side events missing user_id
- **Cause**: User not authenticated when event fires
- **Fix**: Pass `user_id` in properties or use `distinctId` parameter

## Best Practices

1. **Always use server-side tracking for critical business events**
   - Signups, logins, conversions, revenue events
   - These should never fail due to cookie consent

2. **Client-side tracking for UX metrics**
   - Button clicks, navigation, feature discovery
   - OK if some users don't have consent (GDPR compliant)

3. **Use dual-tracking for important events**
   - Track both client and server side
   - Server-side acts as backup/verification

4. **Don't track PII without consent**
   - Client-side: Only after consent granted
   - Server-side: Only user_id and email (necessary for analytics)

## Related Files

- `frontend/lib/ph.ts` - Client-side PostHog helpers
- `frontend/lib/server/analytics.ts` - Server-side PostHog helpers
- `frontend/components/Providers.tsx` - PostHog initialization
- `frontend/components/CookieBanner.tsx` - Consent management
- `frontend/app/api/analytics/track-signup/route.ts` - Server-side signup tracking
- `frontend/app/api/analytics/track-event/route.ts` - Generic server-side tracking
- `docs/POSTHOG_EVENTS_SUMMARY.md` - Complete events list

