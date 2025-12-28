# Connection Sanity Check - QA Checklist

## Pre-Deploy Environment Checks

### ✅ Environment Variables

Verify the following in your hosting platform (Vercel/Render/etc.):

1. **NEXT_PUBLIC_SUPABASE_URL**
   ```bash
   # Should start with https://
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   
   # ❌ WRONG (will cause WebSocket errors):
   NEXT_PUBLIC_SUPABASE_URL=http://your-project.supabase.co
   ```

2. **Optional: App Version Tracking**
   ```bash
   # Optional but recommended for debugging:
   NEXT_PUBLIC_APP_VERSION=1.0.0
   NEXT_PUBLIC_COMMIT_SHA=abc1234
   ```

### ✅ Build Verification

Before deploying, check that:
- ✅ No TypeScript/compilation errors
- ✅ CI passes (including websocket-check workflow)
- ✅ No `ws://` found in client-side code

## Post-Deploy Smoke Tests

### 1. HTTPS Page Load Test

**Steps:**
1. Open production site: `https://manatap.ai`
2. Open browser DevTools Console
3. Check for `[connection-sanity-check]` warnings/errors

**Expected:**
- ✅ No protocol mismatch warnings
- ✅ No WebSocket errors

**If you see warnings:**
- Check environment variables in hosting platform
- Verify `NEXT_PUBLIC_SUPABASE_URL` uses `https://`

### 2. iOS Safari Test

**Steps:**
1. Open site on iPhone/iPad Safari: `https://manatap.ai`
2. Enable Web Inspector: Settings > Safari > Advanced > Web Inspector
3. Connect to Mac and open Safari DevTools
4. Check Console tab
5. Check Network tab → Filter by WS (WebSocket)

**Expected:**
- ✅ No "WebSocket not available: The operation is insecure" errors
- ✅ WebSocket connections use `wss://` (not `ws://`)
- ✅ Supabase realtime connections work

**Verify WebSocket Protocol:**
- Network tab → Filter by WS
- Look for connections to `your-project.supabase.co/realtime`
- URL should start with `wss://` ✅
- URL should NOT start with `ws://` ❌

### 3. Functionality Tests

**Shoutbox (EventSource):**
- ✅ Post a message → appears immediately
- ✅ Network tab shows `/api/shout/stream` connection active
- ✅ No connection errors in console

**Pro Status (Supabase Realtime):**
- ✅ Pro status displays correctly
- ✅ If admin toggles Pro status, updates in real-time (if subscription working)
- ✅ Console shows: `[useProStatus] Realtime subscription active` or `[ProContext] Realtime subscription active`

## Analytics Events to Monitor (PostHog)

### Event: `connection_protocol_mismatch`

**When it fires:**
- Startup check detects `http://` URL on `https://` page

**Key Properties:**
- `page_protocol`: Should be `"https:"`
- `supabase_url_protocol`: Should be `"https:"` (not `"http:"`)
- `is_ios`: `true` for iOS devices
- `issues`: Description of the mismatch

**What to do if you see this:**
1. Check production environment variables
2. Verify `NEXT_PUBLIC_SUPABASE_URL` is set correctly
3. Redeploy if needed

**PostHog Filter:**
```
Event: connection_protocol_mismatch
Filter by: is_ios = true (to see iOS-specific issues)
```

### Event: `websocket_connection_error`

**When it fires:**
- Runtime error handler catches WebSocket/mixed content errors
- Only fires once per session (throttled)

**Key Properties:**
- `error_message`: Sanitized error message (no tokens/secrets)
- `page_protocol`: Page protocol (`"https:"` or `"http:"`)
- `is_ios`: `true` for iOS devices
- `error_type`: `"unhandled_rejection"` or error name
- `supabase_url_protocol`: Supabase URL protocol (if available)
- `supabase_url_sanitized`: Sanitized URL (no query/hash/auth)

**What to do if you see this:**
1. Check `error_message` for clues
2. Check `supabase_url_protocol` - should be `"https:"`
3. Check `page_protocol` - should be `"https:"`
4. Filter by `is_ios = true` to see iOS-specific issues

**PostHog Filter:**
```
Event: websocket_connection_error
Filter by: is_ios = true
Group by: page_protocol, supabase_url_protocol
```

### Event: `connection_error` (from secure-connections.ts)

**When it fires:**
- EventSource or Supabase realtime connection fails
- Throttled to once per error type per session

**Key Properties:**
- `error_type`: `"eventsource"` or `"supabase-realtime"`
- `error_message`: Error message
- `platform`: `"ios"` or `"other"`
- `page_protocol`: Page protocol

**PostHog Filter:**
```
Event: connection_error
Filter by: platform = ios
Group by: error_type
```

## Monitoring Dashboard Setup

**Recommended PostHog Dashboard:**

1. **Connection Health Overview**
   - Chart: Count of `websocket_connection_error` events
   - Breakdown by: `is_ios`, `page_protocol`
   - Time range: Last 7 days

2. **Protocol Mismatch Detection**
   - Chart: Count of `connection_protocol_mismatch` events
   - Breakdown by: `supabase_url_protocol`
   - Alert if > 0 events (should never happen in production)

3. **iOS-Specific Issues**
   - Filter: `is_ios = true`
   - Events: `websocket_connection_error`, `connection_error`
   - Breakdown by: `error_message`, `page_protocol`

## Manual Verification Steps

### Quick Check (30 seconds)
1. Open production site in browser
2. Open Console (F12)
3. Type: `process.env.NEXT_PUBLIC_SUPABASE_URL`
4. Verify it starts with `https://`

### Full Check (5 minutes)
1. Follow "iOS Safari Test" steps above
2. Check Network tab for WebSocket connections
3. Verify `wss://` protocol
4. Check PostHog for `connection_protocol_mismatch` events (should be 0)

## Troubleshooting

### Issue: Still seeing WebSocket errors

**Check:**
1. Environment variable in hosting platform
2. Redeploy after changing env vars (env vars are embedded at build time)
3. Clear browser cache / hard refresh
4. Check PostHog for `connection_protocol_mismatch` events

### Issue: No analytics events appearing

**Check:**
1. PostHog is initialized correctly
2. Cookie consent is granted (if required)
3. Check browser console for PostHog errors
4. Events are throttled - check sessionStorage to verify check ran

### Issue: False positives in analytics

**Check:**
1. Ensure `NEXT_PUBLIC_SUPABASE_URL` is set correctly
2. Check if URL upgrade is happening (shouldn't in production)
3. Review `supabase_url_sanitized` in events to verify URL format
