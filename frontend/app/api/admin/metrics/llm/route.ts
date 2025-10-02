import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const url = new URL(req.url);
    const days = Math.max(1, Math.min(30, parseInt(url.searchParams.get('days')||'7',10)));
    const since = new Date(Date.now() - days*24*60*60*1000).toISOString();
    const { data, error } = await supabase
      .from('ai_usage')
      .select('model, cost_usd, created_at, input_tokens, output_tokens')
      .gte('created_at', since);
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 });
    const byModel: Record<string, any> = {};
    for (const r of (data||[])) {
      const m = (r as any).model || 'unknown';
      const cost = Number((r as any).cost_usd||0) || 0;
      const it = Number((r as any).input_tokens||0)||0;
      const ot = Number((r as any).output_tokens||0)||0;
      const t = byModel[m] || { cost:0, it:0, ot:0, count:0 };
      t.cost += cost; t.it += it; t.ot += ot; t.count += 1; byModel[m]=t;
    }
    return NextResponse.json({ ok:true, days, byModel });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'server_error' }, { status: 500 });
  }
}