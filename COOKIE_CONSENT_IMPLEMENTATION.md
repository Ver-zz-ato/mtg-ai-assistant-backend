# Cookie Consent Modal Implementation Summary

## Overview

Replaced the small bottom cookie banner with a centered, blocking consent modal that matches ManaTap's dark theme. The modal requires user interaction before allowing access to the app.

## Files Changed

### Created Files

1. **`frontend/lib/consent.ts`**
   - Consent management helper module
   - Functions: `getConsentStatus()`, `setConsentStatus()`, `clearConsentStatus()`, `hasConsent()`
   - Storage key: `manatap_cookie_consent` (with backward compatibility for `analytics:consent`)
   - SSR-safe with proper guards

2. **`frontend/components/CookieConsentModal.tsx`**
   - New centered modal component
   - Full-screen backdrop that blocks clicks
   - Focus trap for accessibility
   - Prevents body scroll when open
   - Dark theme styling with gradient buttons

### Modified Files

3. **`frontend/app/layout.tsx`**
   - Replaced `CookieBanner` import with `CookieConsentModal`
   - Modal renders globally at root level

4. **`frontend/lib/ph.ts`**
   - Updated `hasConsent()` to use new consent helper
   - Maintains backward compatibility with legacy key

5. **`frontend/components/Providers.tsx`**
   - Updated `hasConsent()` to use new consent helper
   - PostHog initialization already gated by consent (no changes needed)

6. **`frontend/app/privacy/page.tsx`**
   - Updated to use new consent helper via dynamic import
   - Maintains existing toggle functionality

### Deleted Files

7. **`frontend/components/CookieBanner.tsx`**
   - Removed old bottom banner component

## How It Works

### Consent Flow

1. **First Visit (Unknown Status)**
   - Modal appears centered on screen
   - Backdrop blocks all interaction with app
   - User must choose "Accept all" or "Decline"

2. **Accept**
   - Sets `manatap_cookie_consent = "accepted"` in localStorage
   - Also sets legacy `analytics:consent = "granted"` for backward compatibility
   - Emits `analytics:consent-granted` event
   - PostHog initializes immediately
   - Modal disappears

3. **Decline**
   - Sets `manatap_cookie_consent = "declined"` in localStorage
   - Removes legacy key
   - Emits `analytics:consent-revoked` event
   - PostHog does NOT initialize
   - Modal disappears

4. **Subsequent Visits**
   - If consent status exists, modal does not show
   - PostHog initializes only if status is "accepted"

### PostHog Gating

- **Client-side tracking**: All `capture()` calls in `lib/ph.ts` check `hasConsent()` first
- **Server-side tracking**: Unaffected (no consent required)
- **Initialization**: PostHog only initializes when consent is "accepted" (in `Providers.tsx`)

## Testing

### Manual Testing Steps

1. **First Load (No Consent)**
   ```javascript
   // Clear localStorage
   localStorage.clear();
   // Refresh page
   ```
   - ✅ Modal appears centered
   - ✅ Backdrop blocks clicks
   - ✅ Cannot interact with app until choice made

2. **Accept Flow**
   - Click "Accept all"
   - ✅ Modal disappears
   - ✅ Check localStorage: `manatap_cookie_consent = "accepted"`
   - ✅ PostHog should initialize (check Network tab for PostHog requests)
   - ✅ Refresh page → no modal, analytics still enabled

3. **Decline Flow**
   ```javascript
   // Clear and set decline
   localStorage.setItem('manatap_cookie_consent', 'declined');
   // Refresh page
   ```
   - ✅ Modal disappears
   - ✅ PostHog should NOT initialize
   - ✅ Refresh page → no modal, analytics still disabled

4. **Backward Compatibility**
   ```javascript
   // Set legacy key
   localStorage.setItem('analytics:consent', 'granted');
   // Clear new key
   localStorage.removeItem('manatap_cookie_consent');
   // Refresh page
   ```
   - ✅ Should migrate to new format
   - ✅ Modal should not appear
   - ✅ Analytics should work

### Override Consent (For Testing)

```javascript
// Clear consent to force modal
localStorage.removeItem('manatap_cookie_consent');
localStorage.removeItem('analytics:consent');

// Or set specific status
localStorage.setItem('manatap_cookie_consent', 'accepted'); // or 'declined'
```

## Design Details

### Modal Styling
- **Background**: `bg-neutral-900` with `border-neutral-700`
- **Primary Button**: Gradient from blue-600 to purple-600 with hover effects
- **Secondary Button**: Neutral gray with border
- **Backdrop**: Black with 70% opacity and blur
- **Max Width**: `max-w-md` (responsive)

### Accessibility
- ✅ Focus trap (Tab key stays within modal)
- ✅ ARIA attributes (`role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-describedby`)
- ✅ Keyboard navigation support
- ✅ First button auto-focused when modal opens

## Integration Points

### Existing Code That Uses Consent

1. **`lib/ph.ts`** - Client-side PostHog wrapper
   - `hasConsent()` - Checks consent before any capture
   - `capture()`, `identify()`, `reset()` - All gated

2. **`components/Providers.tsx`** - PostHog initialization
   - Checks consent before initializing
   - Listens for `analytics:consent-granted` event

3. **`app/privacy/page.tsx`** - Privacy settings
   - Toggle uses new consent helper
   - Updates consent status

### Server-Side Analytics

- **Unchanged**: Server-side analytics (`lib/server/analytics.ts`) work without consent
- All `captureServer()` calls continue to work regardless of client consent

## Future Enhancements

### Optional: Cookie Settings Link

To allow users to reopen the modal later, you can add a "Cookie settings" link in the footer:

```tsx
import { useCookieConsentModal } from '@/components/CookieConsentModal';

function Footer() {
  const { openModal } = useCookieConsentModal();
  return (
    <button onClick={openModal}>Cookie Settings</button>
  );
}
```

### Optional: Soft Wall

Instead of blocking on first visit, you could require consent only when user:
- Opens Deck Builder
- Starts a chat
- Performs other "core feature" actions

This would require adding `useEnsureConsent()` hook (not implemented yet).

## Notes

- **No breaking changes**: Backward compatible with existing `analytics:consent` key
- **SSR-safe**: All localStorage access is guarded
- **Performance**: Modal only renders on client (no hydration issues)
- **Type-safe**: TypeScript types for consent status

---

**Implementation Date**: 2025-01-27  
**Build Status**: ✅ Passing

