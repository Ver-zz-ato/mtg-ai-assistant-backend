# Stripe Pro Subscription Implementation Guide

## Overview

This document describes the complete implementation of Pro subscription functionality using Stripe. The system provides **immediate Pro status recognition** after payment, with webhooks as a backup mechanism for reliability.

## Architecture Flow

```
User clicks "Upgrade" 
  ↓
Create Checkout Session (POST /api/billing/create-checkout-session)
  ↓
Redirect to Stripe Checkout
  ↓
User completes payment
  ↓
Stripe redirects to /thank-you?session_id=xxx&plan=monthly
  ↓
Thank-you page calls /api/billing/confirm-payment (IMMEDIATE SYNC)
  ↓
Pro status updated instantly (1-2 seconds)
  ↓
[Parallel] Stripe webhook fires (backup, may take 30+ seconds)
  ↓
Webhook confirms/updates Pro status
```

## Key Components

### 1. Checkout Session Creation

**File**: `frontend/app/api/billing/create-checkout-session/route.ts`

**Purpose**: Creates a Stripe checkout session and redirects user to Stripe's payment page.

**Flow**:
1. Validates CSRF origin
2. Authenticates user
3. Gets or creates Stripe customer (stores `stripe_customer_id` in `profiles` table)
4. Resolves product ID and price ID from plan (`monthly` or `yearly`)
5. Creates Stripe checkout session with:
   - `mode: 'subscription'`
   - Customer ID
   - Success URL: `/thank-you?session_id={CHECKOUT_SESSION_ID}&plan={plan}`
   - Cancel URL: `/pricing?status=cancel`
   - Metadata: `app_user_id` and `plan`

**Important**: The `{CHECKOUT_SESSION_ID}` placeholder is automatically replaced by Stripe with the actual session ID.

**Example Request**:
```typescript
POST /api/billing/create-checkout-session
{
  "plan": "monthly" // or "yearly"
}
```

**Example Response**:
```typescript
{
  "ok": true,
  "url": "https://checkout.stripe.com/c/pay/cs_xxx..."
}
```

### 2. Immediate Pro Status Sync (Primary Method)

**File**: `frontend/app/api/billing/confirm-payment/route.ts`

**Purpose**: Immediately checks Stripe checkout session and updates Pro status **without waiting for webhook**. This provides instant user feedback.

**Flow**:
1. Receives `session_id` from query parameter
2. Authenticates user
3. Retrieves checkout session from Stripe API using `stripe.checkout.sessions.retrieve()`
4. Verifies:
   - `payment_status === 'paid'`
   - `status === 'complete'`
   - Session belongs to authenticated user (via customer ID or metadata)
5. Retrieves subscription details
6. **Immediately updates**:
   - `profiles.is_pro = true`
   - `profiles.pro_plan = 'monthly' | 'yearly'`
   - `profiles.stripe_subscription_id`
   - `profiles.stripe_customer_id`
   - `profiles.pro_since`
   - `user_metadata.pro = true`
   - `user_metadata.is_pro = true`

**Security**:
- Verifies session belongs to authenticated user
- Checks customer ID match OR metadata user ID match
- Returns 403 if ownership cannot be verified

**Example Request**:
```typescript
GET /api/billing/confirm-payment?session_id=cs_test_xxx
```

**Example Response**:
```typescript
{
  "ok": true,
  "isPro": true,
  "plan": "monthly",
  "subscriptionId": "sub_xxx",
  "message": "Pro status updated successfully"
}
```

**Why This Exists**: Webhooks can be delayed by 30+ seconds. This endpoint provides **instant** Pro status (1-2 seconds) for better UX.

### 3. Thank-You Landing Page

**File**: `frontend/app/thank-you/page.tsx`

**Purpose**: Landing page after successful payment that immediately syncs Pro status and shows confirmation.

