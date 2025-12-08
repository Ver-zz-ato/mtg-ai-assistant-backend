# PostHog Web Vitals Audit Report

**Date**: January 27, 2025  
**Scope**: Web Vitals naming consistency & consent → initWebVitals flow verification

---

## 1. WEB VITALS NAMING SCHEME

### Detected Naming Scheme

**Current Implementation**: `lib/analytics/webVitals.ts`

```typescript
capture(`${AnalyticsEvents.WEB_VITAL}_${metric.name}`, { ... });
```

Where:
- `AnalyticsEvents.WEB_VITAL` = `'web_vital'`
- `metric.name` comes from `web-vitals` library (uppercase)

### Exact Event Names Generated

| Metric | Event Name | Source |
|--------|------------|--------|
| CLS (Cumulative Layout Shift) | `web_vital_CLS` | `onCLS(sendToPostHog)` |
| FCP (First Contentful Paint) | `web_vital_FCP` | `onFCP(sendToPostHog)` |
| FID (First Input Delay) | `web_vital_FID` | `onFID(sendToPostHog)` |
| INP (Interaction to Next Paint) | `web_vital_INP` | `onINP(sendToPostHog)` |
| LCP (Largest Contentful Paint) | `web_vital_LCP` | `onLCP(sendToPostHog)` |
| TTFB (Time to First Byte) | `web_vital_TTFB` | `onTTFB(sendToPostHog)` |

### Naming Consistency Analysis

✅ **CONSISTENT**: All events follow the pattern `web_vital_{METRIC_NAME}`

- All use uppercase metric names (CLS, FCP, FID, INP, LCP, TTFB)
- All use underscore separator
- All use lowercase prefix `web_vital`
- Single source of truth: `lib/analytics/webVitals.ts`

### Other Files Emitting Web Vitals

**Search Results**: 
- ❌ **NONE FOUND** - Only `lib/analytics/webVitals.ts` emits web vitals events
- No other files call `capture()` with web vitals event names
- No other files import or use `onCLS`, `onFCP`, `onFID`, `onINP`, `onLCP`, `onTTFB`

**Conclusion**: ✅ **No naming inconsistencies detected**

---

## 2. CONSENT → initWebVitals FLOW VERIFICATION

### Current Flow Analysis

**File**: `frontend/components/Providers.tsx`

```typescript
const maybeInit = () => {
  if (!hasConsent()) return;                    // ✅ Consent check
  initPosthogIfNeeded();                        // ✅ PostHog init
  
  setTimeout(() => {
    initWebVitals();                            // ⚠️ 100ms delay
  }, 100);
  
  // ... app_open event
};
```

### Flow Verification

#### ✅ Consent Check: PASS
- `maybeInit()` checks `hasConsent()` before proceeding
- `initWebVitals()` is only called if consent is granted
- **Status**: ✅ **CORRECT**

#### ⚠️ PostHog Initialization: POTENTIAL ISSUE
- `initPosthogIfNeeded()` calls `posthog.init()` synchronously
- `posthog.init()` is **asynchronous** but doesn't return a promise
- 100ms `setTimeout` is used to wait for PostHog to be ready
- **Problem**: 100ms might not be enough for PostHog to fully initialize
- **Risk**: Web vitals could start firing before PostHog is ready

#### ✅ Capture() Safety: PASS
- `capture()` in `lib/ph.ts` uses optional chaining: `window.posthog?.capture?.()`
- If PostHog isn't ready, it safely no-ops (won't crash)
- **However**: Events fired before PostHog is ready will be **silently lost**

### Execution Flow Diagram

```
User loads page
  ↓
Providers.tsx useEffect runs
  ↓
setTimeout(maybeInit, 1500ms) [deferred init]
  ↓
User grants consent OR timeout fires
  ↓
maybeInit() called
  ↓
hasConsent() check → ✅ PASS
  ↓
initPosthogIfNeeded()
  ├─ posthog.init() called (ASYNC, no promise returned)
  └─ posthog._loaded flag set (eventually)
  ↓
setTimeout(initWebVitals, 100ms) [⚠️ TIMING RISK]
  ↓
initWebVitals() called
  ├─ Registers onCLS, onFCP, onFID, onINP, onLCP, onTTFB
  └─ Web vitals start firing (may fire before PostHog ready)
  ↓
Web vitals metrics collected
  ↓
sendToPostHog() called
  ↓
capture() called
  ├─ hasConsent() check → ✅ PASS
  ├─ window.posthog?.capture?.() called
  └─ ⚠️ If PostHog not ready: event silently lost
```

