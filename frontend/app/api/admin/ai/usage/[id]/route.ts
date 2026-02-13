import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { getAdmin } from '@/app/api/_lib/supa';
import { isAdmin } from '@/lib/admin-check';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

    const admin = getAdmin();
    if (!admin) return NextResponse.json({ ok: false, error: 'missing_service_role_key' }, { status: 500 });

    const { id } = await params;
    if (!id) return NextResponse.json({ ok: false, error: 'missing id' }, { status: 400 });

    const { data: row, error } = await admin
      .from('ai_usage')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !row) return NextResponse.json({ ok: false, error: error?.message || 'not_found' }, { status: 404 });

    const r = row as Record<string, unknown>;
    const requestKind = (r.request_kind ?? r.layer0_mode) as string;
    const cost = Number(r.cost_usd) || 0;
    const plannerCost = Number(r.planner_cost_usd) || 0;
    const totalCost = cost + plannerCost;
    const parts: string[] = [];
    if (r.route) parts.push(`Route: ${r.route}`);
    if (requestKind) parts.push(`Request kind: ${requestKind}`);
    if (r.context_source) parts.push(`Context: ${r.context_source}`);
    if (r.used_v2_summary === true) parts.push('Used v2 summary');
    if (r.used_two_stage === true && r.planner_model) parts.push(`Two-stage: planner ${r.planner_model} (${plannerCost.toFixed(4)} USD) + writer (${cost.toFixed(4)} USD)`);
    if (r.cache_hit === true) parts.push('Cache hit');
    if (r.stop_sequences_enabled === true) parts.push('Stop sequences enabled');
    if (r.latency_ms != null) parts.push(`Latency: ${r.latency_ms} ms`);
    if (r.error_code) parts.push(`Error: ${r.error_code}`);
    const cost_reasons = parts.join('; ') || 'No extra context.';

    return NextResponse.json({
      ok: true,
      row: r,
      cost_reasons: cost_reasons,
      total_cost_usd: Math.round((totalCost) * 10000) / 10000,
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error).message || 'server_error' }, { status: 500 });
  }
}
