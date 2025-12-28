# WebSocket Security Fix - iOS Safari Mixed Content Error

## Root Cause

The error "WebSocket not available: The operation is insecure" occurs when:
1. The page is loaded over HTTPS (`https://`)
2. The application attempts to establish a WebSocket connection over `ws://` (insecure)
3. iOS Safari (and other browsers) blocks mixed content (HTTP/WS on HTTPS pages) for security

**Primary Issue**: Supabase realtime subscriptions use WebSockets internally. If `NEXT_PUBLIC_SUPABASE_URL` is set to `http://` instead of `https://`, Supabase will try to use `ws://` for realtime connections, which fails on HTTPS pages.

**Secondary Issue**: EventSource (SSE) connections should inherit the page protocol automatically, but explicit validation ensures consistency.

## Files Changed

### 1. `frontend/lib/secure-connections.ts` (NEW)
- **Purpose**: Centralized utilities for secure WebSocket/SSE connections
- **Key Functions**:
  - `getSecureEventSourceUrl()` - Ensures EventSource URLs use correct protocol
  - `validateSupabaseUrl()` - Validates and upgrades Supabase URL to HTTPS on production
  - `logConnectionError()` - Logs connection errors with context for debugging
  - `createSecureEventSource()` - Safe EventSource wrapper with error handling

### 2. `frontend/lib/supabase/client.ts`
- **Change**: Added `validateSupabaseUrl()` call before creating Supabase client
- **Impact**: Ensures Supabase URL uses HTTPS, which makes Supabase's realtime client use `wss://` instead of `ws://`

### 3. `frontend/components/RightSidebar.tsx`
- **Change**: Replaced `new EventSource()` with `createSecureEventSource()` helper
- **Impact**: EventSource connections now use validated URLs with error logging

### 4. `frontend/hooks/useProStatus.ts`
- **Change**: Added try-catch around Supabase realtime subscription with error logging
- **Impact**: Gracefully handles WebSocket connection failures (app continues to work without real-time updates)

### 5. `frontend/components/ProContext.tsx`
- **Change**: Added try-catch around Supabase realtime subscription with error logging
- **Impact**: Same as above - graceful fallback for realtime subscription failures

### 6. `frontend/lib/secure-connections-guard.ts` (NEW)
- **Purpose**: Runtime validation that runs on page load
- **Function**: `initSecureConnectionsGuard()` - Checks for protocol mismatches and logs warnings

### 7. `frontend/components/SecureConnectionsGuard.tsx` (NEW)
- **Purpose**: React component wrapper for the guard
- **Usage**: Added to root layout to run on every page load

### 8. `frontend/app/layout.tsx`
- **Change**: Added `<SecureConnectionsGuard />` component
- **Impact**: Runtime validation runs on every page load

### 9. `.github/workflows/websocket-check.yml` (NEW)
- **Purpose**: CI check to prevent `ws://` from appearing in client-side code
- **Impact**: Fails builds if insecure WebSocket protocols are found

## How It Works

### Supabase Realtime (WebSocket)
1. `createBrowserSupabaseClient()` validates `NEXT_PUBLIC_SUPABASE_URL`
2. If URL is `http://` and page is `https://`, URL is upgraded to `https://`
3. Supabase automatically uses `wss://` for realtime when URL is `https://`
4. Error handlers catch and log any connection failures
5. App continues to work even if realtime subscription fails (uses initial Pro status from database query)

### EventSource (SSE)
1. `createSecureEventSource()` validates the URL protocol
2. Relative URLs are converted to absolute with correct protocol
3. Error handlers log connection issues for debugging
4. Browser auto-reconnects on errors (built-in EventSource behavior)

### Runtime Guard
1. Runs on page load in `SecureConnectionsGuard` component
2. Checks `NEXT_PUBLIC_SUPABASE_URL` environment variable
3. Warns if URL uses `http://` on an `https://` page
4. Logs to analytics for monitoring

## Environment Variable Requirements

**CRITICAL**: Ensure `NEXT_PUBLIC_SUPABASE_URL` is set to `https://` in production:
- ✅ `https://your-project.supabase.co`
- ❌ `http://your-project.supabase.co` (will cause WebSocket errors)

The code now auto-upgrades `http://` to `https://` as a safety measure, but the environment variable should be correct in production.

## Testing Checklist for iOS Safari

1. **Test on HTTPS page**:
   - Open site on `https://manatap.ai` (production)
   - Open Safari DevTools (if available) or check console logs
   - Verify no "WebSocket not available" errors
   - Verify Supabase realtime subscriptions work (e.g., Pro status updates)

2. **Test EventSource (Shoutbox)**:
   - Open site on production
   - Verify shoutbox loads without errors
   - Post a message and verify it appears (EventSource connection working)

3. **Test Error Handling**:
   - If realtime subscription fails, app should still work
   - Check console for error logs (should see connection_error events)
   - Check PostHog for `connection_error` events (if analytics enabled)

4. **Verify Environment Variable**:
   - Check production environment: `NEXT_PUBLIC_SUPABASE_URL` should start with `https://`
   - If it starts with `http://`, the code will auto-upgrade but a warning will be logged

## Manual Verification Steps

1. **Check Environment Variable** (Production):
   ```bash
   # On your hosting platform (Vercel/Render/etc.)
   # Verify NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   ```

2. **Test on iOS Safari**:
   - Open `https://manatap.ai` on iPhone/iPad Safari
   - Open Safari DevTools (Settings > Safari > Advanced > Web Inspector)
   - Check Console for errors
   - Verify shoutbox works (EventSource)
   - Verify Pro status updates work (Supabase realtime)

3. **Check Console Logs**:
   - Look for `[secure-connections]` warnings/errors
   - Look for `[useProStatus]` or `[ProContext]` subscription errors
   - Verify no "WebSocket not available" errors

4. **Check Analytics** (if PostHog enabled):
   - Look for `connection_error` events
   - Filter by `platform: ios` to see iOS-specific issues
   - Check `error_type` field: `'supabase-realtime'` or `'eventsource'`

## Fallback Behavior

If WebSocket connections fail:
- **Supabase Realtime**: App continues to work with initial database values. Pro status updates won't happen in real-time, but page refresh will show updated status.
- **EventSource (Shoutbox)**: Browser auto-reconnects. If connection completely fails, shoutbox simply won't update in real-time (messages still work via POST).

## CI Validation

The GitHub Actions workflow (`.github/workflows/websocket-check.yml`) will:
- Check all PRs and main branch commits
- Fail if `ws://` is found in client-side code (excluding tests/docs)
- Verify `secure-connections.ts` helper exists

## Notes

- Local development (`http://localhost`) is unaffected - `ws://` still works for local dev
- The fix is backward compatible - existing code continues to work
- Error logging helps identify issues in production without breaking the app
- All changes are defensive and add graceful fallbacks rather than breaking functionality
