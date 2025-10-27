# HTTP 405 Complete Investigation & Handover for External Diagnosis

## Date: 2025-10-27
## Status: CRITICAL - ALL ATTEMPTS FAILED

---

## The Core Problem

Three Next.js API routes consistently return **HTTP 405 Method Not Allowed** for POST requests in Vercel production, but work perfectly locally.

**Current Routes:**
- `https://www.manatap.ai/api/bulk-jobs/scryfall-import` (POST → 405)
- `https://www.manatap.ai/api/bulk-jobs/price-import` (POST → 405)
- `https://www.manatap.ai/api/bulk-jobs/price-snapshot` (POST → 405)

**What Works:**
- ✅ GET requests to these routes return 200 with info messages
- ✅ OPTIONS requests return 200 with proper CORS headers
- ✅ POST requests work perfectly on localhost (both dev and production build)
- ✅ Other simple POST routes work fine in production (`/api/decks/create`, etc.)

**What Doesn't Work:**
- ❌ POST requests in Vercel production return 405
- ❌ GitHub Actions trying to trigger these jobs fail with 405

---

## Complete Chronological List of Attempts

### Attempt 1: Added GET Handler
**Hypothesis:** Route might not be recognized by Vercel  
**Action:** Added `export async function GET()` returning info message  
**Result:** GET works, POST still 405 ❌

### Attempt 2: Added OPTIONS Handler
**Hypothesis:** CORS or method negotiation issue  
**Action:** Added `export async function OPTIONS()` with explicit `Allow: GET, POST, OPTIONS` headers  
**Result:** OPTIONS returns 200, POST still 405 ❌

### Attempt 3: Added `export const dynamic = 'force-dynamic'`
**Hypothesis:** Static optimization causing deployment issue  
**Action:** Forced dynamic rendering  
**Result:** POST still 405 ❌

### Attempt 4: Changed Runtime to Edge
**Hypothesis:** Edge network handles HTTP methods differently  
**Action:** `export const runtime = "edge"`  
**Result:** POST still 405 ❌

### Attempt 5: Removed `maxDuration` from Edge
**Hypothesis:** Invalid config causing route rejection  
**Action:** Removed `export const maxDuration = 600` (not supported on edge anyway)  
**Result:** POST still 405 ❌

### Attempt 6: Switched to Node.js Runtime (Per External Dev #1)
**Hypothesis:** Edge Functions strip POST handlers for long-running jobs  
**Action:** `export const runtime = "nodejs"` + `maxDuration = 600`  
**Result:** POST still 405 ❌

### Attempt 7: Fixed Middleware Path Parsing
**Hypothesis:** Middleware throwing errors due to undefined pathname  
**Action:** Changed `req.pathname` to `req.nextUrl.pathname`  
**Result:** POST still 405 ❌

### Attempt 8: Moved Routes to `/api/bulk-jobs/` (Per External Dev #2)
**Hypothesis:** `/api/cron/*` and `/api/admin/*` have hidden edge runtime inheritance  
**Action:** Created completely new route tree at `/api/bulk-jobs/` with clean slate  
**Result:** POST still 405 ❌

### Attempt 9: Added `/api/bulk-jobs` to Middleware Allowlist
**Hypothesis:** Middleware wasn't explicitly allowing new route path  
**Action:** Added `path.startsWith('/api/bulk-jobs')` to middleware allowlist  
**Result:** POST STILL 405 ❌

---

## Current Code State (After All Attempts)

### Route Files (All 3 Identical Structure)

**Location:**
- `frontend/app/api/bulk-jobs/scryfall-import/route.ts`
- `frontend/app/api/bulk-jobs/price-import/route.ts`
- `frontend/app/api/bulk-jobs/price-snapshot/route.ts`

**Code:**
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
    
    // ... 3-10 minutes of bulk import work ...
    
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

### Middleware (`frontend/middleware.ts`)

