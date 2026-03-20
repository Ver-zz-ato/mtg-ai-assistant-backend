import { NextRequest, NextResponse } from 'next/server';
import { getAdmin } from '@/app/api/_lib/supa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Pro entitlement ID in RevenueCat (must match mobile app). */
const PRO_ENTITLEMENT_ID = 'pro';

const processedEvents = new Set<string>();
const MAX_CACHE_SIZE = 500;

/** Events that grant Pro access. */
const GRANT_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
  'TEMPORARY_ENTITLEMENT_GRANT',
  'REFUND_REVERSED',
  'TRANSFER',
]);

/** Events that revoke Pro access. */
const REVOKE_EVENTS = new Set(['CANCELLATION', 'EXPIRATION']);

/** RevenueCat webhook payload shape. */
type RevenueCatWebhookPayload = {
  type: string;
  id?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  entitlement_ids?: string[] | null;
  entitlement_id?: string;
  product_id?: string;
  expiration_at_ms?: number | null;
  purchased_at_ms?: number;
  transferred_from?: string[];
  transferred_to?: string[];
};

function getAdminSupabase() {
  const admin = getAdmin();
  if (!admin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY required for RevenueCat webhook');
  }
  return admin;
}

/** Derive pro_plan from product_id. */
function planFromProductId(productId: string | undefined): 'monthly' | 'yearly' | null {
  if (!productId) return null;
  const lower = productId.toLowerCase();
  if (lower.includes('annual') || lower.includes('yearly') || lower.includes('year')) return 'yearly';
  if (lower.includes('month') || lower.includes('monthly')) return 'monthly';
  return null;
}

