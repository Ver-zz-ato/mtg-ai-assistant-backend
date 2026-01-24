import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { stripe } from '@/lib/stripe';
import { getAdmin } from '@/app/api/_lib/supa';

export const runtime = 'nodejs';

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "").split(/[\s,]+/).filter(Boolean).map(s=>s.toLowerCase());
  const uid = String(user?.id || "");
  const email = String(user?.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const diagnostics: any = {
      timestamp: new Date().toISOString(),
      webhook_config: {},
      recent_subscriptions: [],
      recent_pro_updates: [],
      stripe_connection: {},
    };

    // 1. Check webhook configuration
    diagnostics.webhook_config = {
      secret_configured: !!process.env.STRIPE_WEBHOOK_SECRET,
      secret_length: process.env.STRIPE_WEBHOOK_SECRET?.length || 0,
      endpoint_url: process.env.NODE_ENV === 'production' 
        ? 'https://www.manatap.ai/api/stripe/webhook'
        : 'http://localhost:3000/api/stripe/webhook',
    };

    // 2. Check Stripe API connection
    try {
      const account = await stripe.accounts.retrieve();
      // Type assertion to access account properties
      const acc = account as any;
      diagnostics.stripe_connection = {
        connected: true,
        account_id: account.id,
        livemode: acc.livemode,
      };
    } catch (error: any) {
      diagnostics.stripe_connection = {
        connected: false,
        error: error.message,
      };
    }

    // 3. Get recent subscriptions from database (last 24 hours)
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const { data: recentSubs, error: subsError } = await supabase
      .from('profiles')
      .select('id, email, is_pro, pro_plan, stripe_subscription_id, stripe_customer_id, pro_since, updated_at')
      .not('stripe_subscription_id', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(20);

    if (!subsError && recentSubs) {
      diagnostics.recent_subscriptions = recentSubs.map(sub => ({
        user_id: sub.id,
        email: sub.email,
        is_pro: sub.is_pro,
        pro_plan: sub.pro_plan,
        stripe_subscription_id: sub.stripe_subscription_id,
        stripe_customer_id: sub.stripe_customer_id,
        pro_since: sub.pro_since,
        last_updated: sub.updated_at,
      }));
    }

    // 4. Get recent Pro status changes (from admin_audit if available)
    const { data: recentAudits, error: auditError } = await supabase
      .from('admin_audit')
      .select('*')
      .eq('action', 'user_pro_status_changed')
      .order('created_at', { ascending: false })
      .limit(10);

    if (!auditError && recentAudits) {
      diagnostics.recent_pro_updates = recentAudits;
    }

    // 5. Check for subscriptions that might be out of sync
    const { data: allSubs, error: allSubsError } = await supabase
      .from('profiles')
      .select('id, email, is_pro, stripe_subscription_id, stripe_customer_id')
      .not('stripe_subscription_id', 'is', null);

    if (!allSubsError && allSubs) {
      const outOfSync = allSubs.filter(sub => !sub.is_pro);
      diagnostics.potential_issues = {
        subscriptions_without_pro: outOfSync.length,
        out_of_sync_users: outOfSync.map(u => ({
          user_id: u.id,
          email: u.email,
          stripe_subscription_id: u.stripe_subscription_id,
        })),
      };
    }

    // 6. Try to verify webhook endpoint from Stripe (if we have access)
    try {
      // Note: This requires Stripe API access to list webhook endpoints
      // May not work if webhook was created in dashboard
      const webhooks = await stripe.webhookEndpoints.list({ limit: 10 });
      diagnostics.stripe_webhooks = webhooks.data.map(wh => ({
        id: wh.id,
        url: wh.url,
        status: wh.status,
        enabled_events: wh.enabled_events,
      }));
    } catch (error: any) {
      diagnostics.stripe_webhooks = {
        error: 'Could not fetch webhook endpoints from Stripe API',
        note: 'Webhook may have been created in Stripe Dashboard',
      };
    }

    return NextResponse.json({
      ok: true,
      diagnostics,
    });

  } catch (error: any) {
    console.error('Webhook status check failed:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to check webhook status' },
      { status: 500 }
    );
  }
}