```typescript
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export const config = {
  matcher: ['/api/:path*'],
};

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Attach/refresh Supabase cookies
  try {
    const supabase = createMiddlewareClient({ req, res });
    await supabase.auth.getSession();
  } catch (e) {
    console.error('Supabase middleware getSession error:', e);
  }

  const method = req.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const url = new URL(req.url);
    const path = req.nextUrl.pathname;
    // Allow admin, health, config, cron, and bulk-jobs routes
    if (!(path.startsWith('/api/admin') || path.startsWith('/api/health') || path.startsWith('/api/config') || path.startsWith('/api/cron') || path.startsWith('/api/bulk-jobs'))) {
      // Maintenance mode check (returns 503 if enabled, otherwise continues)
      if (process.env.MAINTENANCE_HARD_READONLY === '1') {
        return new NextResponse(JSON.stringify({ ok:false, maintenance:true, message:'Maintenance mode (env) — writes paused' }), { status: 503, headers: { 'content-type': 'application/json' } });
      }
      try {
        const cfgUrl = new URL('/api/config?key=maintenance', req.url);
        const r = await fetch(cfgUrl.toString(), { cache: 'no-store' });
        const j = await r.json();
        const m = j?.config?.maintenance;
        if (m?.enabled) {
          const msg = String(m?.message || 'Maintenance mode — writes paused');
          return new NextResponse(JSON.stringify({ ok:false, maintenance:true, message: msg }), { status: 503, headers: { 'content-type': 'application/json' } });
        }
      } catch { /* allow on failure */ }
    }
  }

  return res;
}
```

**Note:** `/api/bulk-jobs` IS in the allowlist now.

### Next.js Config (`frontend/next.config.ts`)

```typescript
const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cards.scryfall.io' },
      { protocol: 'https', hostname: 'svgs.scryfall.io' }
    ]
  },
  async rewrites() {
    return [
      {
        source: "/ingest/:path*",
        destination: "https://eu.i.posthog.com/:path*",
      },
    ];
  },
  async headers() {
    const csp = [
      "default-src 'self'",
      "img-src 'self' data: https://cards.scryfall.io https://svgs.scryfall.io",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://storage.ko-fi.com https://eu-assets.i.posthog.com",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "connect-src 'self' https://api.scryfall.com https://eu.i.posthog.com https://eu-assets.i.posthog.com https://*.supabase.co https://*.supabase.in https://app.manatap.ai https://*.ingest.de.sentry.io",
      "frame-src https://js.stripe.com https://ko-fi.com",
      "worker-src 'self' blob:",
    ].join('; ');
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
};
```

**Note:** No API route modifications, redirects, or runtime overrides.

### Vercel Config (`vercel.json`)

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

**Note:** No functions config, no special route configurations.

---

## Test Commands & Results

### Current Test (After All 9 Attempts)

```powershell
$headers = @{
    "x-cron-key" = "Boobies"
    "Content-Type" = "application/json"
}

# Test 1: Scryfall Import
Invoke-WebRequest -Uri "https://www.manatap.ai/api/bulk-jobs/scryfall-import" -Method POST -Headers $headers
# Result: 405 Method Not Allowed ❌

# Test 2: Price Import
Invoke-WebRequest -Uri "https://www.manatap.ai/api/bulk-jobs/price-import" -Method POST -Headers $headers
# Result: 405 Method Not Allowed ❌

# Test 3: Price Snapshot
Invoke-WebRequest -Uri "https://www.manatap.ai/api/bulk-jobs/price-snapshot" -Method POST -Headers $headers
# Result: 405 Method Not Allowed ❌
```

### What DOES Work

```powershell
# GET works perfectly
Invoke-WebRequest -Uri "https://www.manatap.ai/api/bulk-jobs/scryfall-import" -Method GET
# Returns: 200 OK with JSON info message ✅

# OPTIONS works perfectly
Invoke-WebRequest -Uri "https://www.manatap.ai/api/bulk-jobs/scryfall-import" -Method OPTIONS
# Returns: 200 OK with Allow: GET, POST, OPTIONS headers ✅

# Other simple POST routes work
Invoke-WebRequest -Uri "https://www.manatap.ai/api/decks/create" -Method POST -Headers $headers
# Returns: 200 OK (creates deck) ✅
```

