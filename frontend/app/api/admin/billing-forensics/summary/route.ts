import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { getAdmin } from '@/app/api/_lib/supa';

export const runtime = 'nodejs';

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || '').split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || '').split(/[\s,]+/).filter(Boolean).map(s => s.toLowerCase());
  const uid = String(user?.id || '');
  const email = String(user?.email || '').toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

type TimeRange = '1h' | '24h' | '7d';

function getTimeFilter(range: TimeRange): string {
  switch (range) {
    case '1h': return "ts > now() - interval '1 hour'";
    case '24h': return "ts > now() - interval '24 hours'";
    case '7d': return "ts > now() - interval '7 days'";
    default: return "ts > now() - interval '24 hours'";
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: 'admin_client_unavailable' }, { status: 500 });
    }

    const url = new URL(req.url);
    const range = (url.searchParams.get('range') || '24h') as TimeRange;
    const timeFilter = getTimeFilter(range);

    // Check if table exists and has data
    const { count: tableCount, error: countError } = await admin
      .from('request_metrics')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      // Table might not exist yet
      return NextResponse.json({
        ok: true,
        awaiting_data: true,
        message: 'Request metrics table not found or empty. Run the migration and enable BILLING_METRICS_PERSIST=1.',
        env_flags: getEnvFlags(),
      });
    }

    if (!tableCount || tableCount === 0) {
      return NextResponse.json({
        ok: true,
        awaiting_data: true,
        message: 'No request metrics recorded yet. Enable BILLING_METRICS_PERSIST=1 in Vercel env vars and redeploy.',
        env_flags: getEnvFlags(),
      });
    }

    // Fetch raw data for the time range (limit to avoid huge queries)
    const { data: metrics, error: metricsError } = await admin
      .from('request_metrics')
      .select('*')
      .gte('ts', getTimestamp(range))
      .order('ts', { ascending: false })
      .limit(10000);

    if (metricsError) {
      return NextResponse.json({ ok: false, error: metricsError.message }, { status: 500 });
    }

    const rows = metrics || [];

    // Aggregate in JS (simpler than complex SQL)
    const routeStats = new Map<string, {
      count: number;
      totalDuration: number;
      totalBytes: number;
      errors: number;
      bots: number;
      durations: number[];
    }>();

    let totalRequests = 0;
    let totalErrors = 0;
    let totalBots = 0;
    let totalDuration = 0;
    let totalBytes = 0;
    const userAgentCounts = new Map<string, number>();
    const callerTypeCounts = new Map<string, number>();

    for (const row of rows) {
      totalRequests++;
      if (row.status >= 400) totalErrors++;
      if (row.bot_flag) totalBots++;
      totalDuration += row.duration_ms || 0;
      totalBytes += row.bytes_out || 0;

      // Route aggregation
      const route = row.route || 'unknown';
      let stats = routeStats.get(route);
      if (!stats) {
        stats = { count: 0, totalDuration: 0, totalBytes: 0, errors: 0, bots: 0, durations: [] };
        routeStats.set(route, stats);
      }
      stats.count++;
      stats.totalDuration += row.duration_ms || 0;
      stats.totalBytes += row.bytes_out || 0;
      if (row.status >= 400) stats.errors++;
      if (row.bot_flag) stats.bots++;
      if (row.duration_ms) stats.durations.push(row.duration_ms);

      // User agent tracking (for bots)
      if (row.bot_flag && row.user_agent) {
        const ua = row.user_agent.slice(0, 80);
        userAgentCounts.set(ua, (userAgentCounts.get(ua) || 0) + 1);
      }

      // Caller type tracking
      if (row.caller_type) {
        callerTypeCounts.set(row.caller_type, (callerTypeCounts.get(row.caller_type) || 0) + 1);
      }
    }

    // Calculate p95
    function p95(arr: number[]): number {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const idx = Math.floor(sorted.length * 0.95);
      return sorted[Math.min(idx, sorted.length - 1)];
    }

    // Top routes by count
    const topByCount = Array.from(routeStats.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 15)
      .map(([route, stats]) => ({
        route,
        count: stats.count,
        avg_duration_ms: Math.round(stats.totalDuration / stats.count),
        p95_duration_ms: p95(stats.durations),
        error_pct: Math.round((stats.errors / stats.count) * 100),
        bot_pct: Math.round((stats.bots / stats.count) * 100),
      }));

    // Top routes by total time
    const topByTime = Array.from(routeStats.entries())
      .sort((a, b) => b[1].totalDuration - a[1].totalDuration)
      .slice(0, 15)
      .map(([route, stats]) => ({
        route,
        total_duration_ms: stats.totalDuration,
        count: stats.count,
        avg_duration_ms: Math.round(stats.totalDuration / stats.count),
        p95_duration_ms: p95(stats.durations),
      }));

    // Top routes by bytes
    const topByBytes = Array.from(routeStats.entries())
      .sort((a, b) => b[1].totalBytes - a[1].totalBytes)
      .slice(0, 15)
      .map(([route, stats]) => ({
        route,
        total_bytes: stats.totalBytes,
        count: stats.count,
        avg_bytes: Math.round(stats.totalBytes / stats.count),
      }));

    // Bots summary
    const topBotUAs = Array.from(userAgentCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ua, count]) => ({ user_agent: ua, count }));

    // Polling endpoints (known patterns)
    const pollingRoutes = ['/api/stats/activity', '/api/rate-limit/status', '/api/config'];
    const pollingSummary = pollingRoutes.map(route => {
      const stats = routeStats.get(route);
      return {
        route,
        count: stats?.count || 0,
        bot_pct: stats ? Math.round((stats.bots / stats.count) * 100) : 0,
      };
    }).filter(r => r.count > 0);

    // Cron summary
    const cronRoutes = Array.from(routeStats.entries())
      .filter(([route]) => route.includes('/cron/'))
      .map(([route, stats]) => ({
        route,
        count: stats.count,
        total_duration_ms: stats.totalDuration,
      }));

    return NextResponse.json({
      ok: true,
      range,
      totals: {
        requests: totalRequests,
        errors: totalErrors,
        error_pct: totalRequests > 0 ? Math.round((totalErrors / totalRequests) * 100) : 0,
        bots: totalBots,
        bot_pct: totalRequests > 0 ? Math.round((totalBots / totalRequests) * 100) : 0,
        avg_duration_ms: totalRequests > 0 ? Math.round(totalDuration / totalRequests) : 0,
        total_bytes: totalBytes,
      },
      top_by_count: topByCount,
      top_by_time: topByTime,
      top_by_bytes: topByBytes,
      bots_summary: {
        bot_pct: totalRequests > 0 ? Math.round((totalBots / totalRequests) * 100) : 0,
        top_user_agents: topBotUAs,
      },
      polling_summary: pollingSummary,
      cron_summary: cronRoutes,
      caller_types: Object.fromEntries(callerTypeCounts),
      env_flags: getEnvFlags(),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}

function getTimestamp(range: TimeRange): string {
  const now = new Date();
  switch (range) {
    case '1h': return new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    case '24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    case '7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    default: return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  }
}

function getEnvFlags() {
  return {
    BILLING_METRICS_PERSIST: process.env.BILLING_METRICS_PERSIST === '1',
    BILLING_GUARD_BOT_BLOCK: process.env.BILLING_GUARD_BOT_BLOCK === '1',
    BILLING_GUARD_RATE_LIMIT: process.env.BILLING_GUARD_RATE_LIMIT === '1',
    BILLING_GUARD_POLL_THROTTLE: process.env.BILLING_GUARD_POLL_THROTTLE === '1',
  };
}