**Flow**:
1. Extracts `session_id` and `plan` from URL query parameters
2. Automatically calls `/api/billing/confirm-payment?session_id=xxx`
3. Shows loading state while syncing
4. On success:
   - Displays thank you message
   - Lists all unlocked Pro features
   - Forces hard refresh after 1 second to ensure all components recognize Pro status
5. On error:
   - Shows error message with reassurance
   - Explains webhook will activate Pro status within minutes

**Features**:
- Wrapped in Suspense boundary (required for `useSearchParams()`)
- Hard refresh ensures Pro status recognized across entire app
- Beautiful UI showing all Pro features
- Action buttons to start using Pro features

### 4. Webhook Handler (Backup Method)

**File**: `frontend/app/api/stripe/webhook/route.ts`

**Purpose**: Receives Stripe webhook events and updates Pro status. Acts as backup/confirmation for immediate sync.

**Security**:
- Verifies webhook signature using `STRIPE_WEBHOOK_SECRET`
- Uses raw request body (not parsed JSON) for signature verification
- Idempotency: Tracks processed event IDs to prevent duplicate processing

**Handled Events**:

#### `checkout.session.completed`
- **When**: User completes Stripe checkout
- **Action**: 
  - Finds user by `stripe_customer_id` or `metadata.app_user_id`
  - Updates `profiles.is_pro = true`
  - Updates `user_metadata.pro = true` and `is_pro = true`
  - Stores subscription ID and plan

#### `customer.subscription.updated`
- **When**: Subscription status changes (activated, cancelled, etc.)
- **Action**:
  - If `status === 'active'`: Ensures user is Pro
  - If `status === 'canceled'`: Sets `is_pro = false` and `pro_until` date

#### `customer.subscription.deleted`
- **When**: Subscription is permanently deleted
- **Action**: Removes Pro status immediately

#### `invoice.payment_succeeded`
- **When**: Recurring payment succeeds (after initial checkout)
- **Action**: Ensures user is marked as Pro (handles edge cases)

#### `invoice.payment_failed`
- **When**: Payment fails
- **Action**: Logs failure (could trigger notifications in future)

**Webhook Endpoint**: `https://www.manatap.ai/api/stripe/webhook`

**Configuration**: Must be configured in Stripe Dashboard with:
- URL: `https://www.manatap.ai/api/stripe/webhook`
- Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
- Secret: Stored in `STRIPE_WEBHOOK_SECRET` environment variable

### 5. Pro Status Checking

**Server-Side**: `frontend/lib/server-pro-check.ts`

**Function**: `checkProStatus(userId: string): Promise<boolean>`

**Logic**: Checks **both** sources (OR logic):
- `profiles.is_pro === true` (primary source)
- `user_metadata.pro === true` OR `user_metadata.is_pro === true` (fallback)

**Why Both**: Ensures backward compatibility and handles edge cases where one source might be out of sync.

**Client-Side**: `frontend/hooks/useProStatus.ts`

**Hook**: `useProStatus()`

**Features**:
- Checks both `profiles.is_pro` and `user_metadata`
- Real-time subscription to `profiles` table changes
- Falls back to API endpoint if direct query fails
- Returns `{ isPro: boolean, loading: boolean }`

**API Endpoint**: `frontend/app/api/user/pro-status/route.ts`

**Purpose**: Server-side Pro status check endpoint used by client components.

**Returns**:
```typescript
{
  "ok": true,
  "isPro": true,
  "fromProfile": true,
  "fromMetadata": false,
  "profileError": null
}
```

## Database Schema

### `profiles` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | User ID (foreign key to `auth.users`) |
| `is_pro` | BOOLEAN | Primary Pro status flag |
| `pro_plan` | TEXT | `'monthly'`, `'yearly'`, or `'manual'` |
| `pro_since` | TIMESTAMP | When Pro status started |
| `pro_until` | TIMESTAMP | When Pro status ends (NULL if active) |
| `stripe_customer_id` | TEXT | Stripe customer ID |
| `stripe_subscription_id` | TEXT | Stripe subscription ID |

