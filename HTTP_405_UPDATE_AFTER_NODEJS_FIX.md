# HTTP 405 Still Persisting After nodejs Runtime Fix - Update Report

## Date: 2025-10-27
## Status: STILL FAILING (405 on POST)

---

## What We Just Tried (Based on External Dev Diagnosis)

### External Developer's Diagnosis
The external developer identified the root cause as:
- Routes were set to `runtime = "edge"`
- Edge Functions cannot run long jobs (3-10 minutes)
- Vercel strips POST handlers from Edge Functions, keeping only GET/OPTIONS
- Local dev server uses Node.js, so POST works locally
- Solution: Switch to `runtime = "nodejs"` with `maxDuration = 600`

### Changes We Made
We implemented exactly what was recommended:

#### 1. Changed All 3 Routes from Edge to Node.js Runtime

**Files Modified:**
- `frontend/app/api/cron/bulk-scryfall/route.ts`
- `frontend/app/api/cron/bulk-price-import/route.ts`
- `frontend/app/api/admin/price/snapshot/bulk/route.ts`

**Change Applied:**
```typescript
// BEFORE (Edge runtime)
export const runtime = "edge";
export const dynamic = 'force-dynamic';
// Note: maxDuration not supported on edge runtime

// AFTER (Node.js runtime)
export const runtime = "nodejs";
export const dynamic = 'force-dynamic';
export const maxDuration = 600; // Allowed on Pro Node runtime for 10-min jobs
```

All OPTIONS, GET, and POST handlers remain unchanged.

#### 2. Fixed Middleware Path Parsing

**File:** `frontend/middleware.ts`

**Change Applied:**
```typescript
// BEFORE
const path = url.pathname;

// AFTER
const path = req.nextUrl.pathname;
```

### Deployment
- Committed: `git commit -m "Fix HTTP 405: Switch bulk routes from edge to nodejs runtime and fix middleware path parsing"`
- Pushed to main: `git push origin main`
- Vercel deployment completed successfully
- Build logs show routes present: `ƒ /api/cron/bulk-scryfall` (etc.)

---

## Test Results After Fix

### Test Commands
```powershell
$headers = @{
    "x-cron-key" = "Boobies"
    "Content-Type" = "application/json"
}

# Test 1: bulk-scryfall
Invoke-WebRequest -Uri "https://www.manatap.ai/api/cron/bulk-scryfall" -Method POST -Headers $headers

# Test 2: bulk-price-import
Invoke-WebRequest -Uri "https://www.manatap.ai/api/cron/bulk-price-import" -Method POST -Headers $headers

# Test 3: price snapshot bulk
Invoke-WebRequest -Uri "https://www.manatap.ai/api/admin/price/snapshot/bulk" -Method POST -Headers $headers
```

### Results
**ALL THREE STILL RETURN 405 METHOD NOT ALLOWED**

```
Invoke-WebRequest : The remote server returned an error: (405) Method Not Allowed.
```

---

## Current Code State

### Route File Structure (All 3 Routes)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';
export const maxDuration = 600; // Allowed on Pro Node runtime for 10-min jobs

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Allow': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-cron-key',
    },
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Bulk Scryfall Import API",
    method: "Use POST with x-cron-key header to trigger import",
    status: "Ready"
  });
}

