import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { stripe } from '@/lib/stripe';

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

    const { searchParams } = new URL(req.url);
    const includeInactive = searchParams.get('include_inactive') === 'true';

    // Get all profiles with Stripe subscriptions
    let query = supabase
      .from('profiles')
      .select('id, email, username, is_pro, pro_plan, stripe_subscription_id, stripe_customer_id, pro_since, pro_until, created_at, updated_at')
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
        let stripeData: any = {
          status: 'unknown',
          current_period_end: null,
          current_period_start: null,
          cancel_at_period_end: false,
          canceled_at: null,
        };

        try {
          if (profile.stripe_subscription_id) {
            const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
            // Type assertion to access subscription properties
            const sub = subscription as any;
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
              items: subscription.items.data.map((item: any) => ({
                price_id: item.price.id,
                product_id: item.price.product,
                amount: item.price.unit_amount,
                currency: item.price.currency,
                interval: item.price.recurring?.interval,
              })),
            };
          }
        } catch (stripeError: any) {
          console.error(`Failed to fetch Stripe data for ${profile.stripe_subscription_id}:`, stripeError.message);
          stripeData.error = stripeError.message;
        }

        return {
          user_id: profile.id,
          email: profile.email,
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

  } catch (error: any) {
    console.error('Failed to fetch subscribers:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to fetch subscribers' },
      { status: 500 }
    );
  }
}
