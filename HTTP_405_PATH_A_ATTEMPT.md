# HTTP 405 Persists Even After Path A (Route Relocation) - Update

## Date: 2025-10-27
## Status: STILL FAILING (405 on POST)

---

## What We Just Tried (Path A - Route Relocation)

Based on the external dev's second diagnosis, we implemented **Path A: Move routes to new location to escape edge runtime inheritance**.

### The Hypothesis
Even though no parent `layout.tsx` files with `runtime = "edge"` were found, the external dev suggested that `/api/cron/*` and `/api/admin/*` hierarchies might have hidden edge runtime enforcement. The solution was to create a completely new route tree at `/api/bulk-jobs/` with zero parent interference.

### Implementation

**Created New Route Structure:**
- `/api/bulk-jobs/scryfall-import/route.ts` (was `/api/cron/bulk-scryfall`)
- `/api/bulk-jobs/price-import/route.ts` (was `/api/cron/bulk-price-import`)
- `/api/bulk-jobs/price-snapshot/route.ts` (was `/api/admin/price/snapshot/bulk`)

**All New Routes Have:**
```typescript
export const runtime = "nodejs";
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

export async function OPTIONS() { /* ... */ }
export async function GET() { /* ... */ }
export async function POST(req: NextRequest) { /* ... */ }
```

**Updated References:**
- ✅ GitHub Actions workflow URLs updated
- ✅ Admin/Data page button URLs updated
- ✅ Deployed to Vercel successfully
- ✅ Build succeeded

---

## Test Results

### Test Commands
```powershell
$headers = @{
    "x-cron-key" = "Boobies"
    "Content-Type" = "application/json"
}

# Test NEW routes
Invoke-WebRequest -Uri "https://www.manatap.ai/api/bulk-jobs/scryfall-import" -Method POST -Headers $headers
Invoke-WebRequest -Uri "https://www.manatap.ai/api/bulk-jobs/price-import" -Method POST -Headers $headers
Invoke-WebRequest -Uri "https://www.manatap.ai/api/bulk-jobs/price-snapshot" -Method POST -Headers $headers
```

### Results
**ALL THREE STILL RETURN 405 METHOD NOT ALLOWED** ❌

---

## What This Means

The 405 error **persists even after:**
1. ✅ Switching from `edge` to `nodejs` runtime
2. ✅ Adding `maxDuration = 600`
3. ✅ Moving to a completely new route tree (`/api/bulk-jobs/`)
4. ✅ No parent layouts found with `runtime = "edge"`
5. ✅ Deployed successfully, routes exist in build output

**Pattern Observation:**
- ✅ GET works on new routes
- ✅ OPTIONS works on new routes
- ✅ Local POST works
- ❌ Production POST returns 405

This is **extremely unusual** and suggests something more fundamental is wrong.

---

## Potential Root Causes to Investigate

### 1. Next.js 15.5.2 + Vercel Bug
There may be a bug in Next.js 15.5.2 where routes with:
- `export const runtime = "nodejs"`
- `export const maxDuration = 600`
- `export const dynamic = 'force-dynamic'`
- Multiple HTTP method exports (OPTIONS, GET, POST)

...are not properly deploying POST handlers to Vercel, regardless of route location.

**Evidence:**
- Other simple POST routes (just `export async function POST()`) work fine
- These complex routes with multiple exports don't work anywhere we put them

### 2. Vercel Deployment Issue
Vercel might be:
- Caching old edge function definitions despite new deployments
- Having a bug with `maxDuration` configuration on Pro plan
- Incorrectly parsing routes with OPTIONS + GET + POST together

**Evidence:**
- Multiple "redeploy without cache" attempts
- Build succeeds, routes show in deployment
- Still 405

### 3. next.config.ts or vercel.json Interference
Some global configuration might be:
- Forcing certain route patterns to edge
- Blocking POST on routes with specific exports
- Overriding per-route runtime declarations

**Evidence:**
- Affects all 3 routes consistently
- Persists across route relocations

### 4. Middleware Blocking (Despite Fix)
The middleware might still be interfering, even after the `req.nextUrl.pathname` fix.