### Supabase Auth `user_metadata`

| Key | Type | Description |
|-----|------|-------------|
| `pro` | BOOLEAN | Pro status flag (legacy) |
| `is_pro` | BOOLEAN | Pro status flag (current) |

**Note**: Both `pro` and `is_pro` are checked for backward compatibility.

## Product Configuration

**File**: `frontend/lib/billing.ts`

**Product IDs** (from Stripe Dashboard):
```typescript
export const PRODUCT_TO_PLAN: Record<string, 'monthly'|'yearly'> = {
  'prod_TDaREGWGBQSSBQ': 'monthly',  // Monthly Pro
  'prod_TDaRNmnrBcfWIZ': 'yearly',   // Yearly Pro
};
```

**Price IDs**: Fetched dynamically from Stripe API (not hardcoded)
- Cached for 5 minutes to reduce API calls
- Uses most recently created active recurring price

## Pro-Gated Features

All Pro features use the standardized `checkProStatus()` function (server-side) or `useProStatus()` hook (client-side).

**Server-Side Features** (API routes):
- `/api/deck/health-suggestions` - AI deck health suggestions
- `/api/decks/[id]/versions` - Deck versioning (GET, POST, PUT)
- `/api/watchlist/update` - Watchlist updates
- `/api/chat/threads/create` - Chat thread creation (higher limits)
- `/api/chat` - Chat interactions (higher rate limits)
- `/api/chat/stream` - Streaming chat (higher rate limits)
- `/api/deck/analyze` - AI deck analysis (higher rate limits)
- `/api/deck/compare-ai` - AI deck comparison
- `/api/wishlists/fix-names/apply` - Card name fixes
- `/api/custom-cards/save` - Custom card creation (higher quotas)

**Client-Side Features**:
- Deck versioning UI
- Watchlist features
- Pro badge display
- Enhanced chat limits
- Advanced deck statistics

## Error Handling

### Immediate Sync Fails
- Thank-you page shows error message
- Reassures user that webhook will activate Pro status
- User can continue using site (webhook will catch up)

### Webhook Fails
- Logged to console
- Stripe retries automatically
- Admin can manually trigger sync via admin panel

### User Not Found
- Webhook logs error with full context
- Admin can investigate via `/admin/monetize` page
- Fallback to metadata lookup if customer ID missing

## Security Considerations

1. **CSRF Protection**: Checkout session creation validates Origin header
2. **Webhook Signature Verification**: All webhooks verified using Stripe signature
3. **User Ownership Verification**: Immediate sync verifies session belongs to authenticated user
4. **Idempotency**: Webhook events tracked to prevent duplicate processing
5. **Authentication**: All endpoints require authenticated user

## Environment Variables

Required environment variables:

```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_xxx  # or sk_test_xxx for development
STRIPE_WEBHOOK_SECRET=whsec_xxx  # From Stripe Dashboard webhook settings

# Supabase (for admin operations)
SUPABASE_SERVICE_ROLE_KEY=xxx  # For updating user_metadata
```

## Testing

### Test Flow

1. **Create Test Subscription**:
   ```bash
   # Use Stripe test mode
   # Create checkout session
   POST /api/billing/create-checkout-session
   { "plan": "monthly" }
   ```

2. **Complete Payment**:
   - Use Stripe test card: `4242 4242 4242 4242`
   - Any future expiry date
   - Any CVC

3. **Verify Immediate Sync**:
   - Should redirect to `/thank-you?session_id=xxx&plan=monthly`
   - Pro status should update within 1-2 seconds
   - Check `profiles.is_pro` and `user_metadata.is_pro`

4. **Verify Webhook**:
   - Check Stripe Dashboard → Webhooks → Recent events
   - Should see `checkout.session.completed` event
   - Verify database updated (webhook may be delayed)

### Manual Testing

**Check Pro Status**:
```bash
GET /api/user/pro-status
```

