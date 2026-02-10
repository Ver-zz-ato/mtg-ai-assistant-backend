import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { isAdmin } from '@/lib/admin-check';

export const runtime = 'nodejs';

const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

    const sp = req.nextUrl.searchParams;
    const from = sp.get('from') ? new Date(sp.get('from')! + 'T00:00:00Z').toISOString() : undefined;
    const to = sp.get('to') ? new Date(sp.get('to')! + 'T23:59:59.999Z').toISOString() : undefined;
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(sp.get('limit') || String(PAGE_SIZE), 10) || PAGE_SIZE));
    const cursor = sp.get('next_cursor'); // format: created_at|id (use | to avoid splitting ISO date)
    const model = sp.get('model') || undefined;
    const route = sp.get('route') || undefined;
    const request_kind = sp.get('request_kind') || undefined;
    const context_source = sp.get('context_source') || undefined;
    const used_two_stage = sp.get('used_two_stage'); // 'true'|'false'
    const is_guest = sp.get('is_guest'); // 'true'|'false'
    const user_tier = sp.get('user_tier') || undefined;
    const min_cost = sp.get('min_cost') != null ? parseFloat(sp.get('min_cost')!) : undefined;
    const min_tokens_in = sp.get('min_tokens_in') != null ? parseInt(sp.get('min_tokens_in')!, 10) : undefined;
    const error_code = sp.get('error_code') || undefined;
    const deck_id = sp.get('deck_id') || undefined;
    const thread_id = sp.get('thread_id') || undefined;
    const user_id = sp.get('user_id') || undefined;

    let q = supabase
      .from('ai_usage')
      .select('id,created_at,route,model,request_kind,layer0_mode,input_tokens,output_tokens,cost_usd,latency_ms,context_source,used_v2_summary,used_two_stage,cache_hit,error_code,user_id,thread_id,deck_id', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);
    if (cursor) {
      const idx = cursor.lastIndexOf('|');
      const createdAt = idx >= 0 ? cursor.slice(0, idx) : '';
      const id = idx >= 0 ? cursor.slice(idx + 1) : '';
      if (createdAt && id) q = q.or(`created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`);
    }
    if (model) q = q.eq('model', model);
    if (route) q = q.eq('route', route);
    if (request_kind) q = q.or(`request_kind.eq.${request_kind},layer0_mode.eq.${request_kind}`);
    if (context_source) q = q.eq('context_source', context_source);
    if (used_two_stage === 'true') q = q.eq('used_two_stage', true);
    if (used_two_stage === 'false') q = q.eq('used_two_stage', false);
    if (is_guest === 'true') q = q.eq('is_guest', true);
    if (is_guest === 'false') q = q.eq('is_guest', false);
    if (user_tier) q = q.eq('user_tier', user_tier);
    if (min_cost != null && !Number.isNaN(min_cost)) q = q.gte('cost_usd', min_cost);
    if (min_tokens_in != null && !Number.isNaN(min_tokens_in)) q = q.gte('input_tokens', min_tokens_in);
    if (error_code) q = q.eq('error_code', error_code);
    if (deck_id) q = q.eq('deck_id', deck_id);
    if (thread_id) q = q.eq('thread_id', thread_id);
    if (user_id) q = q.eq('user_id', user_id);

    const { data: rows, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const list = (rows || []) as Array<Record<string, unknown>>;
    const has_more = list.length > limit;
    const items = has_more ? list.slice(0, limit) : list;
    const last = items[items.length - 1];
    const next_cursor = has_more && last ? `${last.created_at}|${last.id}` : undefined;

    return NextResponse.json({ ok: true, items, next_cursor, has_more });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error).message || 'server_error' }, { status: 500 });
  }
}
