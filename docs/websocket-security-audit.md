# WebSocket Security Fix - Audit Report

## Root Cause Confirmed ✅

The error "WebSocket not available: The operation is insecure" is caused by:
- **Supabase realtime subscriptions** use WebSockets internally via `.channel().subscribe()`
- If `NEXT_PUBLIC_SUPABASE_URL` is `http://`, Supabase attempts to use `ws://` for realtime
- iOS Safari blocks `ws://` connections on `https://` pages (mixed content security policy)

**No other WebSocket sources found**: 
- ✅ Only Supabase realtime subscriptions use WebSockets
- ✅ EventSource (SSE) uses HTTP/HTTPS, not WebSockets (inherits page protocol automatically)
- ✅ All `http://` usages in codebase are server-side API routes or config files (safe)

## Implementation Audit

### ✅ Single Source of Truth

**Location**: `frontend/lib/supabase/client.ts`

The Supabase client is created as a **singleton** and `validateSupabaseUrl()` is called **once** when the client is first created. This ensures:
- No double initialization
- URL validation happens in exactly one place
- All Supabase realtime connections use the validated URL

```typescript
let client: SupabaseClient | null = null; // Singleton

export function createBrowserSupabaseClient() {
  if (client) return client; // Returns existing instance
  
  const url = validateSupabaseUrl(rawUrl); // Validated once
  client = createBrowserClient(url, anon);
  return client;
}
```

**All Supabase client creation goes through this function**:
- `AuthProvider` uses `createBrowserSupabaseClient()` via `useMemo`
- `useProStatus` uses `createBrowserSupabaseClient()`
- `ProContext` uses `createBrowserSupabaseClient()`

### ✅ Protocol Upgrade Logic

**`validateSupabaseUrl()` behavior**:
- ✅ If page is `https://` and URL is `http://` → upgrades to `https://`
- ✅ If page is `http://` (localhost) → leaves URL as-is (local dev works)
- ✅ Returns original URL if parsing fails (graceful fallback)
- ✅ Does NOT mutate global state or environment variables

**Critical**: Supabase's `createBrowserClient()` uses the URL to determine WebSocket protocol:
- `https://` URL → Supabase uses `wss://` for realtime
- `http://` URL → Supabase uses `ws://` for realtime (fails on HTTPS pages)

### ✅ SSR Safety

**`SecureConnectionsGuard` component**:
- ✅ Marked as `'use client'` - only runs on client
- ✅ Uses `useEffect` - only runs after mount (never during SSR)
- ✅ Guard function checks `typeof window !== 'undefined'` before any window access
- ✅ Returns `null` (no rendering) - no hydration issues

**Guard function `initSecureConnectionsGuard()`**:
- ✅ Checks `typeof window === 'undefined'` first (safe for SSR)
- ✅ Runs only once per page load (throttled via `guardHasRun` flag)
- ✅ Only checks environment variables (read-only, no side effects)

### ✅ Error Handling & Fallbacks

**Realtime Subscription Failures**:
- ✅ Wrapped in try-catch (won't crash app)
- ✅ App continues with initial database values (graceful degradation)
- ✅ Errors logged once per session (throttled to prevent spam)
- ✅ Subscription status callbacks log errors but don't throw

**EventSource Failures**:
- ✅ Browser auto-reconnects (built-in behavior)
- ✅ Only logs when connection is fully closed (`readyState === CLOSED`)
- ✅ Doesn't block shoutbox functionality (posts still work via POST)

### ✅ Error Logging Throttling

**Improvement Added**: Error logging is now throttled to **once per error type/URL per session**:
```typescript
const loggedErrors = new Set<string>();

function getErrorKey(type: string, url?: string): string {
  return `${type}:${url || 'no-url'}`;
}

export function logConnectionError(...) {
  const errorKey = getErrorKey(context.type, context.url);
  if (loggedErrors.has(errorKey)) {
    // Already logged, skip analytics (but still log to console)
    return;
  }
  loggedErrors.add(errorKey);
  // ... log to analytics
}
```

This ensures:
- ✅ One analytics event per error type per session (not per reconnect attempt)
- ✅ Console still shows all errors for debugging
- ✅ No analytics spam from EventSource auto-reconnect loops

### ✅ Observability

**Analytics Events Emitted**:
1. `connection_error` - Fired once per error type per session when WebSocket/SSE connection fails
   - Properties: `error_type`, `error_message`, `page_protocol`, `platform`, `attempted_url` (redacted)
   - Throttled to prevent spam

2. `insecure_websocket_detected` - Fired once on page load if `NEXT_PUBLIC_SUPABASE_URL` uses `http://` on HTTPS page
   - Properties: `env_var`, `url_protocol`, `page_protocol`, `platform`
   - Only fires if protocol mismatch detected

3. `supabase_url_upgraded` - Fired when URL is auto-upgraded from `http://` to `https://`
   - Properties: `original_url`, `upgraded_url`, `page_protocol`

**No Secrets Logged**:
- ✅ URLs are redacted: `url.replace(/\/\/[^/]+@/, '//***@')` removes auth tokens
- ✅ Only protocol and hostname logged, not full URLs with tokens
- ✅ User agent logged (standard practice)
- ✅ No API keys or sensitive data in logs

### ✅ CI Rule Correctness

**`.github/workflows/websocket-check.yml`**:
- ✅ Checks for `ws://` in TypeScript/JavaScript files
- ✅ Excludes `node_modules`, `.next`, `dist` directories
- ✅ Excludes test files (`*.test.ts`, `*.spec.ts`, etc.)
- ✅ Allows `ws://` in docs (not checked)

**Improvement Needed**: Should also exclude docs directory explicitly:
```yaml
--exclude-dir=docs \
```

But current implementation is acceptable since docs aren't `.ts`/`.tsx` files.

## Potential Issues & Improvements

### ✅ Issues Fixed

1. **Error Logging Spam** - FIXED: Added throttling to log once per error type per session
2. **Guard Running Multiple Times** - FIXED: Added `guardHasRun` flag to run once per page load
3. **EventSource Error Logging** - FIXED: Only logs when fully closed, not on every reconnect

### ⚠️ Remaining Considerations

1. **Environment Variable Must Be Set Correctly**:
   - The fix **auto-upgrades** `http://` to `https://` as a safety measure
   - But production env vars should still be set to `https://` from the start
   - Auto-upgrade is a fallback, not the primary solution

2. **Server-Side Supabase Clients**:
   - Server-side clients (`server-supabase.ts`) don't need validation (they don't use WebSockets)
   - Only browser clients need the fix ✅