**Admin Sync** (if needed):
- Use `/admin/monetize` page
- View all subscribers
- Manually toggle Pro status if needed

## Troubleshooting

### Pro Status Not Updating

1. **Check Immediate Sync**:
   - Open browser console on thank-you page
   - Check for errors in `/api/billing/confirm-payment` call
   - Verify `session_id` is present in URL

2. **Check Webhook**:
   - Stripe Dashboard → Webhooks → Recent events
   - Look for `checkout.session.completed` event
   - Check if webhook was delivered successfully
   - Verify webhook secret matches `STRIPE_WEBHOOK_SECRET`

3. **Check Database**:
   ```sql
   SELECT id, email, is_pro, pro_plan, stripe_customer_id, stripe_subscription_id 
   FROM profiles 
   WHERE email = 'user@example.com';
   ```

4. **Check User Metadata**:
   - Supabase Dashboard → Authentication → Users
   - Find user → Check `user_metadata` for `pro` or `is_pro`

### Webhook Not Firing

1. **Verify Webhook Configuration**:
   - Stripe Dashboard → Webhooks
   - Ensure URL is correct: `https://www.manatap.ai/api/stripe/webhook`
   - Ensure events are selected
   - Test webhook delivery

2. **Check Server Logs**:
   - Look for webhook signature verification errors
   - Check for 400/500 responses

3. **Verify Environment Variables**:
   - Ensure `STRIPE_WEBHOOK_SECRET` is set correctly
   - Secret must match Stripe Dashboard webhook secret

### Customer ID Mismatch

**Symptom**: Webhook can't find user by `stripe_customer_id`

**Solution**: Webhook falls back to `metadata.app_user_id` lookup

**Prevention**: Always create Stripe customer before checkout and save `stripe_customer_id` to profile

## Admin Tools

### Subscriber Overview

**Page**: `/admin/monetize`

**Features**:
- View all subscribers
- See Stripe subscription status
- View subscription details (period end, cancel status)
- Search and filter subscribers
- Manually toggle Pro status if needed

### Webhook Status

**Endpoint**: `/api/admin/stripe/webhook-status`

**Returns**:
- Webhook secret configuration status
- Stripe API connection status
- Recent subscriptions from database
- Recent Pro status changes
- Potential out-of-sync subscriptions

## Best Practices

1. **Always Use Standardized Pro Checks**: Use `checkProStatus()` (server) or `useProStatus()` (client)
2. **Check Both Sources**: Always check both `profiles.is_pro` AND `user_metadata.pro/is_pro`
3. **Handle Edge Cases**: Webhook may fire before immediate sync completes (idempotent updates handle this)
4. **Log Everything**: All Pro status updates are logged for debugging
5. **Monitor Webhooks**: Check Stripe Dashboard regularly for failed webhook deliveries

## Future Improvements

1. **Email Notifications**: Send welcome email when Pro activated
2. **Payment Failure Handling**: Notify users when payment fails
3. **Subscription Management**: Enhanced customer portal integration
4. **Analytics**: Track conversion rates, churn, etc.
5. **A/B Testing**: Test different pricing strategies

## Related Files

- `frontend/app/api/billing/create-checkout-session/route.ts` - Checkout session creation
- `frontend/app/api/billing/confirm-payment/route.ts` - Immediate Pro sync
- `frontend/app/api/stripe/webhook/route.ts` - Webhook handler
- `frontend/app/thank-you/page.tsx` - Thank-you landing page
- `frontend/lib/server-pro-check.ts` - Server-side Pro check utility
- `frontend/hooks/useProStatus.ts` - Client-side Pro status hook
- `frontend/lib/billing.ts` - Product/plan configuration
- `frontend/app/api/user/pro-status/route.ts` - Pro status API endpoint

## Support

For issues or questions:
1. Check server logs for errors
2. Verify Stripe Dashboard webhook events
3. Check database Pro status
4. Review this document for troubleshooting steps