---

## Comparison: Working vs Non-Working Routes

### ❌ Non-Working (405 on POST)

**Files:**
- `/api/bulk-jobs/scryfall-import/route.ts`
- `/api/bulk-jobs/price-import/route.ts`
- `/api/bulk-jobs/price-snapshot/route.ts`

**Structure:**
```typescript
export const runtime = "nodejs";
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

export async function OPTIONS() { /* ... */ }
export async function GET() { /* ... */ }
export async function POST(req: NextRequest) {
  // Long-running job (3-10 minutes)
  // Auth check with x-cron-key header
  // Bulk database operations
}
```

### ✅ Working (POST succeeds)

**File:**
- `/api/decks/create/route.ts`

**Structure:**
```typescript
// NO EXPORTS AT ALL

export async function POST(req: NextRequest) {
  // Simple deck creation
  // Standard auth
  // Quick operation
}
```

**Key Differences:**
1. Working route has no `runtime`, `dynamic`, or `maxDuration` exports
2. Working route has no OPTIONS or GET handlers
3. Working route is a quick operation (<1 second)
4. Non-working routes have 3-10 minute expected runtime

---

## Vercel Deployment Details

### Build Output (Last Successful Build)
```
✓ Compiled successfully in 63s
Route (app)                                  Size  First Load JS
├ ƒ /api/bulk-jobs/price-import             790 B         279 kB
├ ƒ /api/bulk-jobs/price-snapshot           791 B         279 kB
├ ƒ /api/bulk-jobs/scryfall-import          789 B         279 kB
ƒ Middleware                               136 kB
```

**Routes are present and deployed as serverless functions (`ƒ` symbol).**

### Vercel Project Settings
- **Plan:** Pro
- **Function Max Duration:** 600 seconds
- **Function Regions:** Europe (thr1), North America (iad1)
- **Function CPU:** Standard (1 vCPU, 2 GB Memory)
- **Fluid Compute:** Enabled

### Deployment Process
1. Push to GitHub main branch
2. Vercel automatically deploys
3. Build succeeds
4. Routes show in deployment
5. GET and OPTIONS work
6. POST returns 405

**Tried:** Multiple "Redeploy without cache" attempts - no change.

---

## Environment Details

- **Next.js Version:** 15.5.2 (App Router)
- **Node.js:** Whatever Vercel Pro uses for nodejs runtime
- **Vercel Plan:** Pro (600s timeout, extended regions)
- **Database:** Supabase (external, not Vercel-hosted)
- **Expected Job Runtime:** 3-10 minutes
- **Actual Timeout Setting:** 600 seconds (10 minutes)

---

## Theories & Investigations

### Theory 1: Next.js 15.5.2 Bug ⚠️
Routes with multiple exports (`runtime`, `dynamic`, `maxDuration`, `OPTIONS`, `GET`, `POST`) might not properly deploy POST handlers to Vercel.

**Evidence:**
- Simple routes with just POST work fine
- Complex routes with multiple exports fail consistently
- Affects all 3 routes identically

**Test:** Simplify route to just POST handler (remove all other exports)

### Theory 2: Vercel Caching/Deployment Bug ⚠️
Vercel might be:
- Caching old route definitions despite redeployments
- Having a bug with nodejs runtime + maxDuration on Pro plan
- Incorrectly parsing routes with OPTIONS + GET + POST together

**Evidence:**
- Multiple cache-clear redeployments
- Build always succeeds
- Routes show in deployment
- Still 405

**Test:** Contact Vercel Support with deployment logs

### Theory 3: Middleware Still Blocking 🔍
Despite adding `/api/bulk-jobs` to allowlist, middleware might still interfere.

**Evidence:**
- Middleware matches `/api/:path*` (catches all API routes)
- Maintenance mode check could be failing silently
- But it returns 503, not 405, so probably not this

**Test:** Temporarily remove middleware entirely

### Theory 4: Hidden Vercel Configuration 🔍
Some Vercel project setting or security feature blocks these routes.

