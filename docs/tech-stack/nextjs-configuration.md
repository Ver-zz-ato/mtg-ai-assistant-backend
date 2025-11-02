# Next.js Configuration Guide

## Overview

This application uses Next.js 15 with the App Router for server-side rendering, API routes, and client-side React components. The configuration supports both server and client components, edge runtime, and optimized builds.

## Project Structure

```
frontend/
├── app/                    # App Router (Next.js 13+)
│   ├── api/               # API routes
│   ├── admin/             # Admin pages
│   ├── (routes)/          # Public pages
│   └── layout.tsx         # Root layout
├── components/             # React components
├── lib/                    # Shared utilities
├── middleware.ts           # Request middleware
└── package.json           # Dependencies
```

## Runtime Configuration

### API Route Runtimes

Routes can use different runtimes:

**Node.js Runtime** (Default for most routes):
```typescript
export const runtime = "nodejs";
export const dynamic = 'force-dynamic';
export const maxDuration = 600; // 10 minutes (for long-running jobs)
```

Used for:
- Database operations
- File processing
- Long-running jobs (bulk imports)
- Stripe webhooks

**Edge Runtime** (Fast, limited):
```typescript
export const runtime = 'edge';
export const revalidate = 86400; // Cache for 24 hours
```

Used for:
- Simple API routes
- Cached responses
- High-performance endpoints

### Dynamic Rendering

**Force Dynamic** (No caching):
```typescript
export const dynamic = 'force-dynamic';
```
- Used when data changes frequently
- Bypasses Next.js caching
- Every request hits the server

**Static with Revalidation**:
```typescript
export const revalidate = 3600; // Revalidate every hour
```
- Caches response for specified duration
- Good for semi-static data

## API Routes

### Route Handler Pattern

```typescript
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Handle GET request
  return NextResponse.json({ data: '...' });
}

export async function POST(req: NextRequest) {
  // Handle POST request
  const body = await req.json();
  return NextResponse.json({ ok: true });
}
```

### Authentication in API Routes

```typescript
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // User is authenticated, proceed...
}
```

### Admin Authentication

```typescript
import { getServerSupabase } from '@/lib/server-supabase';

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "").split(/[\s,]+/).filter(Boolean).map(s=>s.toLowerCase());
  const uid = String(user?.id || "");
  const email = String(user?.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function POST(req: NextRequest) {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  
  // Admin user authenticated, proceed...
}
```

## Middleware

**Location**: `frontend/middleware.ts`

### Functions

1. **Supabase Auth Cookie Refresh**
   - Attaches/refreshes Supabase session cookies
   - Runs on all `/api/*` routes
   - Never blocks requests on error

2. **Maintenance Mode**
   - Checks `app_config.maintenance` key
   - Blocks write operations (POST, PUT, DELETE) when enabled
   - Allows: GET, HEAD, OPTIONS, admin routes, health checks
   - Override: Set `MAINTENANCE_HARD_READONLY=1` env var

3. **First Visit Tracking**
   - Sets `visitor_id` cookie for new visitors
   - Tracks first visit via PostHog (server-side, no consent needed)
   - Cookie expires in 1 year

### Matcher Configuration

```typescript
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

Excludes static assets from middleware processing.

## Environment Variables

### Required Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# PostHog
NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxxxxxxxxxx
NEXT_PUBLIC_POSTHOG_HOST=https://eu.posthog.com

# Stripe
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx

# Admin
ADMIN_USER_IDS=user-id-1 user-id-2
ADMIN_EMAILS=admin@example.com

# Optional
NEXT_PUBLIC_BASE_URL=https://manatap.ai
NEXT_PUBLIC_APP_VERSION=1.0.0
```

### Environment Files

- `.env.local` - Local development (git-ignored)
- `.env` - Default values (can be committed)
- Production: Set in deployment platform (Vercel, Render, etc.)

## Build Configuration

### Build Process

```bash
npm run build
```

Process:
1. TypeScript type checking
2. Next.js compilation
3. Static page generation (SSG)
4. API route bundling
5. Asset optimization

### Build Output

- `.next/` - Build artifacts
- Static pages pre-rendered
- API routes bundled
- Images optimized

### Deployment

**Vercel** (Recommended):
- Automatic deployments from Git
- Environment variables configured in dashboard
- Edge functions supported

**Render/Railway**:
- Manual deployment or Git-based
- Set environment variables in dashboard
- Node.js runtime required

## Common Patterns

### Error Handling

```typescript
export async function POST(req: NextRequest) {
  try {
    // ... operation
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Operation failed:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Server error' },
      { status: 500 }
    );
  }
}
```

### Response Helpers

```typescript
// Success response
return NextResponse.json({ ok: true, data: result });

// Error response
return NextResponse.json(
  { ok: false, error: 'Error message' },
  { status: 400 }
);

// With headers
return NextResponse.json(data, {
  status: 200,
  headers: { 'Cache-Control': 'no-store' }
});
```

### CORS Headers

```typescript
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
```

## Troubleshooting

### "Dynamic API route handler" Warnings

**Symptoms**: Console warnings about dynamic routes

**Solution**: Add `export const dynamic = 'force-dynamic'` to route file

### Build Errors

**Type Errors**:
- Run `npm run build` to see TypeScript errors
- Fix type issues before deploying

**Module Not Found**:
- Check imports use `@/` alias (configured in `tsconfig.json`)
- Verify file paths are correct

### Runtime Errors

**"Cannot read property of undefined"**:
- Check if user is authenticated before accessing user data
- Add null checks for optional data

**Memory Issues**:
- Long-running jobs may hit memory limits
- Consider using `maxDuration` to limit execution time
- Process data in smaller batches

### Deployment Issues

**Environment Variables Missing**:
- Verify all required env vars are set in deployment platform
- Check variable names match exactly (case-sensitive)

**Build Fails on Deploy**:
- Check build logs for specific errors
- Verify Node.js version matches local (check `package.json` engines)
- Ensure all dependencies are listed in `package.json`

## Best Practices

1. **Use TypeScript**
   - All files should be `.ts` or `.tsx`
   - Leverage type safety for fewer runtime errors

2. **Handle Errors Gracefully**
   - Always try/catch in API routes
   - Return appropriate HTTP status codes
   - Log errors for debugging

3. **Optimize API Routes**
   - Use edge runtime for simple routes
   - Cache responses when appropriate
   - Set `maxDuration` for long operations

4. **Security**
   - Always authenticate admin routes
   - Validate user input
   - Use parameterized queries (Supabase handles this)

5. **Performance**
   - Use static generation when possible
   - Implement proper caching
   - Optimize database queries

## Related Files

- `frontend/middleware.ts` - Request middleware
- `frontend/app/layout.tsx` - Root layout
- `frontend/package.json` - Dependencies and scripts
- `frontend/tsconfig.json` - TypeScript configuration

