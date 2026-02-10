import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { isAdmin } from '@/lib/admin-check';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

    const sp = req.nextUrl.searchParams;
    const fromParam = sp.get('from') || '';
    const toParam = sp.get('to') || '';
    const days = Math.min(90, Math.max(1, parseInt(sp.get('days') || '30', 10) || 30));
    const from = fromParam && toParam ? new Date(fromParam + 'T00:00:00Z').toISOString() : new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const to = fromParam && toParam ? new Date(toParam + 'T23:59:59.999Z').toISOString() : new Date().toISOString();

    const { data: rows, error } = await supabase
      .from('ai_usage')
      .select('model,route,request_kind,layer0_mode,context_source,used_two_stage,cost_usd')
      .gte('created_at', from)
      .lte('created_at', to);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    const list = (rows || []) as Array<Record<string, unknown>>;

    const totalCost = list.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
    const totalRequests = list.length;
    const byModel = new Map<string, { cost: number; count: number }>();
    const byRequestKind = new Map<string, number>();
    const rawFallbackCount = list.filter((r) => r.context_source === 'raw_fallback').length;
    const twoStageCount = list.filter((r) => r.used_two_stage === true).length;

    for (const r of list) {
      const m = String(r.model || 'none');
      if (!byModel.has(m)) byModel.set(m, { cost: 0, count: 0 });
      byModel.get(m)!.cost += Number(r.cost_usd) || 0;
      byModel.get(m)!.count += 1;
      const kind = (r.request_kind ?? r.layer0_mode) as string || 'unknown';
      byRequestKind.set(kind, (byRequestKind.get(kind) || 0) + 1);
    }

    const recommendations: Array<{ text: string; suggested_key?: string; suggested_value?: unknown }> = [];

    if (totalRequests > 0 && rawFallbackCount / totalRequests > 0.5) {
      recommendations.push({
        text: `Raw fallback context used in ${Math.round((rawFallbackCount / totalRequests) * 100)}% of requests. Consider enabling v2 summary (llm_v2_context) or linking decks.`,
        suggested_key: 'flags',
        suggested_value: { llm_v2_context: true },
      });
    }
    const miniCount = byRequestKind.get('MINI_ONLY') || 0;
    const fullCount = byRequestKind.get('FULL_LLM') || 0;
    if (totalRequests > 0 && fullCount / totalRequests > 0.7) {
      recommendations.push({
        text: `FULL_LLM used in ${Math.round((fullCount / totalRequests) * 100)}% of requests. Consider enabling Layer 0 (llm_layer0) to route more to MINI_ONLY.`,
        suggested_key: 'flags',
        suggested_value: { llm_layer0: true },
      });
    }
    const topModel = Array.from(byModel.entries()).sort((a, b) => b[1].cost - a[1].cost)[0];
    if (topModel && topModel[0] !== 'none' && totalCost > 0 && topModel[1].cost / totalCost > 0.6) {
      recommendations.push({
        text: `Model "${topModel[0]}" accounts for ${Math.round((topModel[1].cost / totalCost) * 100)}% of cost. Consider forcing MINI for simple queries (llm_force_mini_only) or tightening Layer 0.`,
        suggested_key: 'flags',
        suggested_value: { llm_force_mini_only: false }, // informational; no auto-enable
      });
    }
    if (totalRequests > 10 && twoStageCount / totalRequests < 0.1) {
      recommendations.push({
        text: 'Two-stage planner used in few requests. Two-stage can reduce writer tokens for long answers; ensure llm_two_stage is on if desired.',
        suggested_key: 'flags',
        suggested_value: { llm_two_stage: true },
      });
    }

    return NextResponse.json({ ok: true, recommendations });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error).message || 'server_error' }, { status: 500 });
  }
}
