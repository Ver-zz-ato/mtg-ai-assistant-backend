# HTTP 405 Method Not Allowed - Complete Technical Breakdown

## Problem Statement

**Issue:** Three Next.js App Router API routes return `HTTP 405 Method Not Allowed` when accessed via POST requests on Vercel production, but work perfectly in local development.

**Affected Routes:**
- `/api/cron/bulk-scryfall`
- `/api/cron/bulk-price-import`
- `/api/admin/price/snapshot/bulk`

**Environment:**
- Framework: Next.js 15.5.2 (App Router)
- Hosting: Vercel Pro Plan
- Local: Works perfectly (`npm run dev` and `npm run build` + `npm start`)
- Production: Consistent 405 errors

---

## Current Code Structure

### Route Example (`frontend/app/api/cron/bulk-scryfall/route.ts`)

```typescript
export const runtime = "edge";
export const dynamic = 'force-dynamic';
// Note: maxDuration not supported on edge runtime

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
  // Auth logic checks x-cron-key header or admin user session
  // Then performs bulk import from Scryfall
  // ~3-5 minutes runtime expected
}
```

### Middleware (`frontend/middleware.ts`)

```typescript
export const config = {
  matcher: ['/api/:path*'],
};

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  
  // Supabase auth setup
  const supabase = createMiddlewareClient({ req, res });
  await supabase.auth.getSession();

  const method = req.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const path = req.pathname;
    // EXPLICITLY ALLOWS /api/cron routes
    if (!(path.startsWith('/api/admin') || path.startsWith('/api/health') || path.startsWith('/api/config') || path.startsWith('/api/cron'))) {
      // Maintenance mode check here
    }
  }

  return res;
}
```

**Key Point:** Middleware explicitly allows POST to `/api/cron/*` paths.

---

## Test Results

### Local Development ✅
```powershell
# Works perfectly
curl -X POST http://localhost:3000/api/cron/bulk-scryfall `
  -H "x-cron-key: Boobies" `
  -H "Content-Type: application/json"
# Returns: 200 OK, starts bulk import
```

### Vercel Production ❌
```powershell
# GET works
Invoke-WebRequest -Uri "https://www.manatap.ai/api/cron/bulk-scryfall" -Method GET
# Returns: 200 OK with info message

# POST fails
$headers = @{
    "x-cron-key" = "Boobies"
    "Content-Type" = "application/json"
}
Invoke-WebRequest -Uri "https://www.manatap.ai/api/cron/bulk-scryfall" -Method POST -Headers $headers
# Returns: 405 Method Not Allowed
```

### Vercel Build Logs ✅
```
✓ Compiled successfully in 63s
Route (app)                                  Size  First Load JS
├ ƒ /api/cron/bulk-price-import             790 B         279 kB
├ ƒ /api/cron/bulk-scryfall                 789 B         279 kB
├ ƒ /api/admin/price/snapshot/bulk          791 B         279 kB
ƒ Middleware                               136 kB
```

**Routes are building successfully** - they're present in the build output.

---

## Attempted Fixes (Chronological)

### 1. ✅ Added GET Handler
**Hypothesis:** Route might not be recognized by Vercel  
**Action:** Added `export async function GET()` to return info message  
**Result:** GET works, POST still 405

### 2. ✅ Added OPTIONS Handler
**Hypothesis:** CORS or method negotiation issue  
**Action:** Added `export async function OPTIONS()` with explicit `Allow: GET, POST, OPTIONS` headers  
**Result:** OPTIONS returns 200, POST still 405

### 3. ✅ Added `export const dynamic = 'force-dynamic'`
**Hypothesis:** Static optimization causing deployment issue  
**Action:** Forced dynamic rendering  
**Result:** POST still 405

### 4. ✅ Changed `runtime` from "nodejs" to "edge"
**Hypothesis:** Vercel edge network handles HTTP methods differently  
**Action:** `export const runtime = "edge"`  
**Result:** POST still 405

### 5. ✅ Removed `maxDuration` Config
**Hypothesis:** Invalid config causing route rejection  
**Action:** Removed `export const maxDuration = 600` (not supported on edge runtime anyway)  
**Result:** POST still 405

### 6. ❌ Tried `vercel.json` Functions Config
**Hypothesis:** Need explicit function configuration  
**Action:** Added to `vercel.json`:
```json
{
  "functions": {
    "app/api/cron/bulk-scryfall/route.js": { "maxDuration": 600 }
  }
}
```
**Result:** No change, removed it

---

## Key Observations

1. **Local vs Production Discrepancy:**
   - 100% success rate locally (dev server + production build)
   - 100% failure rate on Vercel
   - This points to a deployment/edge network issue, not code

