import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';

type Params = { id: string };

export async function GET(_req: Request, ctx: { params: Promise<Params> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await getServerSupabase();
    const { data, error } = await (supabase as any).rpc('collection_basic_stats', { p_collection_id: id });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    // data is an array with one row: { type_hist, rarity_hist, sets_top }
    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ ok: true, ...row });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}
