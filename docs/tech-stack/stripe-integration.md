# Stripe Integration Guide

## Overview

Stripe handles all payment processing, subscription management, and billing for Pro subscriptions. The integration uses Stripe Checkout for initial payments and webhooks to keep subscription status in sync with the database.

## Architecture

### Payment Flow

1. **User clicks upgrade** → `frontend/app/pricing/page.tsx`
2. **Checkout session created** → `frontend/app/api/billing/create-checkout-session/route.ts`
3. **User redirected to Stripe** → Stripe Checkout page
4. **Payment successful** → Stripe sends webhook
5. **Webhook handler** → `frontend/app/api/stripe/webhook/route.ts`
6. **Database updated** → `profiles` table updated with Pro status

### Subscription Management

- **Active subscriptions** tracked in `profiles` table
- **Stripe customer ID** stored in `profiles.stripe_customer_id`
- **Stripe subscription ID** stored in `profiles.stripe_subscription_id`
- **Pro status** stored in `profiles.is_pro` and `profiles.pro_plan`

## Setup & Configuration

### Environment Variables

```env
# Required
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxx  # or sk_test_ for development
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx  # From Stripe dashboard

# Optional (for testing)
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxx  # Usually not needed server-side
```

### Key Files

- **Stripe client**: `frontend/lib/stripe.ts`
  - Exports configured Stripe instance

- **Billing helpers**: `frontend/lib/billing.ts`
  - `PRODUCT_TO_PLAN` - Maps Stripe product IDs to plan names
  - `PLAN_TO_PRODUCT` - Reverse mapping
  - `getProductIdForPlan()` - Get Stripe product ID for plan
  - `getPriceIdForProduct()` - Get active price ID for product (cached)

- **Checkout creation**: `frontend/app/api/billing/create-checkout-session/route.ts`
  - Creates Stripe Checkout session
  - Creates Stripe customer if needed
  - Returns checkout URL

- **Webhook handler**: `frontend/app/api/stripe/webhook/route.ts`
  - Handles all Stripe webhook events
  - Updates database based on subscription status
  - Implements idempotency to prevent duplicate processing

## Product & Price Configuration

### Product IDs

Products are configured in `frontend/lib/billing.ts`:

```typescript
export const PRODUCT_TO_PLAN: Record<string, 'monthly'|'yearly'> = {
  'prod_xxxxxxxxxxxxx': 'monthly',
  'prod_yyyyyyyyyyyyy': 'yearly'
};
```

**Important**: Product IDs must match Stripe Dashboard products exactly.

### Price IDs

Price IDs are fetched dynamically from Stripe API (not hardcoded):
- First active recurring price for each product is used
- Cached for 1 hour to reduce API calls
- Automatically handles price updates in Stripe

## Webhook Events Handled

### checkout.session.completed

**Triggered**: When user completes Stripe Checkout

**Handler**: `handleCheckoutCompleted()`

**Actions**:
1. Retrieves subscription details
2. Maps product ID to plan type (`monthly` or `yearly`)
3. Finds user by Stripe customer ID
4. Updates `profiles` table:
   - Sets `is_pro = true`
   - Sets `pro_plan = 'monthly'` or `'yearly'`
   - Stores `stripe_subscription_id`
   - Stores `stripe_customer_id`
   - Sets `pro_since` timestamp
5. Updates Supabase auth `user_metadata` for consistency

### customer.subscription.updated

**Triggered**: When subscription status changes (activated, cancelled, etc.)

**Handler**: `handleSubscriptionUpdated()`

**Actions**:
- If `status === 'active'`: Ensures user has Pro access
- If `status === 'canceled'` or `'past_due'`: Sets `pro_until` date
- Updates `pro_plan` if subscription item changes

### customer.subscription.deleted

**Triggered**: When subscription is permanently deleted

**Handler**: `handleSubscriptionDeleted()`

**Actions**:
- Sets `is_pro = false`
- Clears `stripe_subscription_id`
- Sets `pro_until` to current date

### invoice.payment_succeeded

**Triggered**: When recurring payment succeeds (after initial checkout)

**Handler**: `handleInvoicePaymentSucceeded()`

**Actions**:
- Ensures user Pro status is active (handles edge cases)
- Logs payment for analytics

### invoice.payment_failed

**Triggered**: When payment fails

**Handler**: `handleInvoicePaymentFailed()`

**Actions**:
- Sets `pro_until` date (grace period)
- Logs failure for admin review

## Creating Checkout Sessions

### API Route

```typescript
// POST /api/billing/create-checkout-session
const response = await fetch('/api/billing/create-checkout-session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    plan: 'monthly' // or 'yearly'
  })
});

const { url } = await response.json();
window.location.href = url; // Redirect to Stripe
```

### Flow

1. Validates user authentication
2. Gets or creates Stripe customer
3. Resolves product and price IDs
4. Creates Stripe Checkout session
5. Returns checkout URL