### Violations Detected

#### 🚨 VIOLATION 1: Timing Risk

**Issue**: `initWebVitals()` is called with only 100ms delay after `posthog.init()`

**Problem**:
- `posthog.init()` is asynchronous but doesn't return a promise
- PostHog initialization involves:
  - Loading SDK
  - Setting up event queue
  - Connecting to API
  - Setting `_loaded` flag
- 100ms may not be sufficient, especially on slow networks

**Evidence**:
```typescript
// Providers.tsx line 67-73
initPosthogIfNeeded();  // Async init, no promise
setTimeout(() => {
  initWebVitals();      // ⚠️ May fire before PostHog ready
}, 100);
```

**Impact**:
- Web vitals events may be lost if they fire before PostHog is ready
- No error thrown (silent failure)
- Metrics may be incomplete in PostHog dashboard

#### ⚠️ VIOLATION 2: No Explicit Readiness Check

**Issue**: No verification that PostHog is actually ready before calling `initWebVitals()`

**Current Code**:
- Checks `posthog._loaded` to avoid re-initialization
- But doesn't wait for `_loaded` to be true before calling `initWebVitals()`
- Relies on arbitrary 100ms timeout

**Impact**:
- Race condition possible
- Web vitals may start tracking before PostHog can receive events

---

## 3. FIX RECOMMENDATIONS

### Fix 1: Wait for PostHog Readiness

**Problem**: 100ms timeout is arbitrary and may not be enough

**Solution**: Poll for PostHog readiness or use a callback

**Recommended Patch**:

```diff
--- a/frontend/components/Providers.tsx
+++ b/frontend/components/Providers.tsx
@@ -64,11 +64,30 @@ function initPosthogIfNeeded() {
   }
 }
 
+/**
+ * Wait for PostHog to be fully initialized before proceeding
+ * Polls posthog._loaded flag with exponential backoff
+ */
+function waitForPostHogReady(maxWaitMs = 5000): Promise<void> {
+  return new Promise((resolve) => {
+    const startTime = Date.now();
+    const checkReady = () => {
+      const ph: any = posthog as any;
+      if (ph?._loaded || Date.now() - startTime > maxWaitMs) {
+        resolve();
+        return;
+      }
+      setTimeout(checkReady, 50); // Check every 50ms
+    };
+    checkReady();
+  });
+}
+
 export default function Providers({ children }: { children: React.ReactNode }) {
   React.useEffect(() => {
     if (typeof window === 'undefined') return; // guard: never run on the server
 
     // Initialize analytics only with consent; re-check when consent is granted
-    const maybeInit = () => {
+    const maybeInit = async () => {
       if (!hasConsent()) return;
       initPosthogIfNeeded();
       
-      // Initialize Web Vitals tracking after PostHog is ready
-      // Use a small delay to ensure PostHog is fully initialized
-      setTimeout(() => {
+      // Wait for PostHog to be fully initialized
+      await waitForPostHogReady();
+      
+      // Initialize Web Vitals tracking after PostHog is confirmed ready
+      if (hasConsent()) { // Re-check consent (user might have declined while waiting)
         initWebVitals();
-      }, 100);
+      }
       
       try {
         if (!sessionStorage.getItem('analytics:app_open_sent')) {
```

### Fix 2: Add PostHog Readiness Check in initWebVitals

**Problem**: `initWebVitals()` doesn't verify PostHog is ready before registering callbacks

**Solution**: Add a readiness check at the start of `initWebVitals()`

**Recommended Patch**:

