import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { getAdmin } from '@/app/api/_lib/supa';
import { isActiveProfilePro, type ProfileProRow } from '@/lib/server-pro-check';

export const runtime = 'nodejs';

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || '').split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || '').split(/[\s,]+/).filter(Boolean).map(s=>s.toLowerCase());
  const uid = String(user?.id || '');
  const email = String(user?.email || '').toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: 'missing_service_role_key' }, { status: 500 });
    }

    const url = new URL(req.url);
    const timeRange = url.searchParams.get('timeRange') || '30d';
    
    // Get real user statistics from Supabase Auth
    const allUsers: any[] = [];
    let page = 1;
    const perPage = 1000;
    
    // Fetch all users (paginated)
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) {
        console.error('Error fetching users:', error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      
      if (!data?.users || data.users.length === 0) break;
      allUsers.push(...data.users);
      
      if (data.users.length < perPage) break; // Last page
      page++;
    }

    const userIds = allUsers.map((u) => u.id).filter(Boolean);
    const profileMap = new Map<string, ProfileProRow>();
    const chunkSize = 500;

    for (let index = 0; index < userIds.length; index += chunkSize) {
      const chunk = userIds.slice(index, index + chunkSize);
      if (chunk.length === 0) continue;

      const { data: profiles, error: profilesError } = await admin
        .from('profiles')
        .select('id, is_pro, pro_until')
        .in('id', chunk);

      if (profilesError) {
        console.warn('[admin/pricing] profiles query failed:', profilesError.message);
        continue;
      }

      for (const profile of profiles || []) {
        const row = profile as { id: string; is_pro?: boolean | null; pro_until?: string | null };
        profileMap.set(row.id, {
          is_pro: row.is_pro ?? null,
          pro_until: row.pro_until ?? null,
        });
      }
    }

    // Calculate statistics from canonical profile entitlement state, not user_metadata.
    const totalUsers = allUsers.length;
    const proUsers = allUsers.filter((u) => isActiveProfilePro(profileMap.get(u.id) ?? null)).length;
    const freeUsers = totalUsers - proUsers;
    const conversionRate = totalUsers > 0 ? proUsers / totalUsers : 0;
    const monthlyRevenue = proUsers * 3.99; // Rough estimate using current monthly Pro price.

    // Generate mock metrics for demo (in production, you'd pull from actual analytics)
    const daysBack = parseInt(timeRange);
    const mockMetrics = Array.from({ length: daysBack }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (daysBack - 1 - i));
      
      return {
        date: date.toISOString().split('T')[0],
        page_views: Math.floor(Math.random() * 100) + 20,
        upgrade_clicks: Math.floor(Math.random() * 20) + 5,
        conversion_rate: Math.random() * 0.15 + 0.02,
        new_signups: Math.floor(Math.random() * 15) + 2,
        pro_conversions: Math.floor(Math.random() * 5) + 1,
      };
    });

    const userStats = {
      total_users: totalUsers,
      pro_users: proUsers,
      free_users: freeUsers,
      conversion_rate: conversionRate,
      monthly_revenue: monthlyRevenue,
    };

    return NextResponse.json({
      ok: true,
      userStats,
      metrics: mockMetrics,
      timeRange
    });

  } catch (error: any) {
    console.error('Admin pricing API error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
