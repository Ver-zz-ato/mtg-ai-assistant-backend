# Connection Sanity Check - Implementation Summary

## Overview

Self-reporting system to detect and diagnose WebSocket connection errors, especially "WebSocket not available: The operation is insecure" on iOS Safari. Runs once per session and reports issues to analytics.

## Files Changed

### 1. `frontend/lib/connection-sanity-check.ts` (NEW)
**Purpose**: Core sanity check system with startup checks and runtime error hooks.

**Key Functions**:
- `sanitizeUrl()` - Removes query string, hash, and auth tokens from URLs
- `checkProtocolMismatch()` - Detects protocol mismatches (http:// on https:// page)
- `runStartupSanityCheck()` - Runs once per session, checks env vars
- `setupRuntimeErrorHooks()` - Catches WebSocket/mixed content errors at runtime
- `initConnectionSanityCheck()` - Main entry point that runs both checks

**Features**:
- ✅ SessionStorage-based throttling (once per session)
- ✅ Comprehensive diagnostics (protocol, user agent, iOS detection, app version)
- ✅ Privacy-safe URL sanitization
- ✅ Analytics reporting (PostHog)
- ✅ Graceful fallbacks if sessionStorage/analytics unavailable

### 2. `frontend/components/SecureConnectionsGuard.tsx`
**Change**: Updated to use `initConnectionSanityCheck()` instead of old guard

**Impact**: Now runs comprehensive startup check + runtime error hooks

### 3. `frontend/lib/secure-connections-guard.ts`
**Change**: Deprecated in favor of `connection-sanity-check.ts`, kept for backward compatibility

### 4. `frontend/lib/connection-sanity-check.test.ts` (NEW)
**Purpose**: Unit tests for URL sanitization and protocol mismatch detection

**Tests**:
- `sanitizeUrl()` - Removes query/hash/auth correctly
- `checkProtocolMismatch()` - Detects mismatches correctly

### 5. `docs/connection-sanity-check-qa.md` (NEW)
**Purpose**: QA checklist and monitoring guide

## Key Code Snippets

### Startup Check (runs once per session)

```typescript
export function runStartupSanityCheck(): void {
  // Check sessionStorage to ensure once per session
  if (sessionStorage.getItem(STORAGE_KEY_STARTUP_CHECK) === 'true') {
    return; // Already checked
  }
  sessionStorage.setItem(STORAGE_KEY_STARTUP_CHECK, 'true');
  
  // Check NEXT_PUBLIC_SUPABASE_URL protocol vs page protocol
  const pageProtocol = window.location.protocol;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  
  if (supabaseUrl) {
    const urlObj = new URL(supabaseUrl);
    if (checkProtocolMismatch(urlObj.protocol, pageProtocol)) {
      // Report to analytics
      capture('connection_protocol_mismatch', {
        page_protocol: pageProtocol,
        supabase_url_protocol: urlObj.protocol,
        is_ios: isIOS(),
        // ... more diagnostics
      });
    }
  }
}
```

### Runtime Error Hooks (catch WebSocket errors)

```typescript
export function setupRuntimeErrorHooks(): () => void {
  // Track if error already logged this session
  let errorLogged = sessionStorage.getItem(STORAGE_KEY_ERROR_LOGGED) === 'true';
  
  const handleError = (event: ErrorEvent) => {
    const message = event.message.toLowerCase();
    const isWebSocketError = 
      message.includes('websocket') ||
      message.includes('operation is insecure') ||
      message.includes('mixed content');
    
    if (!isWebSocketError || errorLogged) return;
    
    errorLogged = true;
    sessionStorage.setItem(STORAGE_KEY_ERROR_LOGGED, 'true');
    
    // Report to analytics with diagnostics
    capture('websocket_connection_error', {
      error_message: event.message.substring(0, 200),
      page_protocol: window.location.protocol,
      is_ios: isIOS(),
      // ... more diagnostics
    });
  };
  
  window.addEventListener('error', handleError, true);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);
  
  return cleanup; // Return cleanup function
}
```

### URL Sanitization (privacy-safe)

```typescript
export function sanitizeUrl(url: string): string {
  const urlObj = new URL(url);
  // Remove auth credentials
  urlObj.username = '';
  urlObj.password = '';
  // Remove query and hash
  urlObj.search = '';
  urlObj.hash = '';
  return urlObj.toString();
}
```

## Analytics Events

### Event: `connection_protocol_mismatch`

**Fires**: Once per session when startup check detects protocol mismatch

**Properties**:
- `page_protocol`: `"https:"` or `"http:"`
- `supabase_url_protocol`: `"https:"` or `"http:"`
- `supabase_url_host`: Hostname (sanitized)
- `is_ios`: `true` or `false`
- `user_agent`: User agent string
- `timestamp`: ISO timestamp
- `issues`: Description of mismatch
- `app_version`: App version (if `NEXT_PUBLIC_APP_VERSION` set)
- `commit_sha`: Short commit SHA (if `NEXT_PUBLIC_COMMIT_SHA` set)

**PostHog Filter**:
```
Event: connection_protocol_mismatch
Filter: is_ios = true
```

### Event: `websocket_connection_error`

**Fires**: Once per session when runtime error handler catches WebSocket/mixed content error

**Properties**:
- `error_message`: Sanitized error message (max 200 chars)
- `error_source`: Source file/URL (if available)
- `error_type`: Error type/name
- `error_stack`: Stack trace (max 500 chars)
- `page_protocol`: Page protocol
- `is_ios`: `true` or `false`
- `user_agent`: User agent string
- `supabase_url_protocol`: Supabase URL protocol (if available)
- `supabase_url_sanitized`: Sanitized Supabase URL (if available)
- `timestamp`: ISO timestamp
- `app_version`: App version (if available)
- `commit_sha`: Short commit SHA (if available)

**PostHog Filter**:
```
Event: websocket_connection_error
Filter: is_ios = true
Group by: page_protocol, supabase_url_protocol
```

## How to Verify via PostHog

### 1. Check for Protocol Mismatches

**Query**:
```
Event: connection_protocol_mismatch
Time range: Last 7 days
Filter: is_ios = true
```

**Expected**: 0 events (no mismatches in production)

**If > 0 events**:
- Check `supabase_url_protocol` - should be `"https:"`
- Check `page_protocol` - should be `"https:"`
- Fix environment variable and redeploy

### 2. Monitor WebSocket Errors

**Query**:
```
Event: websocket_connection_error
Time range: Last 7 days
Filter: is_ios = true
Breakdown: page_protocol, supabase_url_protocol
```

**Expected**: 0 events (no WebSocket errors)

**If > 0 events**:
- Check `error_message` for details
- Check `supabase_url_protocol` - should be `"https:"`
- Check `page_protocol` - should be `"https:"`
- Review error stack trace for root cause

### 3. Create Dashboard

**Recommended PostHog Dashboard**:

1. **Connection Health**
   - Metric: Count of `websocket_connection_error`
   - Filter: `is_ios = true`
   - Breakdown: `page_protocol`
   - Alert if > 0

2. **Protocol Mismatch Detection**
   - Metric: Count of `connection_protocol_mismatch`
   - Alert if > 0 (should never happen)

3. **Error Trends**
   - Metric: Count of `websocket_connection_error`
   - Filter: `is_ios = true`
   - Breakdown: `error_message` (first 50 chars)
   - Time series chart

## Testing

### Unit Tests

Run tests for URL sanitization and protocol checking:
```bash
npm test lib/connection-sanity-check.test.ts
```

### Manual Testing

1. **Test URL Sanitization**:
   ```javascript
   // In browser console
   import { sanitizeUrl } from '@/lib/connection-sanity-check';
   sanitizeUrl('https://user:pass@example.com/path?query=value#hash');
   // Should return: 'https://example.com/path'
   ```

2. **Test Protocol Mismatch Detection**:
   ```javascript
   import { checkProtocolMismatch } from '@/lib/connection-sanity-check';
   checkProtocolMismatch('http:', 'https:'); // Should return true
   checkProtocolMismatch('https:', 'https:'); // Should return false
   ```

3. **Test in Production**:
   - Open site on iOS Safari
   - Check PostHog for events
   - Verify no `connection_protocol_mismatch` events
   - Verify no `websocket_connection_error` events

## Privacy & Security

✅ **No Secrets Logged**:
- URLs are sanitized (query/hash/auth removed)
- Error messages limited to 200 chars
- Stack traces limited to 500 chars
- No user data or tokens in events

✅ **Session-Based Throttling**:
- Startup check runs once per session
- Error logging runs once per session
- Prevents analytics spam

✅ **Graceful Degradation**:
- Works even if sessionStorage unavailable
- Works even if PostHog unavailable
- Never breaks the app if checks fail
