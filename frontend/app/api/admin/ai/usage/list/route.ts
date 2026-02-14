import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { getAdmin } from '@/app/api/_lib/supa';
import { isAdmin } from '@/lib/admin-check';
import { costUSD } from '@/lib/ai/pricing';

export const runtime = 'nodejs';

const PAGE_SIZE = 50;
const LEGACY_PRICING_CUTOFF = '2026-02-14';
const MAX_PAGE_SIZE = 2000;

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

    const admin = getAdmin();
    if (!admin) return NextResponse.json({ ok: false, error: 'missing_service_role_key' }, { status: 500 });

    const sp = req.nextUrl.searchParams;
    const daysRaw = parseInt(sp.get('days') || '0', 10);
    const days = Math.min(90, Math.max(1, isFinite(daysRaw) ? daysRaw : 0));
    const cutoff = days > 0 ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() : null;
    const from = sp.get('from') ? new Date(sp.get('from')! + 'T00:00:00Z').toISOString() : cutoff;
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
    const exclude_legacy_cost = sp.get('exclude_legacy_cost') === 'true';

    let q = admin
      .from('ai_usage')
      .select('*', { count: 'exact' })
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
    if (exclude_legacy_cost) q = q.gte('pricing_version', LEGACY_PRICING_CUTOFF);

    const { data: rows, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const list = (rows || []) as Array<Record<string, unknown>>;
    const has_more = list.length > limit;
    const rawItems = has_more ? list.slice(0, limit) : list;
    const items = rawItems.map((r) => {
      const pv = r.pricing_version as string | null | undefined;
      const legacy = !pv || pv < LEGACY_PRICING_CUTOFF;
      const model = String(r.model ?? '');
      const inT = Number(r.input_tokens) || 0;
      const outT = Number(r.output_tokens) || 0;
      const corrected = legacy ? costUSD(model, inT, outT) : null;
      return { ...r, legacy_cost: legacy, corrected_cost_estimate: corrected };
    });
    const lastRaw = rawItems[rawItems.length - 1] as Record<string, unknown> | undefined;
    const next_cursor = has_more && lastRaw ? `${lastRaw.created_at}|${lastRaw.id}` : undefined;

    return NextResponse.json({ ok: true, items, next_cursor, has_more });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error).message || 'server_error' }, { status: 500 });
  }
}