**Counter-evidence:**
- Middleware explicitly allows `/api/bulk-jobs` via the `/api/admin` path check (both start with `/api/`)
- Actually, wait - middleware checks for specific paths: `/api/admin`, `/api/health`, `/api/config`, `/api/cron`
- `/api/bulk-jobs` is NOT in that list!
- **This could be the issue!**

---

## WAIT - MIDDLEWARE DOESN'T ALLOW `/api/bulk-jobs`!

### Current Middleware Logic
```typescript
const method = req.method.toUpperCase();
if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
  const url = new URL(req.url);
  const path = req.nextUrl.pathname;
  // Allow admin, health, config, and cron routes
  if (!(path.startsWith('/api/admin') || path.startsWith('/api/health') || path.startsWith('/api/config') || path.startsWith('/api/cron'))) {
    // MAINTENANCE MODE CHECK HERE - might return 503
  }
}
```

### The Problem
`/api/bulk-jobs/*` does NOT start with any of the allowed paths, so it falls into the maintenance mode check!

If maintenance mode is enabled (even partially), it would return 503.
But we're getting 405, not 503...

**Unless:** The middleware is somehow returning 405 instead of 503? Or the maintenance check is somehow malformed?

Let me check what happens in the maintenance block...

Actually, looking at the code:
- If NOT in the allowed list, it checks maintenance mode
- If maintenance mode is OFF (which it probably is), it returns `res` (allows through)
- So this shouldn't be blocking...

But it's worth trying!

---

## Recommended Next Steps

### Option 1: Add `/api/bulk-jobs` to Middleware Allowlist
Update middleware to explicitly allow `/api/bulk-jobs`:

```typescript
if (!(path.startsWith('/api/admin') || path.startsWith('/api/health') || path.startsWith('/api/config') || path.startsWith('/api/cron') || path.startsWith('/api/bulk-jobs'))) {
```

### Option 2: Simplify Route Exports
Remove all exports except POST and test:
```typescript
// Remove: runtime, dynamic, maxDuration, OPTIONS, GET
// Keep only: POST
export async function POST(req: NextRequest) { /* ... */ }
```

This matches the working routes like `/api/decks/create`.

### Option 3: Contact Vercel Support
With this much documentation, Vercel Support might be able to:
- Inspect the actual deployed serverless function
- Check for edge runtime tainting bugs
- Identify why POST is being stripped

### Option 4: Try Next.js 14
Downgrade to Next.js 14.x to rule out a Next.js 15.5.2 regression.

### Option 5: Deploy to Different Host
Test on Render, Railway, or Cloudflare Workers to determine if this is Vercel-specific.

---

## Summary

**We've now tried:**
1. ❌ Changing from edge to nodejs runtime
2. ❌ Adding maxDuration
3. ❌ Adding OPTIONS handler
4. ❌ Adding GET handler
5. ❌ Adding force-dynamic
6. ❌ Fixing middleware path parsing
7. ❌ Moving routes to completely new directory (`/api/bulk-jobs/`)

**Still failing:** POST returns 405 in production

**Still working:**
- ✅ Local POST works perfectly
- ✅ Production GET works
- ✅ Production OPTIONS works
- ✅ Other simple POST routes work

**Most likely culprits (ranked):**
1. **Middleware not allowing `/api/bulk-jobs` paths** (try adding to allowlist)
2. **Next.js 15 bug with multiple HTTP method exports + runtime config**
3. **Vercel deployment bug or cache corruption**
4. **Hidden Vercel configuration blocking these specific route patterns**

---

## Files for Reference

**New Routes:**
- `frontend/app/api/bulk-jobs/scryfall-import/route.ts`
- `frontend/app/api/bulk-jobs/price-import/route.ts`
- `frontend/app/api/bulk-jobs/price-snapshot/route.ts`

**Middleware:**
- `frontend/middleware.ts`

**GitHub Actions:**
- `.github/workflows/nightly-bulk-imports.yml`

**Admin Page:**
- `frontend/app/admin/data/page.tsx`

---

**End of Path A Attempt Report**
**Date:** 2025-10-27
**Status:** 405 persists despite route relocation
**Next:** Try adding `/api/bulk-jobs` to middleware allowlist or simplify route exports