export async function POST(req: NextRequest) {
  console.log("🔥 Bulk import endpoint called");
  
  let actor: string | null = null;
  
  try {
    const cronKey = process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || "";
    const hdr = req.headers.get("x-cron-key") || "";
    console.log("🔑 Auth check - cronKey exists:", !!cronKey, "header exists:", !!hdr);

    let useAdmin = false;

    if (cronKey && hdr === cronKey) {
      useAdmin = true;
      actor = 'cron';
      console.log("✅ Cron key auth successful");
    } else {
      console.log("🔍 Trying user auth...");
      // ... auth logic ...
    }
    
    // ... bulk import logic ...
  } catch (error) {
    // ... error handling ...
  }
}
```

### Middleware (Fixed)

```typescript
export const config = {
  matcher: ['/api/:path*'],
};

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  
  const supabase = createMiddlewareClient({ req, res });
  await supabase.auth.getSession();

  const method = req.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const url = new URL(req.url);
    const path = req.nextUrl.pathname; // FIXED: was req.pathname
    // EXPLICITLY ALLOWS /api/cron routes
    if (!(path.startsWith('/api/admin') || path.startsWith('/api/health') || path.startsWith('/api/config') || path.startsWith('/api/cron'))) {
      // Maintenance mode check
    }
  }

  return res;
}
```

---

## Verification Steps Taken

### 1. GET Still Works ✅
```powershell
Invoke-WebRequest -Uri "https://www.manatap.ai/api/cron/bulk-scryfall" -Method GET
# Returns: 200 OK with info message
```

### 2. Build Succeeded ✅
```
✓ Compiled successfully in 63s
Route (app)                                  Size  First Load JS
├ ƒ /api/cron/bulk-price-import             790 B         279 kB
├ ƒ /api/cron/bulk-scryfall                 789 B         279 kB
├ ƒ /api/admin/price/snapshot/bulk          791 B         279 kB
ƒ Middleware                               136 kB
```

### 3. Routes Are Deployed ✅
Vercel shows these routes in the deployment with `ƒ` symbol (serverless functions).

### 4. Local Testing Works ✅
Running `npm run dev` locally, POST requests work perfectly on `localhost:3000`.

---

## What's Different from Working Routes?

### Working Route: `/api/decks/create/route.ts`
```typescript
// No runtime export
// No dynamic export
// No OPTIONS handler
// No GET handler
// Just:
export async function POST(req: NextRequest) {
  // ... logic ...
}
```

**Result:** Works perfectly in production ✅

### Failing Routes: Bulk import routes
```typescript
export const runtime = "nodejs";
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

