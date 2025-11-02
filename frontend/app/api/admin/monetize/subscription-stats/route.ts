import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";

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
    const { data: allProUsers, error: proError } = await admin
      .from('profiles')
      .select('id, is_pro, pro_plan, pro_since, created_at')
      .eq('is_pro', true);

    if (proError) {
      return NextResponse.json({ ok: false, error: proError.message }, { status: 500 });
    }

    // Calculate breakdown
    const totalPro = allProUsers?.length || 0;
    const monthly = allProUsers?.filter(p => p.pro_plan === 'monthly').length || 0;
    const yearly = allProUsers?.filter(p => p.pro_plan === 'yearly').length || 0;
    const manual = allProUsers?.filter(p => p.pro_plan === 'manual').length || 0;

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

    return NextResponse.json({
      ok: true,
      stats: {
        total_pro: totalPro,
        monthly_subscriptions: monthly,
        yearly_subscriptions: yearly,
        manual_pro: manual,
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

