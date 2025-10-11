import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // 1. Last 24h errors
    const { data: errorData, count: errorCount } = await supabase
      .from('error_logs')
      .select('kind, message, created_at', { count: 'exact' })
      .gte('created_at', oneDayAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(5);
    
    // 2. Rate limit violations (estimate from chat frequency)
    let rateLimitHits = 0;
    try {
      const { data: highFreqUsers } = await supabase
        .from('chat_messages')
        .select('thread_id')
        .eq('role', 'user')
        .gte('created_at', oneDayAgo.toISOString())
        .limit(1000);
      
      if (highFreqUsers) {
        const threadCounts = new Map();
        highFreqUsers.forEach((msg: any) => {
          const count = threadCounts.get(msg.thread_id) || 0;
          threadCounts.set(msg.thread_id, count + 1);
        });
        rateLimitHits = Array.from(threadCounts.values()).filter(count => count > 20).length;
      }
    } catch {}
    
    // 3. AI spending (today and this week)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    let todayCost = 0;
    let weekCost = 0;
    try {
      const { data: todayData } = await supabase
        .from('ai_usage')
        .select('cost_usd')
        .gte('created_at', todayStart.toISOString());
      
      const { data: weekData } = await supabase
        .from('ai_usage')
        .select('cost_usd')
        .gte('created_at', weekStart.toISOString());
      
      todayCost = (todayData || []).reduce((sum: number, row: any) => sum + (Number(row.cost_usd) || 0), 0);
      weekCost = (weekData || []).reduce((sum: number, row: any) => sum + (Number(row.cost_usd) || 0), 0);
    } catch {}
    
    // 4. Get budget limits from config (following your existing pattern)
    let budget = { daily_usd: 0, weekly_usd: 0 };
    try {
      const { data: budgetConfig } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'llm_budget')
        .single();
      budget = budgetConfig?.value || budget;
    } catch {}
    
    // 5. Check price snapshot staleness
    let snapshotHealth = 'unknown';
    let snapshotAge = 0;
    let snapshotDate = null;
    
    try {
      const { data: latestSnapshot } = await supabase
        .from('price_snapshots')
        .select('snapshot_date')
        .order('snapshot_date', { ascending: false })
        .limit(1);
      
      if (latestSnapshot && latestSnapshot.length > 0) {
        snapshotDate = latestSnapshot[0].snapshot_date;
        const snapDate = new Date(snapshotDate + 'T00:00:00Z');
        snapshotAge = Math.floor((now.getTime() - snapDate.getTime()) / (1000 * 60 * 60)); // hours
        
        if (snapshotAge < 36) {
          snapshotHealth = 'healthy';
        } else if (snapshotAge < 72) {
          snapshotHealth = 'stale';
        } else {
          snapshotHealth = 'critical';
        }
      }
    } catch {}
    
    // 6. Performance issues (slow operations from error patterns)
    const slowJobs = errorData?.filter((e: any) => 
      e.message.toLowerCase().includes('timeout') || 
      e.message.toLowerCase().includes('slow') ||
      e.kind === 'timeout'
    ).length || 0;
    
    const pinboard = {
      timestamp: now.toISOString(),
      errors: {
        count_24h: errorCount || 0,
        recent: (errorData || []).map((e: any) => ({
          kind: e.kind,
          message: e.message.substring(0, 80),
          time: e.created_at
        }))
      },
      rate_limits: {
        violations_24h: rateLimitHits
      },
      ai_spending: {
        today_usd: Number(todayCost).toFixed(2),
        week_usd: Number(weekCost).toFixed(2),
        daily_limit_usd: budget.daily_usd || 0,
        weekly_limit_usd: budget.weekly_usd || 0,
        daily_usage_pct: budget.daily_usd > 0 ? Math.round((todayCost / budget.daily_usd) * 100) : 0,
        weekly_usage_pct: budget.weekly_usd > 0 ? Math.round((weekCost / budget.weekly_usd) * 100) : 0,
        over_daily_limit: budget.daily_usd > 0 && todayCost >= budget.daily_usd,
        over_weekly_limit: budget.weekly_usd > 0 && weekCost >= budget.weekly_usd
      },
      price_snapshots: {
        health: snapshotHealth,
        latest_date: snapshotDate,
        age_hours: snapshotAge,
        stale: snapshotAge > 36
      },
      performance: {
        slow_jobs_24h: slowJobs
      }
    };
    
    return NextResponse.json({ ok: true, pinboard });
    
  } catch (e: any) {
    console.error('Audit pinboard error:', e);
    return NextResponse.json({ 
      ok: false, 
      error: e?.message || 'server_error',
      pinboard: null
    }, { status: 500 });
  }
}