## Webhook Security

### Signature Verification

All webhooks are verified using Stripe's signature:

```typescript
event = stripe.webhooks.constructEvent(
  body,           // Raw request body (must be string)
  sig,            // stripe-signature header
  webhookSecret   // STRIPE_WEBHOOK_SECRET env var
);
```

**Critical**: Must use raw body (not parsed JSON) for verification.

### Idempotency

Events are tracked in-memory to prevent duplicate processing:
- Event IDs stored in `processedEvents` Set
- Maximum 1000 events cached (LRU eviction)
- Duplicate events are ignored and logged

**Production Consideration**: Use Redis or database for distributed systems.

## Database Schema

### Profiles Table Fields

- `is_pro` (boolean) - Primary Pro status flag
- `pro_plan` (string) - `'monthly'`, `'yearly'`, or `'manual'`
- `pro_since` (timestamp) - When Pro status started
- `pro_until` (timestamp) - When Pro status ends (null if active)
- `stripe_customer_id` (string) - Stripe customer ID
- `stripe_subscription_id` (string) - Stripe subscription ID

### Consistency

**Dual Updates**:
1. `profiles` table (primary source of truth)
2. Supabase auth `user_metadata` (for backward compatibility)

Both are updated in webhook handlers to maintain consistency.

## Testing

### Test Mode

Use Stripe test mode keys:
- `STRIPE_SECRET_KEY=sk_test_...`
- Test webhook secret from Stripe Dashboard → Developers → Webhooks → Test endpoint

### Webhook Testing

1. Use Stripe CLI:
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

2. Trigger test events:
```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
```

### Common Test Scenarios

- **New subscription**: `checkout.session.completed` → User should get Pro access
- **Payment failed**: `invoice.payment_failed` → Pro should be revoked after grace period
- **Subscription cancelled**: `customer.subscription.deleted` → Pro should be immediately revoked
- **Subscription renewed**: `invoice.payment_succeeded` → Pro should remain active

## Troubleshooting

### Webhook Not Receiving Events

**Symptoms**: User pays but doesn't get Pro access

**Solutions**:
1. Check Stripe Dashboard → Webhooks → Endpoint status
2. Verify `STRIPE_WEBHOOK_SECRET` matches endpoint secret
3. Check server logs for webhook processing errors
4. Verify webhook endpoint URL is correct in Stripe Dashboard
5. Test with Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook`

### Signature Verification Fails

**Symptoms**: Webhook returns 400 "Invalid signature"

**Solutions**:
1. Verify `STRIPE_WEBHOOK_SECRET` is correct
2. Ensure raw body is used (not parsed JSON) - see `route.ts` line 16
3. Check webhook secret matches endpoint in Stripe Dashboard
4. Verify request hasn't been modified by middleware

### User Not Getting Pro Access

**Symptoms**: Payment succeeds but `is_pro` remains false

**Solutions**:
1. Check webhook handler logs for errors
2. Verify customer ID matches in `profiles.stripe_customer_id`
3. Check if webhook event was processed (idempotency logs)
4. Manually trigger webhook for the event from Stripe Dashboard
5. Check database for any constraint errors

### Duplicate Pro Status Updates

**Symptoms**: Multiple webhook events updating same user

**Solutions**:
1. Idempotency should prevent this (check `processedEvents` Set)
2. If using multiple servers, implement distributed idempotency (Redis)
3. Check webhook endpoint isn't being called multiple times

### Product ID Mismatches

**Symptoms**: "Unknown product ID" errors in logs

**Solutions**:
1. Verify `PRODUCT_TO_PLAN` mapping in `billing.ts` matches Stripe Dashboard
2. Check product IDs haven't been changed in Stripe
3. Update mapping if products were recreated in Stripe

## Best Practices

1. **Always verify webhook signatures**
   - Never skip signature verification
   - Use raw body for verification

2. **Implement idempotency**
   - Prevent duplicate processing
   - Handle webhook retries gracefully

3. **Update both sources**
   - Update `profiles` table (primary)
   - Update `user_metadata` (compatibility)
   - Use transactions if possible

4. **Log all webhook events**
   - Helps debug payment issues
   - Track subscription lifecycle

5. **Handle all subscription states**
   - Active, canceled, past_due, trialing
   - Set appropriate `pro_until` dates

6. **Test webhooks thoroughly**
   - Use Stripe test mode
   - Test all event types
   - Verify database updates

## Related Files

- `frontend/lib/stripe.ts` - Stripe client configuration
- `frontend/lib/billing.ts` - Product/plan mapping and helpers
- `frontend/app/api/billing/create-checkout-session/route.ts` - Checkout creation
- `frontend/app/api/stripe/webhook/route.ts` - Webhook handler
- `docs/stripe-production-checklist.md` - Production deployment checklist