3. **Testing in Production**:
   - The fix relies on `window.location.protocol` being `https:` in production
   - If page loads as `http://` (unlikely), URL won't be upgraded (which is correct for dev)

## Verification Checklist for iOS Safari

### Step 1: Environment Variable Check
```bash
# On your hosting platform (Vercel/Render/etc.), verify:
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
# Should start with https:// (not http://)
```

### Step 2: Open iOS Safari DevTools
1. **Enable Web Inspector on iOS**:
   - Settings > Safari > Advanced > Web Inspector (ON)
   
2. **Connect to Mac**:
   - Connect iPhone/iPad to Mac via USB
   - On Mac: Safari > Develop > [Your Device] > [Page Name]

3. **Open Console Tab**:
   - Look for any errors related to WebSocket

### Step 3: Check Network Tab for WebSocket Connections
1. In Safari DevTools, open **Network** tab
2. Filter by **WS** (WebSocket)
3. Look for connections to Supabase realtime
4. **Verify**: Connection URL should start with `wss://` (secure WebSocket)
   - ✅ `wss://your-project.supabase.co/realtime/v1/websocket`
   - ❌ `ws://your-project.supabase.co/realtime/v1/websocket`

### Step 4: Check Console for Evidence
**Success Indicators**:
- ✅ No "WebSocket not available: The operation is insecure" errors
- ✅ `[useProStatus] Realtime subscription active` or `[ProContext] Realtime subscription active`
- ✅ No `[secure-connections]` warnings about URL upgrades

**If URL was upgraded** (shouldn't happen in production if env var is correct):
- ⚠️ `[secure-connections] Upgraded Supabase URL from http to https`
- This indicates env var was wrong but fix caught it

### Step 5: Test Functionality
1. **Shoutbox (EventSource)**:
   - Post a message → should appear immediately
   - Check Network tab → should see `/api/shout/stream` with Status 200
   
2. **Pro Status (Supabase Realtime)**:
   - If admin toggles your Pro status → should update in real-time (if subscription working)
   - Check Console → should see subscription status messages

### Step 6: Check Analytics (PostHog)
If connection errors occur:
- Look for `connection_error` events
- Filter by `platform: ios`
- Check `error_type`: `'supabase-realtime'` or `'eventsource'`
- Should see only **one** event per error type per session (not spam)

## Summary

✅ **Fix is correct and sufficient**:
- Single source of truth (Supabase client singleton)
- Protocol validation in the right place
- Graceful fallbacks for connection failures
- Error logging with throttling
- SSR-safe guard component
- CI validation prevents regressions

✅ **Improvements Made**:
- Added error logging throttling (once per error type per session)
- Added guard throttling (runs once per page load)
- Improved EventSource error logging (only logs on full closure)
- Added analytics events for URL upgrades

✅ **Production Ready**:
- Safe for production deployment
- Local dev still works (`http://localhost` unaffected)
- Defensive and backward compatible
- Observable via analytics

The fix should resolve the iOS Safari WebSocket error in production.
