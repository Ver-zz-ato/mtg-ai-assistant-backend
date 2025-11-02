# System Integrations Overview

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    User Browser                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   React UI   │  │  PostHog JS   │  │  Supabase   │ │
│  │  Components  │  │   (Client)    │  │  (Client)   │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
└─────────┼──────────────────┼──────────────────┼─────────┘
          │                  │                  │
          │ HTTP             │ Events           │ Auth
          │                  │                  │
┌─────────▼──────────────────▼──────────────────▼─────────┐
│              Next.js Application Server                   │
│  ┌────────────────────────────────────────────────────┐  │
│  │              Middleware Layer                       │  │
│  │  • Supabase auth cookie refresh                    │  │
│  │  • Maintenance mode checks                         │  │
│  │  • First visit tracking                            │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  API Routes  │  │  API Routes  │  │  API Routes  │  │
│  │  (Node.js)   │  │   (Edge)     │  │  (Admin)     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
└─────────┼──────────────────┼──────────────────┼──────────┘
          │                  │                  │
          │                  │                  │
┌─────────▼──────────────────▼──────────────────▼──────────┐
│                    External Services                      │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Supabase   │  │   PostHog     │  │    Stripe    │  │
│  │  PostgreSQL │  │   Analytics  │  │   Payments   │  │
│  │   Auth      │  │   (Server)    │  │   Webhooks   │  │
│  └─────────────┘  └───────────────┘  └──────────────┘  │
└───────────────────────────────────────────────────────────┘
```

## Data Flow Patterns

### User Signup Flow

```
1. User submits signup form (Client)
   ↓
2. Supabase.auth.signUp() → Creates auth user
   ↓
3. Server-side: captureServer('signup_completed')
   ↓
4. Client-side: capture('signup_completed') [if consent granted]
   ↓
5. Supabase sends verification email
   ↓
6. User clicks email link → Redirected to app
   ↓
7. EmailVerificationSuccessPopup → captureServer('email_verified_success')
```

### Pro Subscription Flow

```
1. User clicks "Upgrade" on pricing page (Client)
   ↓
2. POST /api/billing/create-checkout-session
   ↓
3. Creates Stripe Checkout session
   ↓
4. User redirected to Stripe
   ↓
5. User completes payment
   ↓
6. Stripe sends webhook → POST /api/stripe/webhook
   ↓
7. Webhook handler updates:
   - profiles.is_pro = true
   - profiles.pro_plan = 'monthly'/'yearly'
   - profiles.stripe_subscription_id
   - auth.user_metadata.pro = true
   ↓
8. User redirected back to app with Pro access
```

### Chat Message Flow

```
1. User sends message in chat (Client)
   ↓
2. POST /api/chat → Server-side
   ↓
3. Supabase: Insert message into chat_messages
   ↓
4. LLM API call (external)
   ↓
5. Supabase: Insert assistant response
   ↓
6. Server-side: captureServer('chat_sent')
   ↓
7. Client-side: capture('chat_sent') [if consent]
   ↓
8. Response streamed to client
```

## Integration Points

### Supabase ↔ Next.js

**Connection**: Supabase client libraries
- **Browser**: `@supabase/ssr` with cookie-based auth
- **Server**: `@supabase/auth-helpers-nextjs` for API routes
- **Admin**: `@supabase/supabase-js` with service role key

**Key Integration Files**:
- `frontend/lib/supabase/client.ts` - Browser client
- `frontend/lib/server-supabase.ts` - Server client
- `frontend/app/api/_lib/supa.ts` - Admin client
- `frontend/middleware.ts` - Auth cookie refresh

### PostHog ↔ Next.js

**Connection**: PostHog SDK (client + server)
- **Browser**: `posthog-js` initialized in `Providers.tsx`
- **Server**: `posthog-node` in `lib/server/analytics.ts`

**Key Integration Files**:
- `frontend/components/Providers.tsx` - Client initialization
- `frontend/lib/ph.ts` - Client-side helpers
- `frontend/lib/server/analytics.ts` - Server-side helpers
- `frontend/app/api/analytics/track-signup/route.ts` - Server-side signup tracking
- `frontend/app/api/analytics/track-event/route.ts` - Generic server-side tracking

### Stripe ↔ Next.js

**Connection**: Stripe Node.js SDK
- **Server**: `stripe` package for API calls
- **Webhooks**: HTTP endpoint for Stripe events

**Key Integration Files**:
- `frontend/lib/stripe.ts` - Stripe client
- `frontend/lib/billing.ts` - Product/plan mapping
- `frontend/app/api/billing/create-checkout-session/route.ts` - Checkout creation
- `frontend/app/api/stripe/webhook/route.ts` - Webhook handler

### Supabase ↔ PostHog

**Connection**: User identification
- User ID from Supabase auth → PostHog `identify()`
- User properties synced to PostHog user profiles

### Stripe ↔ Supabase

**Connection**: Subscription status sync
- Stripe customer ID stored in `profiles.stripe_customer_id`
- Stripe subscription ID stored in `profiles.stripe_subscription_id`
- Webhook updates `profiles.is_pro` based on subscription status

## Common Integration Patterns

### Pattern 1: Authenticated API Route

```typescript
// 1. Get authenticated user
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