**Evidence:**
- Checked all visible settings - nothing unusual
- No firewall rules
- No special method restrictions

**Test:** Deploy same routes to different Vercel project

### Theory 5: POST Handler Not in Deployed Bundle ⚠️⚠️⚠️
The POST function is in the source code but somehow not making it into the deployed serverless function.

**Evidence:**
- Build succeeds
- GET/OPTIONS work (from same file)
- POST specifically missing
- Local works (different bundle process)

**Test:** Inspect deployed function directly (requires Vercel support)

---

## What We Know for Absolute Certain

1. ✅ **Source Code is Correct:** POST handler exists, is exported, has proper signature
2. ✅ **Build Succeeds:** No TypeScript errors, no build warnings
3. ✅ **Routes Deploy:** Show up in Vercel deployment output as functions
4. ✅ **Local Works:** POST works perfectly on localhost (dev + production build)
5. ✅ **Partial Production Works:** GET and OPTIONS work on deployed routes
6. ✅ **Other POST Routes Work:** Simple POST routes work fine in production
7. ✅ **Middleware Allows Path:** `/api/bulk-jobs` is in the allowlist
8. ✅ **No Parent Layouts Found:** No `layout.tsx` files forcing edge runtime
9. ✅ **Runtime Config is nodejs:** Not edge
10. ❌ **Production POST Fails:** Consistently returns 405 across all attempts

---

## Questions for External Diagnosis

1. **Why does POST specifically return 405 when GET/OPTIONS from the same file work?**

2. **Is there a Next.js 15.5.2 bug with routes that have:**
   - `export const runtime = "nodejs"`
   - `export const maxDuration = 600`
   - `export const dynamic = 'force-dynamic'`
   - Multiple HTTP method exports (OPTIONS, GET, POST)

3. **Could Vercel be stripping POST handlers from routes with `maxDuration > X` seconds?**

4. **Is there a way to inspect the actual deployed serverless function to see if POST is present?**

5. **Should we:**
   - a) Remove ALL exports except POST (match working routes exactly)
   - b) Contact Vercel Support with deployment IDs
   - c) Downgrade to Next.js 14.x
   - d) Move to a different hosting platform (Render, Railway, Cloudflare)
   - e) Something else?

---

## Critical Files for Review

1. **Route files:**
   - `frontend/app/api/bulk-jobs/scryfall-import/route.ts`
   - `frontend/app/api/bulk-jobs/price-import/route.ts`
   - `frontend/app/api/bulk-jobs/price-snapshot/route.ts`

2. **Middleware:**
   - `frontend/middleware.ts`

3. **Configuration:**
   - `frontend/next.config.ts`
   - `vercel.json`
   - `frontend/package.json`

4. **Working comparison:**
   - `frontend/app/api/decks/create/route.ts`

5. **Documentation:**
   - `HTTP_405_DEBUGGING_REPORT.md` (original investigation)
   - `HTTP_405_UPDATE_AFTER_NODEJS_FIX.md` (after runtime change)
   - `HTTP_405_PATH_A_ATTEMPT.md` (after route relocation)
   - `HTTP_405_FINAL_HANDOVER.md` (this document)

---

## Repository Context

- **GitHub:** https://github.com/Ver-zz-ato/mtg-ai-assistant-backend
- **Vercel Project:** manatap
- **Production URL:** https://www.manatap.ai
- **Latest Deployment:** Includes all 9 fix attempts above

---

## What We Need

**A diagnosis that explains:**
1. Why POST returns 405 when the handler exists in code
2. Why GET/OPTIONS from the same file work
3. Why local POST works but production doesn't
4. Why other simple POST routes work fine
5. Why 9 different fix attempts all failed

**And ideally a solution that:**
1. Makes POST work in Vercel production
2. Allows 10-minute function execution
3. Works with GitHub Actions automation
4. Doesn't require migrating to a different host

---

**END OF HANDOVER**  
**Date:** 2025-10-27  
**Total Attempts:** 9  
**Success Rate:** 0%  
**Status:** CRITICAL - Requires external expert diagnosis

