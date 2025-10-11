import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { autoDisableOnBudgetExceeded } from '@/lib/server/budgetEnforcement';

export const runtime = 'nodejs';

/**
 * Background monitoring endpoint for automated checks and alerts
 * Can be called by cron jobs or monitoring services
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const alerts: string[] = [];
    let autoDisabled = false;
    
    // 1. Check for budget auto-disable
    try {
      const budgetResult = await autoDisableOnBudgetExceeded(supabase);
      if (budgetResult.disabled) {
        autoDisabled = true;
        alerts.push(`⚠️ AUTO-DISABLED: ${budgetResult.reason}`);
      }
    } catch (error) {
      console.error('Budget auto-disable check failed:', error);
    }
    
    // 2. Check for stale snapshots
    try {
      const { data: latestSnapshot } = await supabase
        .from('price_snapshots')
        .select('snapshot_date')
        .order('snapshot_date', { ascending: false })
        .limit(1);
      
      if (latestSnapshot && latestSnapshot.length > 0) {
        const snapDate = new Date(latestSnapshot[0].snapshot_date + 'T00:00:00Z');
        const ageHours = Math.floor((Date.now() - snapDate.getTime()) / (1000 * 60 * 60));
        
        if (ageHours > 36) {
          alerts.push(`🕐 STALE SNAPSHOTS: Price data is ${ageHours} hours old (threshold: 36h)`);
        }
      } else {
        alerts.push('❌ MISSING SNAPSHOTS: No price snapshots found');
      }
    } catch (error) {
      console.error('Snapshot staleness check failed:', error);
    }
    
    // 3. Check for excessive error rates
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const { count: errorCount } = await supabase
        .from('error_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', oneDayAgo.toISOString());
      
      if ((errorCount || 0) > 50) {
        alerts.push(`❌ HIGH ERROR RATE: ${errorCount} errors in last 24h (threshold: 50)`);
      }
    } catch (error) {
      console.error('Error rate check failed:', error);
    }
    
    // 4. Log alerts to admin_audit if any
    if (alerts.length > 0) {
      try {
        await supabase
          .from('admin_audit')
          .insert({
            actor_id: null, // system monitoring
            action: 'system_alert',
            target: 'monitoring',
            payload: { alerts, timestamp: new Date().toISOString() }
          });
      } catch (error) {
        console.error('Failed to log monitoring alerts:', error);
      }
    }
    
    return NextResponse.json({ 
      ok: true, 
      alerts,
      auto_disabled: autoDisabled,
      checked_at: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('Monitoring check failed:', error);
    return NextResponse.json({ 
      ok: false, 
      error: error?.message || 'monitoring_failed',
      checked_at: new Date().toISOString()
    }, { status: 500 });
  }
}