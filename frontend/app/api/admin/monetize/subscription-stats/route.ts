import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

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
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });
    }

    // Get current Pro subscription stats
    // Include stripe_subscription_id to properly identify Stripe subscribers
    const { data: allProUsers, error: proError } = await admin
      .from('profiles')
      .select('id, is_pro, pro_plan, pro_since, created_at, stripe_subscription_id, stripe_customer_id')
      .eq('is_pro', true);

    if (proError) {
      return NextResponse.json({ ok: false, error: proError.message }, { status: 500 });
    }

    // Calculate breakdown
    // Primary method: Use pro_plan (set by webhook/confirm-payment)
    // Fallback: For users with stripe_subscription_id but missing pro_plan, check Stripe
    const totalPro = allProUsers?.length || 0;
    
    // Count users with Stripe subscriptions (for diagnostics)
    const usersWithStripe = allProUsers?.filter(p => !!p.stripe_subscription_id) || [];
    const stripeSubscribers = usersWithStripe.length;
    
    // For users with stripe_subscription_id but missing pro_plan, check Stripe
    const usersNeedingStripeCheck = usersWithStripe.filter(p => !p.pro_plan || (p.pro_plan !== 'monthly' && p.pro_plan !== 'yearly' && p.pro_plan !== 'manual'));
    const monthlyStripeIds = new Set<string>();
    const yearlyStripeIds = new Set<string>();
    
    // Only check Stripe for users missing pro_plan (should be rare)
    if (usersNeedingStripeCheck.length > 0) {
      await Promise.all(usersNeedingStripeCheck.map(async (p) => {
        try {
          if (!p.stripe_subscription_id) return;
          const subscription = await stripe.subscriptions.retrieve(p.stripe_subscription_id);
          const items = subscription.items.data;
          if (items.length > 0) {
            const interval = items[0].price.recurring?.interval;
            if (interval === 'month') {
              monthlyStripeIds.add(p.id);
            } else if (interval === 'year') {
              yearlyStripeIds.add(p.id);
            }
          }
        } catch (err) {
          console.error(`Failed to fetch Stripe subscription ${p.stripe_subscription_id}:`, err);
        }
      }));
    }
    
    // Monthly: pro_plan is monthly OR has monthly Stripe subscription (fallback)
    const monthly = allProUsers?.filter(p => {
      if (p.pro_plan === 'monthly') return true;
      if (monthlyStripeIds.has(p.id)) return true;
      return false;
    }).length || 0;
    
    // Yearly: pro_plan is yearly OR has yearly Stripe subscription (fallback)
    const yearly = allProUsers?.filter(p => {
      if (p.pro_plan === 'yearly') return true;
      if (yearlyStripeIds.has(p.id)) return true;
      return false;
    }).length || 0;
    
    // Manual: no stripe_subscription_id OR pro_plan is manual
    const manual = allProUsers?.filter(p => {
      // Manual if explicitly set to manual
      if (p.pro_plan === 'manual') return true;
      // Manual if is_pro is true but no Stripe subscription
      if (p.is_pro && !p.stripe_subscription_id) return true;
      return false;
    }).length || 0;

    // Calculate recent signups (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentPro = allProUsers?.filter(p => {
      if (!p.pro_since) return false;
      return new Date(p.pro_since) >= thirtyDaysAgo;
    }).length || 0;

    // Historical data for chart (last 90 days, grouped by day)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
    const historicalData: Record<string, number> = {};
    allProUsers?.forEach(user => {
      if (user.pro_since) {
        const proDate = new Date(user.pro_since);
        if (proDate >= ninetyDaysAgo) {
          const dateKey = proDate.toISOString().split('T')[0]; // YYYY-MM-DD
          historicalData[dateKey] = (historicalData[dateKey] || 0) + 1;
        }
      }
    });

    // Convert to array format for chart
    const chartData = Object.entries(historicalData)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({
        date,
        count: parseInt(String(count), 10)
      }));

    // Calculate cumulative for each day
    let cumulative = 0;
    const cumulativeData = chartData.map(({ date, count }) => {
      cumulative += count;
      return { date, count: cumulative };
    });

    // Plan breakdown
    const planBreakdown = [
      {
        plan: 'Monthly',
        count: monthly,
        percentage: totalPro > 0 ? Math.round((monthly / totalPro) * 100) : 0
      },
      {
        plan: 'Yearly',
        count: yearly,
        percentage: totalPro > 0 ? Math.round((yearly / totalPro) * 100) : 0
      },
      {
        plan: 'Manual (Admin)',
        count: manual,
        percentage: totalPro > 0 ? Math.round((manual / totalPro) * 100) : 0
      }
    ];

    // Fetch active subscription count directly from Stripe (source of truth)
    let stripeApiActiveCount = 0;
    try {
      for await (const _ of stripe.subscriptions.list({ status: 'active', limit: 100 })) {
        stripeApiActiveCount++;
        if (stripeApiActiveCount >= 500) break;
      }
    } catch (stripeErr: any) {
      console.warn('Could not fetch Stripe subscription count:', stripeErr?.message);
    }

    // Enhanced stats with Stripe subscriber count
    return NextResponse.json({
      ok: true,
      stats: {
        total_pro: totalPro,
        monthly_subscriptions: monthly,
        yearly_subscriptions: yearly,
        manual_pro: manual,
        stripe_subscribers: stripeSubscribers, // Users in our DB with stripe_subscription_id
        stripe_api_active: stripeApiActiveCount, // Active subs from Stripe API (source of truth)
        recent_signups_30d: recentPro
      },
      chart_data: cumulativeData,
      plan_breakdown: planBreakdown,
      last_updated: new Date().toISOString()
    });
  } catch (e: any) {
    console.error('Subscription stats error:', e);
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