export async function OPTIONS() { /* ... */ }
export async function GET() { /* ... */ }
export async function POST(req: NextRequest) { /* ... */ }
```

**Result:** 405 on POST in production ❌

---

## Configuration Files

### `vercel.json`
```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-price-cache",
      "schedule": "0 4 * * *"
    }
  ]
}
```

No functions config. No special route configurations.

### `next.config.ts`
Standard Next.js config with:
- Image optimization for Scryfall domains
- CSP headers
- PostHog rewrites

No API route modifications or redirects.

### Vercel Project Settings
- **Plan:** Pro
- **Function Max Duration:** 600 seconds ✅
- **Function Regions:** Europe (thr1), North America (iad1)
- **Function CPU:** Standard (1 vCPU, 2 GB Memory)
- **Fluid Compute:** Enabled

---

## Complete Timeline of Attempts

### Attempt 1: Added GET Handler
**Result:** GET works, POST still 405

### Attempt 2: Added OPTIONS Handler
**Result:** OPTIONS returns 200, POST still 405

### Attempt 3: Added `force-dynamic`
**Result:** POST still 405

### Attempt 4: Changed to Edge Runtime
**Hypothesis:** Edge network handles methods differently
**Result:** POST still 405

### Attempt 5: Removed `maxDuration` from Edge
**Hypothesis:** Invalid config causing rejection
**Result:** POST still 405

### Attempt 6: Switched to Node.js Runtime (CURRENT)
**Hypothesis:** Edge strips POST, nodejs should support it
**Expected:** POST should work
**Actual Result:** POST STILL 405 ❌

---

## Key Mystery

**Why does POST still fail after switching to nodejs runtime?**

The external dev's diagnosis made perfect sense:
- Edge Functions can't run long jobs
- Vercel strips POST from Edge Functions
- Solution: Use nodejs runtime

**But we're now using nodejs runtime and POST is STILL 405.**

This suggests either:
1. There's another layer of configuration blocking POST
2. Vercel is still treating these as Edge Functions despite `runtime = "nodejs"`
3. The `maxDuration`, `dynamic`, `OPTIONS`, or `GET` exports are interfering
4. There's a Vercel project setting or security feature blocking these specific routes
5. Something about the route pattern `/api/cron/*` or `/api/admin/price/snapshot/bulk` is special
6. The deployment isn't actually using the new code (cache issue)

---

## What We Know for Certain

✅ **Local Development:** POST works perfectly
✅ **Production GET:** Works perfectly
✅ **Production OPTIONS:** Returns 200 with proper headers
✅ **Build Process:** Succeeds, routes are present
✅ **Middleware:** Explicitly allows `/api/cron` POST requests
✅ **Other POST Routes:** Work fine in production (`/api/decks/create`, etc.)
✅ **Runtime Config:** Now set to `nodejs` (as recommended)
❌ **Production POST:** Returns 405 consistently

---

## Request for Further Diagnosis

**Question:** After switching from `edge` to `nodejs` runtime with `maxDuration = 600`, why does POST still return 405 when:
- The POST handler is clearly defined in code
- GET and OPTIONS work for the same route
- Local development POST works
- Other simpler POST routes work in production
- The build succeeds and deploys the route

**Is there:**
- A Vercel caching issue preventing the new nodejs config from taking effect?
- A conflict between having OPTIONS + GET + POST in the same route file with runtime exports?
- A Next.js 15 App Router bug with `maxDuration` + `dynamic` + multiple HTTP methods?
- A hidden Vercel Pro setting that needs adjustment?
- Something else we're missing?

---

## Full Route File Example (bulk-scryfall)

Located at: `frontend/app/api/cron/bulk-scryfall/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Allow': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-cron-key',
    },
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Bulk Scryfall Import API",
    method: "Use POST with x-cron-key header to trigger import",
    status: "Ready"
  });
}

export async function POST(req: NextRequest) {
  console.log("🔥 Bulk import endpoint called");
  
  let actor: string | null = null;
  
  try {
    const cronKey = process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || "";
    const hdr = req.headers.get("x-cron-key") || "";
    console.log("🔑 Auth check - cronKey exists:", !!cronKey, "header exists:", !!hdr);

    let useAdmin = false;

    if (cronKey && hdr === cronKey) {
      useAdmin = true;
      actor = 'cron';
      console.log("✅ Cron key auth successful");
    } else {
      console.log("🔍 Trying user auth...");
      try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user && isAdmin(user)) {
          useAdmin = true;
          actor = user.id as string;
          console.log("✅ Admin user auth successful");
        }
      } catch (authError: any) {
        console.log("❌ User auth failed:", authError.message);
      }
    }

    if (!useAdmin) {
      console.log("❌ Authorization failed");
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    console.log("🚀 Authorization successful, starting import...");
    console.log("🚀 Starting bulk Scryfall import...");
    
    const useStreaming = true;
    console.log("🌊 Using streaming mode:", useStreaming);

    // ... rest of bulk import logic (3-10 minutes of work) ...
    
  } catch (error: any) {
    console.error("❌ Bulk import failed:", error);
    return NextResponse.json({
      ok: false,
      error: error.message || "bulk import failed"
    }, { status: 500 });
  }
}

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || '').split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || '').split(/[\s,]+/).filter(Boolean).map(s=>s.toLowerCase());
  const uid = String(user?.id || '');
  const email = String(user?.email || '').toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}
```

---

## Environment Details

- **Next.js:** 15.5.2
- **Vercel Plan:** Pro
- **Node.js Version:** (whatever Vercel Pro nodejs runtime uses)
- **Database:** Supabase (external, not Vercel-hosted)
- **Expected Runtime:** 3-10 minutes per job
- **Actual Timeout Setting:** 600 seconds (10 minutes)

---

## Next Steps / Questions

1. Should we try removing ALL exports except POST to match working routes?
2. Is there a way to verify what Vercel actually deployed (inspect the serverless function)?
3. Could there be a Vercel Pro security setting blocking long POST requests?
4. Should we try deploying to a different hosting provider to isolate if it's Vercel-specific?
5. Is there a Next.js 15 regression with multiple HTTP method exports + runtime config?

---

**End of Update Report**
**Date:** 2025-10-27
**Status:** Awaiting further diagnosis - nodejs runtime fix did not resolve 405 errors