```diff
--- a/frontend/lib/analytics/webVitals.ts
+++ b/frontend/lib/analytics/webVitals.ts
@@ -34,6 +34,20 @@ let initialized = false;
 
 /**
  * Initialize Web Vitals tracking
  * 
  * Should be called once after PostHog is initialized and consent is granted.
  * Safe to call multiple times (will only initialize once).
+ * 
+ * @throws Will not throw, but will not initialize if PostHog is not ready
  */
 export function initWebVitals() {
   if (typeof window === 'undefined' || initialized) return;
+  
+  // Verify PostHog is ready before registering web vitals callbacks
+  const ph: any = (typeof window !== 'undefined' && (window as any).posthog) || null;
+  if (!ph?._loaded) {
+    // PostHog not ready yet - defer initialization
+    // This should not happen if called from Providers.tsx after waitForPostHogReady()
+    // But provides safety if called from elsewhere
+    if (process.env.NODE_ENV === 'development') {
+      console.warn('[webVitals] PostHog not ready, deferring initialization');
+    }
+    setTimeout(() => {
+      if (!initialized) initWebVitals(); // Retry once
+    }, 200);
+    return;
+  }
+  
   initialized = true;
```

### Fix 3: Enhanced capture() with Readiness Check (Optional)

**Problem**: `capture()` doesn't explicitly check PostHog readiness

**Current Behavior**: Uses optional chaining, silently no-ops if PostHog not ready

**Recommendation**: This is acceptable (silent no-op is safe), but we could add a warning in dev mode

**Optional Patch**:

```diff
--- a/frontend/lib/ph.ts
+++ b/frontend/lib/ph.ts
@@ -43,7 +43,15 @@ export function capture(event: string, props?: Props): void {
   if (!hasWindow() || !hasConsent()) return;
   try {
     // @ts-ignore - posthog is attached globally by the provider init
-    window.posthog?.capture?.(event, props);
+    const ph = (window as any).posthog;
+    if (!ph?._loaded) {
+      if (process.env.NODE_ENV === 'development') {
+        console.warn('[analytics] PostHog not ready, event dropped:', event);
+      }
+      return; // PostHog not ready, drop event
+    }
+    ph.capture(event, props);
     if (process.env.NODE_ENV === 'development') {
       // eslint-disable-next-line no-console
       console.debug('[analytics] %s', event, props ?? {});
```

**Note**: This is optional - current behavior (silent no-op) is acceptable, but explicit check provides better debugging.

---

## 4. SUMMARY

### Naming Scheme: ✅ PASS

- **Status**: Consistent
- **Pattern**: `web_vital_{METRIC_NAME}` (e.g., `web_vital_LCP`, `web_vital_CLS`)
- **Source**: Single file (`lib/analytics/webVitals.ts`)
- **No inconsistencies found**

### Consent Flow: ⚠️ NEEDS IMPROVEMENT

- **Consent Check**: ✅ Correct (checked before initWebVitals)
- **PostHog Init**: ✅ Correct (called before initWebVitals)
- **Timing**: ⚠️ **RISK** - 100ms may not be enough
- **Readiness Check**: ❌ **MISSING** - No explicit verification

### Violations

1. 🚨 **Timing Risk**: `initWebVitals()` called with only 100ms delay after `posthog.init()`
2. ⚠️ **No Readiness Check**: No explicit verification that PostHog is ready

### Recommended Fixes

1. **CRITICAL**: Replace 100ms timeout with `waitForPostHogReady()` polling function
2. **RECOMMENDED**: Add PostHog readiness check in `initWebVitals()`
3. **OPTIONAL**: Add readiness check in `capture()` for better debugging

### Priority

- **High**: Fix 1 (waitForPostHogReady) - Prevents lost web vitals events
- **Medium**: Fix 2 (readiness check in initWebVitals) - Safety net
- **Low**: Fix 3 (readiness check in capture) - Better debugging only

---

## 5. TESTING RECOMMENDATIONS

After applying fixes, verify:

1. **PostHog Readiness**:
   - Check Network tab - PostHog requests should appear before web vitals events
   - Verify `posthog._loaded` is `true` when `initWebVitals()` is called

2. **Web Vitals Events**:
   - Check PostHog dashboard for `web_vital_*` events
   - Verify all 6 metrics appear (CLS, FCP, FID, INP, LCP, TTFB)
   - Verify events are not lost (compare with browser DevTools Performance tab)

3. **Timing**:
   - Test on slow network (throttle to 3G)
   - Verify web vitals still fire correctly
   - Check console for any warnings

4. **Consent Flow**:
   - Test with consent declined → web vitals should not initialize
   - Test with consent granted → web vitals should initialize after PostHog ready

---

**Report Status**: ✅ Complete - Awaiting confirmation before applying fixes


