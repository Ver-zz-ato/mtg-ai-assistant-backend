import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAdmin } from '@/app/api/_lib/supa';
import { getRevenueCatSubscriberState } from '@/lib/server-pro-check';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Pro entitlement IDs in RevenueCat (must match mobile app and server entitlement checks). */
const PRO_ENTITLEMENT_IDS = ['pro', 'Manatap.ai Pro'] as const;

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

/** Events that can revoke Pro access. CANCELLATION needs a live RC status check; voluntary cancellations stay active until EXPIRATION. */
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
  environment?: string;
  store?: string;
  price?: number;
  price_in_purchased_currency?: number;
  currency?: string;
  expires_date?: string;
};

/** Discord: only these RevenueCat event types (best-effort notifications). */
const DISCORD_NOTIFY_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'CANCELLATION',
  'BILLING_ISSUE',
  'EXPIRATION',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'SUBSCRIPTION_PAUSED',
  'TRANSFER',
]);

const DISCORD_CONTENT_MAX = 1900;

const DISCORD_EVENT_EMOJI: Record<string, string> = {
  INITIAL_PURCHASE: '💰',
  RENEWAL: '🔄',
  CANCELLATION: '📵',
  BILLING_ISSUE: '⚠️',
  EXPIRATION: '❌',
  PRODUCT_CHANGE: '🔀',
  UNCANCELLATION: '✅',
  SUBSCRIPTION_PAUSED: '⏸️',
  TRANSFER: '🔁',
};

const DISCORD_EVENT_LABEL: Record<string, string> = {
  INITIAL_PURCHASE: 'Initial Purchase',
  RENEWAL: 'Renewal',
  CANCELLATION: 'Cancellation',
  BILLING_ISSUE: 'Billing Issue',
  EXPIRATION: 'Expired',
  PRODUCT_CHANGE: 'Product Change',
  UNCANCELLATION: 'Uncancellation',
  SUBSCRIPTION_PAUSED: 'Subscription Paused',
  TRANSFER: 'Transfer',
};

function getEventType(body: RevenueCatWebhookPayload): string {
  const t = body.type;
  if (t) return t;
  const ev = (body as { event?: { type?: string } }).event;
  return ev?.type ?? '';
}

function getEventId(body: RevenueCatWebhookPayload): string | undefined {
  if (body.id) return body.id;
  const ev = (body as { event?: { id?: string } }).event;
  return ev?.id;
}

/** Merge nested `event` when RevenueCat sends api_version + event wrapper. */
function effectiveEvent(body: RevenueCatWebhookPayload): RevenueCatWebhookPayload {
  const ev = (body as { event?: RevenueCatWebhookPayload }).event;
  if (!ev || typeof ev !== 'object') return body;
  return { ...body, ...ev };
}

function formatDiscordAppSubMessage(body: RevenueCatWebhookPayload, eventType: string): string {
  const d = effectiveEvent(body);
  const emoji = DISCORD_EVENT_EMOJI[eventType] ?? '📱';
  const title = DISCORD_EVENT_LABEL[eventType] ?? eventType;
  const lines: string[] = [`${emoji} App Sub: ${title}`];

  if (eventType === 'TRANSFER') {
    const from = (d.transferred_from ?? []).filter(Boolean).join(', ') || '—';
    const to = (d.transferred_to ?? []).filter(Boolean).join(', ') || '—';
    lines.push(`Transferred from: ${from}`);
    lines.push(`Transferred to: ${to}`);
  } else {
    const user = d.app_user_id ?? d.original_app_user_id ?? '—';
    lines.push(`User: ${user}`);
  }

  if (d.product_id) lines.push(`Product: ${d.product_id}`);

  const entIds = d.entitlement_ids ?? (d.entitlement_id ? [d.entitlement_id] : []);
  lines.push(`Entitlements: ${entIds.length ? entIds.join(', ') : 'none'}`);

  if (d.store) lines.push(`Store: ${d.store}`);
  if (d.environment) lines.push(`Env: ${d.environment}`);

  const price = d.price_in_purchased_currency ?? d.price;
  if (price != null && d.currency) lines.push(`Price: ${price} ${d.currency}`);
  else if (price != null) lines.push(`Price: ${String(price)}`);
  else if (d.currency) lines.push(`Currency: ${d.currency}`);

  if (d.expiration_at_ms != null && d.expiration_at_ms !== undefined) {
    lines.push(`Expires: ${new Date(d.expiration_at_ms).toISOString()}`);
  } else if (d.expires_date) {
    lines.push(`Expires: ${d.expires_date}`);
  }

  let content = lines.join('\n');
  if (content.length > DISCORD_CONTENT_MAX) {
    content = content.slice(0, DISCORD_CONTENT_MAX - 3) + '…';
  }
  return content;
}

/**
 * Best-effort Discord notification for app subscription events.
 * Env: DISCORD_APPSUB_WEBHOOK (server-only). Never log the URL.
 */
