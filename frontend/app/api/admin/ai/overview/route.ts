import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { getAdmin } from '@/app/api/_lib/supa';
import { isAdmin } from '@/lib/admin-check';

export const runtime = 'nodejs';

const LEGACY_PRICING_CUTOFF = '2026-02-14';

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
    const days = Math.min(90, Math.max(1, parseInt(sp.get('days') || '14', 10) || 14));
    const excludeLegacyCost = sp.get('exclude_legacy_cost') === 'true';
    const from = fromParam && toParam
      ? new Date(fromParam + 'T00:00:00Z').toISOString()
      : new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const to = fromParam && toParam
      ? new Date(toParam + 'T23:59:59.999Z').toISOString()
      : new Date().toISOString();

    const selectCols = 'id,created_at,route,model,request_kind,layer0_mode,context_source,used_two_stage,cache_hit,input_tokens,output_tokens,cost_usd,latency_ms,planner_cost_usd,pricing_version';
    let q = admin
      .from('ai_usage')
      .select(selectCols)
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: false });
    if (excludeLegacyCost) {
      q = q.gte('pricing_version', LEGACY_PRICING_CUTOFF);
    }
    const { data: rows, error } = await q;

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    const list = (rows || []) as Array<Record<string, unknown>>;

    const rk = (r: Record<string, unknown>) => (r.request_kind ?? r.layer0_mode) as string || 'unknown';
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    const p95 = (arr: number[]) => {
      if (arr.length === 0) return null;
      const s = [...arr].sort((a, b) => a - b);
      const i = Math.floor(0.95 * s.length);
      return s[i] ?? null;
    };

    const totals = {
      total_cost_usd: 0,
      total_requests: 0,
      total_tokens_in: 0,
      total_tokens_out: 0,
      avg_cost: 0,
      p95_latency_ms: null as number | null,
    };
    const by_model = new Map<string, { cost_usd: number; requests: number; tokens_in: number; tokens_out: number; avg_cost: number; p95_latency_ms: number | null }>();
    const by_route = new Map<string, typeof totals>();
    const by_request_kind = new Map<string, { cost_usd: number; requests: number }>();
    const by_context_source = new Map<string, { cost_usd: number; requests: number }>();
    const by_used_two_stage = new Map<string, { cost_usd: number; requests: number }>();
    const by_cache_hit = new Map<string, { cost_usd: number; requests: number }>();
    const dailyBuckets = new Map<string, { cost_usd: number; requests: number }>();
    const hourlyBuckets = new Map<string, { cost_usd: number; requests: number }>();
    const latencies: number[] = [];

    for (const r of list) {
      const cost = Number(r.cost_usd) || 0;
      const plannerCost = Number(r.planner_cost_usd) || 0;
      const totalCost = cost + plannerCost;
      const it = Number(r.input_tokens) || 0;
      const ot = Number(r.output_tokens) || 0;
      const lat = typeof r.latency_ms === 'number' ? r.latency_ms : null;
      if (lat != null) latencies.push(lat);

      totals.total_cost_usd += totalCost;
      totals.total_requests += 1;
      totals.total_tokens_in += it;
      totals.total_tokens_out += ot;

      const model = String(r.model || 'unknown');
      if (!by_model.has(model)) by_model.set(model, { cost_usd: 0, requests: 0, tokens_in: 0, tokens_out: 0, avg_cost: 0, p95_latency_ms: null });
      const bm = by_model.get(model)!;
      bm.cost_usd += totalCost; bm.requests += 1; bm.tokens_in += it; bm.tokens_out += ot;

      const route = String(r.route || 'unknown');
      if (!by_route.has(route)) by_route.set(route, { total_cost_usd: 0, total_requests: 0, total_tokens_in: 0, total_tokens_out: 0, avg_cost: 0, p95_latency_ms: null });
      const br = by_route.get(route)!;
      br.total_cost_usd += totalCost; br.total_requests += 1; br.total_tokens_in += it; br.total_tokens_out += ot;

      const kind = rk(r);
      if (!by_request_kind.has(kind)) by_request_kind.set(kind, { cost_usd: 0, requests: 0 });
      const bk = by_request_kind.get(kind)!;
      bk.cost_usd += totalCost; bk.requests += 1;

      const ctx = String(r.context_source || 'unknown');
      if (!by_context_source.has(ctx)) by_context_source.set(ctx, { cost_usd: 0, requests: 0 });
      by_context_source.get(ctx)!.cost_usd += totalCost; by_context_source.get(ctx)!.requests += 1;

      const two = r.used_two_stage === true ? 'true' : 'false';
      if (!by_used_two_stage.has(two)) by_used_two_stage.set(two, { cost_usd: 0, requests: 0 });
      by_used_two_stage.get(two)!.cost_usd += totalCost; by_used_two_stage.get(two)!.requests += 1;

      const ch = r.cache_hit === true ? 'true' : 'false';
      if (!by_cache_hit.has(ch)) by_cache_hit.set(ch, { cost_usd: 0, requests: 0 });
      by_cache_hit.get(ch)!.cost_usd += totalCost; by_cache_hit.get(ch)!.requests += 1;

      const day = String(r.created_at).slice(0, 10);
      if (!dailyBuckets.has(day)) dailyBuckets.set(day, { cost_usd: 0, requests: 0 });
      dailyBuckets.get(day)!.cost_usd += totalCost; dailyBuckets.get(day)!.requests += 1;

      const hour = String(r.created_at).slice(0, 13);
      if (!hourlyBuckets.has(hour)) hourlyBuckets.set(hour, { cost_usd: 0, requests: 0 });
      hourlyBuckets.get(hour)!.cost_usd += totalCost; hourlyBuckets.get(hour)!.requests += 1;
    }

    totals.avg_cost = totals.total_requests ? totals.total_cost_usd / totals.total_requests : 0;
    totals.p95_latency_ms = p95(latencies);

    for (const bm of by_model.values()) {
      bm.avg_cost = bm.requests ? bm.cost_usd / bm.requests : 0;
    }
    for (const br of by_route.values()) {
      br.avg_cost = br.total_requests ? br.total_cost_usd / br.total_requests : 0;
    }

    const round = (n: number) => Math.round(n * 10000) / 10000;
    const series_daily = Array.from(dailyBuckets.entries())
      .map(([date, t]) => ({ date, cost_usd: round(t.cost_usd), requests: t.requests }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const series_hourly = Array.from(hourlyBuckets.entries())
      .map(([hour, t]) => ({ hour, cost_usd: round(t.cost_usd), requests: t.requests }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    return NextResponse.json({
      ok: true,
      totals: { ...totals, total_cost_usd: round(totals.total_cost_usd), avg_cost: round(totals.avg_cost) },
      by_model: Array.from(by_model.entries()).map(([id, t]) => ({ id, ...t, cost_usd: round(t.cost_usd), avg_cost: round(t.avg_cost) })).sort((a, b) => b.cost_usd - a.cost_usd),
      by_route: Array.from(by_route.entries()).map(([id, t]) => ({ id, ...t, total_cost_usd: round(t.total_cost_usd), avg_cost: round(t.avg_cost) })).sort((a, b) => b.total_cost_usd - a.total_cost_usd),
      by_request_kind: Array.from(by_request_kind.entries()).map(([id, t]) => ({ id, ...t, cost_usd: round(t.cost_usd) })).sort((a, b) => b.cost_usd - a.cost_usd),
      by_context_source: Array.from(by_context_source.entries()).map(([id, t]) => ({ id, ...t, cost_usd: round(t.cost_usd) })),
      by_used_two_stage: Array.from(by_used_two_stage.entries()).map(([id, t]) => ({ id, ...t, cost_usd: round(t.cost_usd) })),
      by_cache_hit: Array.from(by_cache_hit.entries()).map(([id, t]) => ({ id, ...t, cost_usd: round(t.cost_usd) })),
      series_daily,
      series_hourly,
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error).message || 'server_error' }, { status: 500 });
  }
}
