import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { getAdmin } from '@/app/api/_lib/supa';
import { isAdmin } from '@/lib/admin-check';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin-only: list recent operational events from admin_audit.
 * GET /api/admin/ops-events?limit=100&eventType=ops_rate_limit_hit&userId=...
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: 'Admin client required' }, { status: 500 });
    }

    const limit = Math.min(200, Math.max(10, parseInt(req.nextUrl.searchParams.get('limit') || '100', 10)));
    const eventType = req.nextUrl.searchParams.get('eventType')?.trim();
    const userId = req.nextUrl.searchParams.get('userId')?.trim();

    let query = admin
      .from('admin_audit')
      .select('id, created_at, actor_id, action, target, payload')
      .like('action', 'ops_%')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (eventType) {
      query = query.eq('action', eventType);
    }
    if (userId) {
      query = query.eq('actor_id', userId);
    }

    const { data: rows, error } = await query;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      events: rows ?? [],
      count: (rows ?? []).length,
    });
  } catch (error: unknown) {
    console.error('[admin/ops-events]', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