async function notifyDiscordAppSubscriptionIfNeeded(
  body: RevenueCatWebhookPayload,
  eventType: string
): Promise<void> {
  if (!DISCORD_NOTIFY_EVENTS.has(eventType)) return;
  const url = process.env.DISCORD_APPSUB_WEBHOOK;
  if (!url?.trim()) return;

  const content = formatDiscordAppSubMessage(body, eventType);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      console.warn('[revenuecat webhook] discord notify failed', res.status);
    }
  } catch {
    console.warn('[revenuecat webhook] discord notify failed');
  }
}

function getAdminSupabase(): SupabaseClient {
  const admin = getAdmin();
  if (!admin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY required for RevenueCat webhook');
  }
  return admin;
}

async function logWebhookProcessed(
  supabase: SupabaseClient,
  {
    status,
    reason,
    userId,
    source,
    eventId,
    environment,
    store,
  }: {
    status: 'ok' | 'fail' | 'skipped';
    reason?: string;
    userId?: string;
    source: string;
    eventId?: string;
    environment?: string;
    store?: string;
  }
) {
  try {
    const { logOpsEvent } = await import('@/lib/ops-events');
    await logOpsEvent(supabase, {
      event_type: 'ops_revenuecat_webhook_processed',
      route: 'revenuecat_webhook',
      status,
      reason,
      user_id: userId,
      source,
      event_id: eventId,
      rc_environment: environment,
      rc_store: store,
    });
  } catch {}
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
  supabase: SupabaseClient,
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
    console.info('[RevenueCat webhook] Grant/revoke applied', { userId: userId.slice(0, 8) + '...', isPro, proUntil: proUntil?.slice(0, 10), source });
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

  const eventBody = effectiveEvent(body);
  const eventType = getEventType(eventBody);
  const eventId = getEventId(eventBody);

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

  await notifyDiscordAppSubscriptionIfNeeded(eventBody, eventType);

  const traceLog = process.env.NODE_ENV !== 'production' || process.env.DEBUG_ENTITLEMENTS === '1';
  if (traceLog) {
    console.info('[RevenueCat webhook] Event', { type: eventType, id: eventId });
  }

  const supabase = getAdminSupabase();
  const eventMeta = {
    source: eventType || 'unknown',
    eventId,
    environment: eventBody.environment,
    store: eventBody.store,
  };

  // TRANSFER: app_user_id is not set; use transferred_to for recipients
  if (eventType === 'TRANSFER') {
    const to = eventBody.transferred_to ?? [];
    const isPro = GRANT_EVENTS.has(eventType);
    const proUntil = eventBody.expiration_at_ms
      ? new Date(eventBody.expiration_at_ms).toISOString()
      : null;
    const plan = planFromProductId(eventBody.product_id) ?? 'monthly';

    for (const userId of to) {
      if (userId && typeof userId === 'string') {
        try {
          await updateProStatus(supabase, userId, isPro, proUntil, plan, 'transfer');
          await logWebhookProcessed(supabase, {
            ...eventMeta,
            status: 'ok',
            userId,
          });
        } catch (e) {
          console.error('[RevenueCat webhook] Transfer update failed for', userId, e);
          await logWebhookProcessed(supabase, {
            ...eventMeta,
            status: 'fail',
            reason: 'transfer_update_failed',
            userId,
          });
        }
      }
    }
    return NextResponse.json({ received: true });
  }

  // All other events: app_user_id or original_app_user_id
  const userId = eventBody.app_user_id ?? eventBody.original_app_user_id;
  if (!userId || typeof userId !== 'string') {
    console.warn('[RevenueCat webhook] No app_user_id', { type: eventType });
    await logWebhookProcessed(supabase, {
      ...eventMeta,
      status: 'skipped',
      reason: 'no_user_id',
    });
    return NextResponse.json({ received: true, skipped: 'no_user_id' });
  }

  // Check if this event pertains to our "pro" entitlement
  const entitlementIds = eventBody.entitlement_ids ?? (eventBody.entitlement_id ? [eventBody.entitlement_id] : []);
  const hasProEntitlement = entitlementIds.some((id) => PRO_ENTITLEMENT_IDS.includes(id as (typeof PRO_ENTITLEMENT_IDS)[number]));

  if (GRANT_EVENTS.has(eventType)) {
    if (!hasProEntitlement && eventType !== 'TRANSFER') {
      await logWebhookProcessed(supabase, {
        ...eventMeta,
        status: 'skipped',
        reason: 'not_pro_entitlement',
        userId,
      });
      return NextResponse.json({ received: true, skipped: 'not_pro_entitlement' });
    }
    const proUntil = eventBody.expiration_at_ms
      ? new Date(eventBody.expiration_at_ms).toISOString()
      : null;
    const plan = planFromProductId(eventBody.product_id) ?? 'monthly';
    try {
      await updateProStatus(supabase, userId, true, proUntil, plan, eventType);
    } catch (error) {
      await logWebhookProcessed(supabase, {
        ...eventMeta,
        status: 'fail',
        reason: 'grant_update_failed',
        userId,
      });
      throw error;
    }
    try {
      const { logOpsEvent } = await import('@/lib/ops-events');
      await logOpsEvent(supabase, {
        event_type: 'ops_entitlement_granted',
        route: 'revenuecat_webhook',
        status: 'ok',
        user_id: userId,
        source: eventType,
      });
    } catch {}
    await logWebhookProcessed(supabase, {
      ...eventMeta,
      status: 'ok',
      userId,
    });
  } else if (REVOKE_EVENTS.has(eventType)) {
    if (!hasProEntitlement) {
      await logWebhookProcessed(supabase, {
        ...eventMeta,
        status: 'skipped',
        reason: 'not_pro_entitlement',
        userId,
      });
      return NextResponse.json({ received: true, skipped: 'not_pro_entitlement' });
    }
    if (eventType === 'CANCELLATION') {
      const { fromRevenueCat, debug } = await getRevenueCatSubscriberState(userId);
      if (fromRevenueCat || debug.error) {
        const reason = fromRevenueCat ? 'revenuecat_still_active' : 'revenuecat_status_unknown';
        if (traceLog) {
          console.info('[RevenueCat webhook] Cancellation revoke skipped', {
            userId: userId.slice(0, 8) + '...',
            reason,
            error: debug.error,
          });
        }
        await logWebhookProcessed(supabase, {
          ...eventMeta,
          status: 'skipped',
          reason,
          userId,
        });
        return NextResponse.json({ received: true, skipped: reason });
      }
    }

    // Before revoking: if user has manual/indefinite Pro or active Stripe subscription, don't overwrite.
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_pro, pro_plan, pro_until, stripe_subscription_id')
      .eq('id', userId)
      .single();
    const profileState = profile as {
      is_pro?: boolean | null;
      pro_plan?: string | null;
      pro_until?: string | null;
      stripe_subscription_id?: string | null;
    } | null;
    const stripeSubId = profileState?.stripe_subscription_id;
    const hasManualOrIndefinitePro =
      profileState?.is_pro === true &&
      (profileState.pro_plan === 'manual' ||
        (!profileState.pro_until && !profileState.stripe_subscription_id && !profileState.pro_plan));
    if (hasManualOrIndefinitePro) {
      if (traceLog) {
        console.info('[RevenueCat webhook] Revoke skipped: manual/indefinite Pro active', {
          userId: userId.slice(0, 8) + '...',
          eventType,
        });
      }
      await logWebhookProcessed(supabase, {
        ...eventMeta,
        status: 'skipped',
        reason: 'manual_or_indefinite_pro',
        userId,
      });
      return NextResponse.json({ received: true, skipped: 'manual_or_indefinite_pro' });
    }
    if (stripeSubId && !process.env.STRIPE_SECRET_KEY) {
      await logWebhookProcessed(supabase, {
        ...eventMeta,
        status: 'skipped',
        reason: 'stripe_status_unknown',
        userId,
      });
      return NextResponse.json({ received: true, skipped: 'stripe_status_unknown' });
    }
    if (stripeSubId && process.env.STRIPE_SECRET_KEY) {
      try {
        const { stripe } = await import('@/lib/stripe');
        const sub = await stripe.subscriptions.retrieve(stripeSubId);
        if (sub.status === 'active' || sub.status === 'trialing') {
          if (traceLog) {
            console.info('[RevenueCat webhook] Revoke skipped: Stripe active', { userId: userId.slice(0, 8) + '...', eventType });
          }
          try {
            const { logOpsEvent } = await import('@/lib/ops-events');
            await logOpsEvent(supabase, {
              event_type: 'ops_entitlement_revoke_skipped',
              route: 'revenuecat_webhook',
              status: 'skipped',
              reason: 'stripe_active',
              user_id: userId,
              source: eventType,
            });
          } catch {}
          await logWebhookProcessed(supabase, {
            ...eventMeta,
            status: 'skipped',
            reason: 'stripe_active',
            userId,
          });
          return NextResponse.json({ received: true, skipped: 'stripe_active' });
        }
      } catch {
        await logWebhookProcessed(supabase, {
          ...eventMeta,
          status: 'skipped',
          reason: 'stripe_status_unknown',
          userId,
        });
        return NextResponse.json({ received: true, skipped: 'stripe_status_unknown' });
      }
    }
    try {
      await updateProStatus(supabase, userId, false, null, null, eventType);
    } catch (error) {
      await logWebhookProcessed(supabase, {
        ...eventMeta,
        status: 'fail',
        reason: 'revoke_update_failed',
        userId,
      });
      throw error;
    }
    try {
      const { logOpsEvent } = await import('@/lib/ops-events');
      await logOpsEvent(supabase, {
        event_type: 'ops_entitlement_revoked',
        route: 'revenuecat_webhook',
        status: 'ok',
        user_id: userId,
        source: eventType,
      });
    } catch {}
    await logWebhookProcessed(supabase, {
      ...eventMeta,
      status: 'ok',
      userId,
    });
  } else {
    // TEST, BILLING_ISSUE, etc.: acknowledge but no profile update
    await logWebhookProcessed(supabase, {
      ...eventMeta,
      status: 'skipped',
      reason: 'unhandled_type',
      userId,
    });
    return NextResponse.json({ received: true, skipped: 'unhandled_type' });
  }

  return NextResponse.json({ received: true });
}
