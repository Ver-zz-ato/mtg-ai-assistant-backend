import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAdmin } from '@/app/api/_lib/supa';

export const runtime = 'nodejs';

type TimeRange = '24h' | '7d' | '30d' | '90d';

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || '').split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || '').split(/[\s,]+/).filter(Boolean).map(s => s.toLowerCase());
  const uid = String(user?.id || '');
  const email = String(user?.email || '').toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

function getTimeRangeMs(range: TimeRange): number {
  const ms = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
  };
  return ms[range] || ms['7d'];
}

export async function GET(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: 'Database not configured' }, { status: 500 });
    }

    const url = new URL(req.url);
    const range = (url.searchParams.get('range') || '7d') as TimeRange;
    const cutoff = new Date(Date.now() - getTimeRangeMs(range)).toISOString();

    // Get summary stats by feature
    const { data: byFeature, error: featureError } = await admin
      .from('pro_gate_events')
      .select('pro_feature, event_type')
      .gte('created_at', cutoff);

    if (featureError) throw featureError;

    // Get summary stats by source path
    const { data: byPath, error: pathError } = await admin
      .from('pro_gate_events')
      .select('source_path, event_type')
      .gte('created_at', cutoff);

    if (pathError) throw pathError;

    // Get recent events with details
    const { data: recentEvents, error: recentError } = await admin
      .from('pro_gate_events')
      .select('*')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(100);

    if (recentError) throw recentError;

    // Get conversion funnel
    const { data: funnelData, error: funnelError } = await admin
      .from('pro_gate_events')
      .select('event_type, visitor_id, user_id, pro_feature')
      .gte('created_at', cutoff);

    if (funnelError) throw funnelError;

    // Aggregate by feature
    const featureStats: Record<string, { views: number; clicks: number; started: number; completed: number }> = {};
    for (const row of byFeature || []) {
      const feature = row.pro_feature || 'unknown';
      if (!featureStats[feature]) {
        featureStats[feature] = { views: 0, clicks: 0, started: 0, completed: 0 };
      }
      if (row.event_type === 'pro_gate_viewed') featureStats[feature].views++;
      if (row.event_type === 'pro_gate_clicked') featureStats[feature].clicks++;
      if (row.event_type === 'pro_upgrade_started') featureStats[feature].started++;
      if (row.event_type === 'pro_upgrade_completed') featureStats[feature].completed++;
    }

    // Aggregate by path
    const pathStats: Record<string, { views: number; clicks: number }> = {};
    for (const row of byPath || []) {
      const path = row.source_path || 'unknown';
      if (!pathStats[path]) {
        pathStats[path] = { views: 0, clicks: 0 };
      }
      if (row.event_type === 'pro_gate_viewed') pathStats[path].views++;
      if (row.event_type === 'pro_gate_clicked') pathStats[path].clicks++;
    }

    // Calculate overall funnel
    const uniqueViewers = new Set<string>();
    const uniqueClickers = new Set<string>();
    const uniqueStarters = new Set<string>();
    const uniqueConverters = new Set<string>();

    for (const row of funnelData || []) {
      const id = row.user_id || row.visitor_id || 'anon';
      if (row.event_type === 'pro_gate_viewed') uniqueViewers.add(id);
      if (row.event_type === 'pro_gate_clicked') uniqueClickers.add(id);
      if (row.event_type === 'pro_upgrade_started') uniqueStarters.add(id);
      if (row.event_type === 'pro_upgrade_completed') uniqueConverters.add(id);
    }

    // Sort and limit
    const sortedFeatures = Object.entries(featureStats)
      .sort((a, b) => b[1].views - a[1].views)
      .slice(0, 20)
      .map(([feature, stats]) => ({ feature, ...stats }));

    const sortedPaths = Object.entries(pathStats)
      .sort((a, b) => b[1].views - a[1].views)
      .slice(0, 20)
      .map(([path, stats]) => ({ path, ...stats }));

    return NextResponse.json({
      ok: true,
      range,
      funnel: {
        viewers: uniqueViewers.size,
        clickers: uniqueClickers.size,
        starters: uniqueStarters.size,
        converters: uniqueConverters.size,
        clickRate: uniqueViewers.size > 0 ? (uniqueClickers.size / uniqueViewers.size * 100).toFixed(1) : '0',
        conversionRate: uniqueViewers.size > 0 ? (uniqueConverters.size / uniqueViewers.size * 100).toFixed(1) : '0',
      },
      byFeature: sortedFeatures,
      byPath: sortedPaths,
      recentEvents: (recentEvents || []).map(e => ({
        id: e.id,
        event_type: e.event_type,
        pro_feature: e.pro_feature,
        gate_location: e.gate_location,
        source_path: e.source_path,
        is_logged_in: e.is_logged_in,
        is_pro: e.is_pro,
        visitor_id: e.visitor_id ? e.visitor_id.slice(0, 8) + '...' : null,
        user_id: e.user_id ? e.user_id.slice(0, 8) + '...' : null,
        created_at: e.created_at,
      })),
    });
  } catch (error: any) {
    console.error('Pro gate analytics error:', error);
    return NextResponse.json({ ok: false, error: error?.message }, { status: 500 });
  }
}
