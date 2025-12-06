# Repository Recommendations

**Date:** 2025-01-27  
**Status:** General improvements and optimizations

---

## 🎯 Priority Recommendations

### 1. **Console.log Cleanup** (Low Priority, High Impact)

**Issue:** 1,237 `console.log/error/warn` statements across 247 files

**Impact:**
- Performance: Console statements have overhead, especially in production
- Security: May leak sensitive data in browser console
- Code quality: Makes debugging harder when everything is logged

**Recommendation:**
- Create a logging utility that:
  - Only logs in development
  - Uses structured logging in production (send to analytics/monitoring)
  - Allows log levels (debug, info, warn, error)
- Replace `console.log` with `logger.debug()` or `logger.info()`
- Keep `console.error` for critical errors (but wrap in logger)

**Example:**
```typescript
// lib/logger.ts
const logger = {
  debug: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development') console.log(...args);
  },
  info: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development') console.info(...args);
    // In production, send to analytics
  },
  error: (...args: any[]) => {
    console.error(...args);
    // Always log errors, send to Sentry in production
  }
};
```

**Files to prioritize:**
- `frontend/app/api/cards/batch-metadata/route.ts` (8 console.log statements)
- `frontend/components/Chat.tsx` (4 console statements)
- `frontend/app/api/chat/route.ts` (15 console statements)

---

### 2. **Database Query Optimization** (Medium Priority)

**Current State:**
- ✅ Slow query logging exists (`lib/server/query-logger.ts`)
- ⚠️ Some queries might benefit from indexes

**Recommendations:**

#### A. Add Database Indexes
Check for missing indexes on frequently queried columns:

```sql
-- Example indexes that might help
CREATE INDEX IF NOT EXISTS idx_decks_is_public_created_at 
  ON decks(is_public, created_at DESC) 
  WHERE is_public = true;

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created 
  ON chat_messages(thread_id, created_at);

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer 
  ON profiles(stripe_customer_id) 
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scryfall_cache_name 
  ON scryfall_cache(name);
```

#### B. Optimize Browse Route
`/api/decks/browse` does full-text search which can be slow:

```typescript
// Current: Full table scan with ILIKE
query = query.or(`title.ilike.%${search}%,commander.ilike.%${search}%,deck_text.ilike.%${search}%`);

// Better: Use PostgreSQL full-text search or limit search scope
// Consider adding a search_vector column with GIN index
```

---

### 3. **Error Handling Consistency** (Medium Priority)

**Current State:**
- ✅ Most API routes have try-catch blocks
- ⚠️ Some error responses are inconsistent

**Recommendation:**
Create a standard error response utility:

```typescript
// lib/api/errors.ts
export function apiError(message: string, code: string, status: number = 500) {
  return NextResponse.json(
    { ok: false, error: message, code },
    { status }
  );
}

export function apiSuccess<T>(data: T) {
  return NextResponse.json({ ok: true, ...data });
}
```

**Benefits:**
- Consistent error format across all APIs
- Easier frontend error handling
- Better error tracking

---

### 4. **Environment Variable Validation** (High Priority)

**Issue:** No validation that required env vars are set at startup

**Recommendation:**
Create an env validation utility:

```typescript
// lib/env.ts
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'OPENAI_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
];

export function validateEnv() {
  const missing = requiredEnvVars.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Call in middleware.ts or app startup
```

**Benefits:**
- Fail fast on deployment if env vars are missing
- Clear error messages instead of cryptic runtime errors

---

### 5. **API Response Caching** (Low Priority, Performance Gain)

**Current State:**
- Some routes have memoization (`memoCache.ts`)
- Not consistently applied

**Recommendation:**
Add caching headers to static/semi-static endpoints:

```typescript
// Example: Card metadata, price snapshots
export async function GET() {
  const data = await fetchData();
  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
    }
  });
}
```

**Candidates:**
- `/api/cards/batch-metadata` (card data changes infrequently)
- `/api/price/snapshot` (historical data)
- `/api/decks/browse` (could cache for 1-5 minutes)

---

### 6. **TypeScript Strict Mode** (Low Priority, Code Quality)

**Current State:**
- TypeScript is configured but may not be in strict mode

**Recommendation:**
Enable strict mode gradually:

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    // ... other strict options
  }
}
```

**Benefits:**
- Catch bugs at compile time
- Better IDE autocomplete
- More maintainable code

---

### 7. **API Rate Limiting Enhancement** (Medium Priority)

**Current State:**
- ✅ Rate limiting exists (`lib/api/rate-limit.ts`)
- ⚠️ Uses in-memory store (won't work in distributed systems)

**Recommendation:**
- For production with multiple instances, use Redis
- Or use Supabase for rate limit storage
- Add rate limit headers to all responses

---

### 8. **Database Connection Pooling** (Low Priority)

**Current State:**
- Supabase client is created per request

**Recommendation:**
- Consider connection pooling for high-traffic routes
- Supabase handles this automatically, but verify pool size settings

---

### 9. **Monitoring & Observability** (High Priority)

**Current State:**
- ✅ Sentry integration exists
- ✅ PostHog analytics exists
- ⚠️ May need more structured monitoring

**Recommendation:**
Add health check endpoints:

```typescript
// app/api/health/route.ts
export async function GET() {
  const checks = {
    database: await checkDatabase(),
    stripe: await checkStripe(),
    openai: await checkOpenAI(),
  };
  
  const healthy = Object.values(checks).every(c => c.status === 'ok');
  
  return NextResponse.json(checks, {
    status: healthy ? 200 : 503
  });
}
```

**Benefits:**
- Easy monitoring with uptime checkers
- Quick diagnosis of service issues
- Better alerting

---

### 10. **Code Organization** (Low Priority)

**Current State:**
- Good separation of concerns
- Some large files could be split

**Recommendation:**
Consider splitting large files:
- `Chat.tsx` (926 lines) - could extract hooks/components
- `Client.tsx` files in collections/cost-to-finish (1500+ lines)

**Benefits:**
- Easier to maintain
- Better code reusability
- Faster development

---

## 📊 Quick Wins (Do First)

1. ✅ **Environment variable validation** - Prevents deployment issues
2. ✅ **Health check endpoint** - Essential for monitoring
3. ✅ **Standard error responses** - Improves DX and consistency
4. ✅ **Console.log cleanup** - Better performance and security

---

## 🔄 Nice to Have (Do Later)

1. Database indexes (monitor slow queries first)
2. API response caching (measure impact first)
3. TypeScript strict mode (gradual migration)
4. Code splitting (refactor as needed)

---

## 📝 Notes

- All recommendations are optional and can be implemented gradually
- Prioritize based on your current pain points
- Monitor performance before/after changes
- Test thoroughly in staging before production

---

## 🎯 Summary

Your codebase is in **good shape**! The main areas for improvement are:

1. **Observability** - Better logging and monitoring
2. **Performance** - Database indexes and caching
3. **Code Quality** - TypeScript strict mode and error handling consistency

Most of these are "nice to have" rather than critical issues. Your architecture is solid, and the recent improvements (Pro functionality, AI prompts) show good engineering practices.