/** Update Supabase profiles and user_metadata for Pro status. */
async function updateProStatus(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  isPro: boolean,
  proUntil: string | null,
  proPlan: 'monthly' | 'yearly' | null,
  source: string
) {
  const updateData = {
    is_pro: isPro,
    pro_until: proUntil,
    pro_plan: proPlan ?? (isPro ? 'monthly' : null),
    pro_since: isPro ? new Date().toISOString() : null,
    stripe_customer_id: undefined as string | undefined,
    stripe_subscription_id: undefined as string | undefined,
  };

  // When revoking, clear Stripe-related fields only if we're sure this user's Pro came from RevenueCat.
  // We don't clear stripe_* here to avoid overwriting Stripe subscribers. Stripe webhook handles its own.
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      is_pro: updateData.is_pro,
      pro_until: updateData.pro_until,
      pro_plan: updateData.pro_plan,
      ...(isPro ? { pro_since: updateData.pro_since } : {}),
    })
    .eq('id', userId);

  if (profileError) {
    console.error('[RevenueCat webhook] Failed to update profiles:', { userId, error: profileError.message, source });
    throw profileError;
  }

  // Keep user_metadata in sync (same pattern as Stripe webhook)
  try {
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    if (userData?.user) {
      const current = (userData.user.user_metadata || {}) as Record<string, unknown>;
      await supabase.auth.admin.updateUserById(userId, {
        user_metadata: { ...current, pro: isPro, is_pro: isPro },
      });
    }
  } catch (authErr) {
    console.error('[RevenueCat webhook] Failed to update user_metadata:', { userId, error: authErr });
    // Non-fatal: profile is the source of truth
  }

  const traceLog = process.env.NODE_ENV !== 'production' || process.env.DEBUG_ENTITLEMENTS === '1';
  if (traceLog) {
    console.info('[RevenueCat webhook] Grant/revoke applied', { userId: userId.slice(0, 8) + '…', isPro, proUntil: proUntil?.slice(0, 10), source });
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const expectedAuth = process.env.REVENUECAT_WEBHOOK_AUTH ?? process.env.REVENUECAT_WEBHOOK_AUTH_HEADER;

  if (expectedAuth?.trim()) {
    const expected = expectedAuth.startsWith('Bearer ') ? expectedAuth : `Bearer ${expectedAuth}`;
    if (authHeader !== expected) {
      console.warn('[RevenueCat webhook] Unauthorized: auth header mismatch');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let body: RevenueCatWebhookPayload;
  try {
    body = (await req.json()) as RevenueCatWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = body.type || '';
  const eventId = body.id;

  // Idempotency: in-memory (same pattern as Stripe webhook)
  if (eventId && processedEvents.has(eventId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (eventId) {
    if (processedEvents.size >= MAX_CACHE_SIZE) {
      const first = processedEvents.values().next().value;
      if (first) processedEvents.delete(first);
    }
    processedEvents.add(eventId);
  }

  const traceLog = process.env.NODE_ENV !== 'production' || process.env.DEBUG_ENTITLEMENTS === '1';
  if (traceLog) {
    console.info('[RevenueCat webhook] Event', { type: eventType, id: eventId });
  }

  const supabase = getAdminSupabase();

  // TRANSFER: app_user_id is not set; use transferred_to for recipients
  if (eventType === 'TRANSFER') {
    const to = body.transferred_to ?? [];
    const isPro = GRANT_EVENTS.has(eventType);
    const proUntil = body.expiration_at_ms
      ? new Date(body.expiration_at_ms).toISOString()
      : null;
    const plan = planFromProductId(body.product_id) ?? 'monthly';

    for (const userId of to) {
      if (userId && typeof userId === 'string') {
        try {
          await updateProStatus(supabase, userId, isPro, proUntil, plan, 'transfer');
        } catch (e) {
          console.error('[RevenueCat webhook] Transfer update failed for', userId, e);
        }
      }
    }
    return NextResponse.json({ received: true });
  }

  // All other events: app_user_id or original_app_user_id
  const userId = body.app_user_id ?? body.original_app_user_id;
  if (!userId || typeof userId !== 'string') {
    console.warn('[RevenueCat webhook] No app_user_id', { type: eventType });
    return NextResponse.json({ received: true, skipped: 'no_user_id' });
  }

  // Check if this event pertains to our "pro" entitlement
  const entitlementIds = body.entitlement_ids ?? (body.entitlement_id ? [body.entitlement_id] : []);
  const hasProEntitlement = entitlementIds.includes(PRO_ENTITLEMENT_ID);

  if (GRANT_EVENTS.has(eventType)) {
    if (!hasProEntitlement && eventType !== 'TRANSFER') {
      return NextResponse.json({ received: true, skipped: 'not_pro_entitlement' });
    }
    const proUntil = body.expiration_at_ms
      ? new Date(body.expiration_at_ms).toISOString()
      : null;
    const plan = planFromProductId(body.product_id) ?? 'monthly';
    await updateProStatus(supabase, userId, true, proUntil, plan, eventType);
  } else if (REVOKE_EVENTS.has(eventType)) {
    if (!hasProEntitlement) {
      return NextResponse.json({ received: true, skipped: 'not_pro_entitlement' });
    }
    // Before revoking: if user has active Stripe subscription, don't overwrite
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_subscription_id')
      .eq('id', userId)
      .single();
    const stripeSubId = (profile as { stripe_subscription_id?: string } | null)?.stripe_subscription_id;
    if (stripeSubId && process.env.STRIPE_SECRET_KEY) {
      try {
        const { stripe } = await import('@/lib/stripe');
        const sub = await stripe.subscriptions.retrieve(stripeSubId);
        if (sub.status === 'active' || sub.status === 'trialing') {
          if (traceLog) {
            console.info('[RevenueCat webhook] Revoke skipped: Stripe active', { userId: userId.slice(0, 8) + '…', eventType });
          }
          return NextResponse.json({ received: true, skipped: 'stripe_active' });
        }
      } catch {
        // Stripe fetch failed; proceed with revoke
      }
    }
    await updateProStatus(supabase, userId, false, null, null, eventType);
  } else {
    // TEST, BILLING_ISSUE, etc.: acknowledge but no profile update
    return NextResponse.json({ received: true, skipped: 'unhandled_type' });
  }

  return NextResponse.json({ received: true });
}