2. **GET Works, POST Doesn't:**
   - GET handler returns 200 with proper JSON
   - POST handler exists in code but Vercel returns 405
   - This suggests **POST handler is being stripped or blocked during deployment**

3. **Build Succeeds:**
   - Routes show up in build output as `ƒ` (serverless functions)
   - No TypeScript errors
   - No build warnings related to these routes

4. **Middleware Allows It:**
   - Middleware explicitly allows `/api/cron/*` for non-GET methods
   - Other POST routes work fine (e.g., `/api/decks/create`)

5. **Vercel Settings Confirmed:**
   - Pro plan active
   - Function Max Duration: 600 seconds
   - Function Regions: Europe (thr1), North America (iad1)
   - No "Allowed Methods" restrictions visible

6. **Pattern Consistent:**
   - All 3 routes fail identically
   - All 3 routes work locally
   - Suggests systemic issue, not route-specific bug

---

## Current Configuration Files

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

**Note:** Removed all functions config and other cron entries during debugging.

### `next.config.ts`
```typescript
const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cards.scryfall.io' },
      { protocol: 'https', hostname: 'svgs.scryfall.io' }
    ]
  },
  async rewrites() { /* PostHog rewrites */ },
  async headers() {
    return [{
      source: '/:path*',
      headers: [{ key: 'Content-Security-Policy', value: csp }]
    }];
  }
};
```

**Note:** No redirects, no API route modifications.

---

## GitHub Actions Context

**Goal:** Run these 3 bulk jobs nightly via GitHub Actions  

**Workflow Snippet:**
```yaml
- name: Job 1 - Bulk Scryfall Import
  run: |
    curl -X POST \
      -H "x-cron-key: ${{ secrets.CRON_KEY }}" \
      -H "Content-Type: application/json" \
      -H "User-Agent: GitHub-Actions-Nightly-Import/1.0" \
      --max-time 600 \
      "${{ secrets.VERCEL_URL }}/api/cron/bulk-scryfall"
```

**Result:** Fails with 405

---

## Other Routes Comparison

**Working POST Route Example:** `/api/decks/create`
```typescript
export async function POST(req: NextRequest) {
  // Similar structure, works fine
}
```

**Differences:**
- No `OPTIONS` handler
- No `GET` handler
- No `runtime` or `dynamic` exports
- Default Next.js configuration
- **Works perfectly on Vercel**

---

## Theories

### Theory 1: Vercel Cron Routes Restriction
Vercel might have special handling for `/api/cron/*` paths that conflicts with manual POST requests.

**Evidence:**
- Only `/api/cron/*` routes fail
- `/api/admin/price/snapshot/bulk` also fails (also a bulk job)

**Counter-evidence:**
- `/api/cron/cleanup-price-cache` works (but it's in `vercel.json` crons)

### Theory 2: Next.js 15 App Router Bug
Next.js 15.5.2 with Vercel edge network has a bug with certain route configurations.

**Evidence:**
- Local works, Vercel doesn't
- Only affects these specific routes
- Multiple config attempts failed

### Theory 3: Vercel Pro Plan Configuration
Some hidden Pro plan setting or security feature blocks these routes.

**Evidence:**
- Tried with and without `maxDuration`
- Checked visible settings (all look correct)

**Counter-evidence:**
- Other POST routes work fine

---

## Request for Help

**Question:** Why would POST handlers work locally but return 405 on Vercel when:
- GET handlers work
- Route builds successfully  
- Middleware allows the path
- Other POST routes work
- Multiple configuration attempts failed

**Needed:** Diagnosis and fix for this deployment issue.

---

## Additional Information

- **Next.js Version:** 15.5.2
- **Vercel Plan:** Pro (600s function timeout)
- **Expected Runtime:** 3-10 minutes per job
- **Database:** Supabase (hosted separately, not Vercel)
- **Repo:** Private GitHub repository
- **Deployment:** Automatic on push to `main` branch
- **Cache:** Tried "Redeploy without cache" multiple times

---

## Code Comparison: Working vs Non-Working POST Route

### ❌ Non-Working: `/api/cron/bulk-scryfall/route.ts` (Current)
```typescript
export const runtime = "edge";
export const dynamic = 'force-dynamic';

export async function OPTIONS() { /* ... */ }
export async function GET() { /* ... */ }
export async function POST(req: NextRequest) { /* ... */ }
```

### ✅ Working: `/api/decks/create/route.ts`
```typescript
// No exports at all
export async function POST(req: NextRequest) { /* ... */ }
```

**Hypothesis:** The additional exports (`runtime`, `dynamic`, `OPTIONS`, `GET`) might be causing issues.