// 2. Perform operation
const { data, error } = await supabase
  .from('table')
  .select('*')
  .eq('user_id', user.id);

// 3. Track analytics
await captureServer('operation_completed', { user_id: user.id });

// 4. Return response
return NextResponse.json({ ok: true, data });
```

### Pattern 2: Admin Operation

```typescript
// 1. Check admin access
const supabase = await getServerSupabase();
const { data: { user } } = await supabase.auth.getUser();
if (!user || !isAdmin(user)) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// 2. Use admin client for bypass RLS
const admin = getAdmin();
const { data } = await admin
  .from('profiles')
  .select('*')
  .eq('is_pro', true);

// 3. Audit log
await admin.from('admin_audit').insert({
  actor_id: user.id,
  action: 'operation_name',
  target: data.length
});

// 4. Return response
return NextResponse.json({ ok: true, data });
```

### Pattern 3: Dual Tracking (Client + Server)

```typescript
// Client-side (may fail if no consent)
capture('event_name', { property: value });

// Server-side (always works)
try {
  await fetch('/api/analytics/track-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'event_name',
      properties: { property: value, user_id: userId }
    })
  });
} catch (e) {
  // Silent fail - best effort
}
```

### Pattern 4: Webhook Handler

```typescript
// 1. Verify signature
event = stripe.webhooks.constructEvent(body, sig, webhookSecret);

// 2. Check idempotency
if (processedEvents.has(event.id)) return;

// 3. Handle event
switch (event.type) {
  case 'checkout.session.completed':
    await handleCheckout(event);
    break;
}

// 4. Mark as processed
processedEvents.add(event.id);
```

## Error Handling Flow

### Client-Side Errors

```
Error occurs in component
  ↓
Error boundary catches (if present)
  ↓
Error logged to console
  ↓
User sees error message
  ↓
(Optional) captureServer('error_boundary_triggered')
```

### Server-Side Errors

```
Error occurs in API route
  ↓
Try/catch block handles
  ↓
Error logged to console
  ↓
Return error response to client
  ↓
(Optional) captureServer('api_error')
```

### Database Errors

```
Supabase query fails
  ↓
Error object returned
  ↓
Check error.code and error.message
  ↓
Handle specific cases (RLS violation, constraint, etc.)
  ↓
Return appropriate HTTP status
```

## Troubleshooting Integration Issues

### Issue: User authenticated but can't access data

**Check**:
1. RLS policies on Supabase table
2. User ID matches in query filters
3. Admin client isn't being used accidentally

**Solution**: Review RLS policies, verify query filters

### Issue: Events not tracked in PostHog

**Check**:
1. Cookie consent granted (client-side)
2. PostHog keys configured correctly
3. PostHog initialization successful
4. Server-side tracking endpoint accessible

**Solution**: Use server-side tracking for critical events, check PostHog dashboard

### Issue: Stripe webhook not updating Pro status

**Check**:
1. Webhook signature verification passing
2. Customer ID matches in database
3. Webhook handler logs show processing
4. Database constraints not blocking update

**Solution**: Check webhook logs, verify customer ID mapping, test with Stripe CLI

### Issue: Build fails with module errors

**Check**:
1. All dependencies in package.json
2. Import paths use `@/` alias correctly
3. TypeScript types are correct
4. Environment variables set

**Solution**: Run `npm install`, check tsconfig.json paths, verify env vars

## Related Documentation

- `docs/tech-stack/posthog-integration.md` - PostHog setup and usage
- `docs/tech-stack/supabase-integration.md` - Supabase setup and usage
- `docs/tech-stack/stripe-integration.md` - Stripe setup and usage
- `docs/tech-stack/nextjs-configuration.md` - Next.js configuration

## Quick Reference

### Environment Variables Checklist

```
✅ NEXT_PUBLIC_SUPABASE_URL
✅ NEXT_PUBLIC_SUPABASE_ANON_KEY
✅ SUPABASE_SERVICE_ROLE_KEY
✅ NEXT_PUBLIC_POSTHOG_KEY
✅ NEXT_PUBLIC_POSTHOG_HOST
✅ STRIPE_SECRET_KEY
✅ STRIPE_WEBHOOK_SECRET
✅ ADMIN_USER_IDS (optional)
✅ ADMIN_EMAILS (optional)
```

### Common File Locations

- **Supabase**: `lib/supabase/`, `lib/server-supabase.ts`, `app/api/_lib/supa.ts`
- **PostHog**: `lib/ph.ts`, `lib/server/analytics.ts`, `components/Providers.tsx`
- **Stripe**: `lib/stripe.ts`, `lib/billing.ts`, `app/api/stripe/webhook/route.ts`
- **Next.js Config**: `middleware.ts`, `app/layout.tsx`, `package.json`

### Support Contacts

- **Supabase Issues**: Check Supabase dashboard → Logs
- **PostHog Issues**: Check PostHog dashboard → Events
- **Stripe Issues**: Check Stripe dashboard → Webhooks → Logs
- **Next.js Issues**: Check build logs, runtime logs

