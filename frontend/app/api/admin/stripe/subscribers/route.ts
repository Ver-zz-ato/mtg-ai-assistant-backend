import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getServerSupabase } from '@/lib/server-supabase';
import { stripe } from '@/lib/stripe';
import { getAdmin } from '@/app/api/_lib/supa';

export const runtime = 'nodejs';

type AdminUserLike = {
  id?: string;
  email?: string;
} | null | undefined;

type StripeSubscriberStripeData = {
  status: string;
  current_period_end: string | null;
  current_period_start: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  items?: Array<{
    price_id: string;
    product_id: string | Stripe.DeletedProduct | Stripe.Product | null;
    amount: number | null;
    currency: string;
    interval: Stripe.Price.Recurring.Interval | null | undefined;
  }>;
  error?: string;
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isAdmin(user: AdminUserLike): boolean {
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

    const { searchParams } = new URL(req.url);
    const includeInactive = searchParams.get('include_inactive') === 'true';
    const admin = getAdmin();

    if (!admin) {
      return NextResponse.json({ ok: false, error: 'Missing service role' }, { status: 500 });
    }

    // Get all profiles with Stripe subscriptions
    const query = supabase
      .from('profiles')
      .select('id, username, is_pro, pro_plan, stripe_subscription_id, stripe_customer_id, pro_since, pro_until, created_at, updated_at')
      .not('stripe_subscription_id', 'is', null)
      .order('updated_at', { ascending: false });

    const { data: profiles, error: profilesError } = await query;

    if (profilesError) {
      console.error('Failed to fetch profiles:', profilesError);
      return NextResponse.json(
        { ok: false, error: profilesError.message },
        { status: 500 }
      );
    }

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({
        ok: true,
        subscribers: [],
        total: 0,
      });
    }

    // Enrich with Stripe subscription data
    const enrichedSubscribers = await Promise.all(
      profiles.map(async (profile) => {
        let email: string | null = null;
        let stripeData: StripeSubscriberStripeData = {
          status: 'unknown',
          current_period_end: null,
          current_period_start: null,
          cancel_at_period_end: false,
          canceled_at: null,
        };

        try {
          const { data: authUser } = await admin.auth.admin.getUserById(profile.id);
          email = authUser?.user?.email || null;
        } catch (authError: unknown) {
          console.error(`Failed to fetch auth user for ${profile.id}:`, errorMessage(authError, 'Auth lookup failed'));
        }

        try {
          if (profile.stripe_subscription_id) {
            const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
            const sub = subscription as Stripe.Subscription & {
              current_period_end?: number | null;
              current_period_start?: number | null;
              cancel_at_period_end?: boolean | null;
              canceled_at?: number | null;
            };
            stripeData = {
              status: subscription.status,
              current_period_end: sub.current_period_end 
                ? new Date(sub.current_period_end * 1000).toISOString()
                : null,
              current_period_start: sub.current_period_start
                ? new Date(sub.current_period_start * 1000).toISOString()
                : null,
              cancel_at_period_end: sub.cancel_at_period_end || false,
              canceled_at: sub.canceled_at
                ? new Date(sub.canceled_at * 1000).toISOString()
                : null,
              items: subscription.items.data.map((item) => ({
                price_id: item.price.id,
                product_id: item.price.product,
                amount: item.price.unit_amount,
                currency: item.price.currency,
                interval: item.price.recurring?.interval,
              })),
            };
          }
        } catch (stripeError: unknown) {
          const message = errorMessage(stripeError, 'Stripe fetch failed');
          console.error(`Failed to fetch Stripe data for ${profile.stripe_subscription_id}:`, message);
          stripeData.error = message;
        }

        return {
          user_id: profile.id,
          email,
          username: profile.username,
          is_pro: profile.is_pro,
          pro_plan: profile.pro_plan,
          stripe_subscription_id: profile.stripe_subscription_id,
          stripe_customer_id: profile.stripe_customer_id,
          pro_since: profile.pro_since,
          pro_until: profile.pro_until,
          created_at: profile.created_at,
          last_updated: profile.updated_at,
          stripe: stripeData,
        };
      })
    );

    // Filter out inactive if needed
    const activeSubscribers = includeInactive 
      ? enrichedSubscribers
      : enrichedSubscribers.filter(sub => 
          sub.stripe.status === 'active' || sub.stripe.status === 'trialing'
        );

    // Calculate summary stats
    const stats = {
      total: enrichedSubscribers.length,
      active: enrichedSubscribers.filter(s => s.stripe.status === 'active').length,
      trialing: enrichedSubscribers.filter(s => s.stripe.status === 'trialing').length,
      canceled: enrichedSubscribers.filter(s => s.stripe.status === 'canceled').length,
      past_due: enrichedSubscribers.filter(s => s.stripe.status === 'past_due').length,
      with_pro: enrichedSubscribers.filter(s => s.is_pro).length,
      without_pro: enrichedSubscribers.filter(s => !s.is_pro).length,
      monthly: enrichedSubscribers.filter(s => s.pro_plan === 'monthly').length,
      yearly: enrichedSubscribers.filter(s => s.pro_plan === 'yearly').length,
      manual: enrichedSubscribers.filter(s => s.pro_plan === 'manual').length,
    };

    return NextResponse.json({
      ok: true,
      subscribers: activeSubscribers,
      stats,
      total: activeSubscribers.length,
    });

  } catch (error: unknown) {
    console.error('Failed to fetch subscribers:', error);
    return NextResponse.json(
      { ok: false, error: errorMessage(error, 'Failed to fetch subscribers') },
      { status: 500 }
    );
  }
}
