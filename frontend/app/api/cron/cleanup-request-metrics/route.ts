import { NextRequest, NextResponse } from 'next/server';
import { getAdmin } from '@/app/api/_lib/supa';

export const maxDuration = 60; // 1 minute

/**
 * Cleanup old request_metrics records (older than 14 days).
 * Add to vercel.json crons to run weekly.
 */
export async function GET(req: NextRequest) {
  const cronKeyHeader = req.headers.get('x-cron-key') || '';
  const vercelId = req.headers.get('x-vercel-id');
  const url = new URL(req.url);
  const cronKeyQuery = url.searchParams.get('key') || '';
  const cronKey = process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || '';

  // Auth: Vercel cron OR x-cron-key header OR query param
  const hasValidHeader = cronKey && cronKeyHeader === cronKey;
  const hasValidQuery = cronKey && cronKeyQuery === cronKey;
  const isVercelCron = !!vercelId;

  if (!isVercelCron && !hasValidHeader && !hasValidQuery) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: 'admin_client_unavailable' },
      { status: 500 }
    );
  }

  try {
    const retentionDays = parseInt(process.env.BILLING_METRICS_RETENTION_DAYS || '14', 10);
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

    // Count rows to delete first
    const { count: toDeleteCount } = await admin
      .from('request_metrics')
      .select('*', { count: 'exact', head: true })
      .lt('ts', cutoff);

    // Delete old records
    const { error } = await admin
      .from('request_metrics')
      .delete()
      .lt('ts', cutoff);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Audit log
    try {
      await admin.from('admin_audit').insert({
        actor_id: 'cron',
        action: 'cleanup_request_metrics',
        target: `deleted_older_than_${retentionDays}_days`,
        payload: { deleted_count: toDeleteCount, cutoff },
      });
    } catch {}

    return NextResponse.json({
      ok: true,
      deleted_count: toDeleteCount,
      retention_days: retentionDays,
      cutoff,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}
