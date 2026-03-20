import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { getAdmin } from '@/app/api/_lib/supa';
import { isAdmin } from '@/lib/admin-check';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin-only: list recent operational events from admin_audit.
 * GET /api/admin/ops-events?limit=100&eventType=ops_rate_limit_hit&userId=...
 * When userId is provided, includes events where actor_id=userId OR payload->>'user_id'=userId.
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

    let rows: Array<{ id: number; created_at: string; actor_id: string | null; action: string; target: string | null; payload: unknown }> = [];

    if (userId) {
      // Filter by actor_id OR payload.user_id — run two queries and merge
      const baseSelect = () =>
        admin
          .from('admin_audit')
          .select('id, created_at, actor_id, action, target, payload')
          .like('action', 'ops_%')
          .order('created_at', { ascending: false })
          .limit(limit * 2); // fetch extra to allow deduping

      let qActor = baseSelect().eq('actor_id', userId);
      // PostgREST: payload->>user_id extracts user_id from JSONB as text
      let qPayload = baseSelect().filter('payload->>user_id', 'eq', userId);
      if (eventType) {
        qActor = qActor.eq('action', eventType);
        qPayload = qPayload.eq('action', eventType);
      }

      const [rActor, rPayload] = await Promise.all([qActor, qPayload]);
      if (rActor.error) {
        return NextResponse.json({ ok: false, error: rActor.error.message }, { status: 500 });
      }

      const seen = new Set<number>();
      const merged: typeof rows = [];
      const payloadRows = rPayload.error ? [] : (rPayload.data ?? []);
      const all = [...(rActor.data ?? []), ...payloadRows];
      all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      for (const row of all) {
        if (seen.has(row.id)) continue;
        // Include rows where actor_id matches OR payload.user_id matches
        const payloadUserId = (row.payload as Record<string, unknown>)?.user_id;
        const matchesPayload = String(payloadUserId ?? '') === userId;
        const matchesActor = row.actor_id === userId;
        if (!matchesActor && !matchesPayload) continue;
        seen.add(row.id);
        merged.push(row);
        if (merged.length >= limit) break;
      }
      rows = merged;
    } else {
      let query = admin
        .from('admin_audit')
        .select('id, created_at, actor_id, action, target, payload')
        .like('action', 'ops_%')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (eventType) {
        query = query.eq('action', eventType);
      }

      const { data, error } = await query;
      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      rows = data ?? [];
    }

    return NextResponse.json({
      ok: true,
      events: rows,
      count: rows.length,
    });
  } catch (error: unknown) {
    console.error('[admin/ops-events]', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
