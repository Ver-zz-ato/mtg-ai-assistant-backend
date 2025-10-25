import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';

type Params = { id: string };

export async function GET(req: Request, ctx: { params: Promise<Params> }) {
  try {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const currency = (url.searchParams.get('currency') || 'USD').toUpperCase();
    const date = url.searchParams.get('date');
    const supabase = await getServerSupabase();
    const { data, error } = await (supabase as any).rpc('collection_price_buckets', { p_collection_id: id, p_currency: currency, p_snapshot_date: date });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, currency, buckets: data || [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}