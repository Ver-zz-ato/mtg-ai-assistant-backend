import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { getAdmin } from '@/app/api/_lib/supa';
import { isAdmin } from '@/lib/admin-check';

export const runtime = 'nodejs';

const DIMENSIONS = ['model', 'route', 'user', 'deck', 'thread', 'error_code'] as const;
const LEGACY_PRICING_CUTOFF = '2026-02-14';
type Dimension = (typeof DIMENSIONS)[number];

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

    const admin = getAdmin();
    if (!admin) return NextResponse.json({ ok: false, error: 'missing_service_role_key' }, { status: 500 });

    const sp = req.nextUrl.searchParams;
    const fromParam = sp.get('from') || '';
    const toParam = sp.get('to') || '';
    const days = Math.min(90, Math.max(1, parseInt(sp.get('days') || '30', 10) || 30));
    const from = fromParam && toParam ? new Date(fromParam + 'T00:00:00Z').toISOString() : new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const to = fromParam && toParam ? new Date(toParam + 'T23:59:59.999Z').toISOString() : new Date().toISOString();
    const dimension = (sp.get('dimension') || 'model') as Dimension;
    if (!DIMENSIONS.includes(dimension)) return NextResponse.json({ ok: false, error: 'invalid dimension' }, { status: 400 });
    const excludeLegacyCost = sp.get('exclude_legacy_cost') === 'true';

    const col = dimension === 'user' ? 'user_id' : dimension === 'deck' ? 'deck_id' : dimension;
    const selectCols = col === 'user_id' ? 'user_id,cost_usd' : col === 'deck_id' ? 'deck_id,cost_usd' : `${col},cost_usd`;
    let q = admin
      .from('ai_usage')
      .select(selectCols + ',id')
      .gte('created_at', from)
      .lte('created_at', to);
    if (excludeLegacyCost) q = q.gte('pricing_version', LEGACY_PRICING_CUTOFF);
    const { data: rows, error } = await q;

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    const list = (rows || []) as unknown as Array<Record<string, unknown>>;

    const key = col;
    const agg = new Map<string, { cost_usd: number; requests: number }>();
    for (const r of list) {
      const id = r[key] != null ? String(r[key]) : 'null';
      if (!agg.has(id)) agg.set(id, { cost_usd: 0, requests: 0 });
      agg.get(id)!.cost_usd += Number(r.cost_usd) || 0;
      agg.get(id)!.requests += 1;
    }

    const items = Array.from(agg.entries())
      .map(([id, t]) => ({ id, label: id, cost_usd: Math.round(t.cost_usd * 10000) / 10000, requests: t.requests }))
      .sort((a, b) => b.cost_usd - a.cost_usd)
      .slice(0, 20);

    return NextResponse.json({ ok: true, dimension, items });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error).message || 'server_error' }, { status: 500 });
  }
}
