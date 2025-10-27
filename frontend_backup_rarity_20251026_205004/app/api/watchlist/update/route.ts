import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { withLogging } from '@/lib/api/withLogging';

export const POST = withLogging(async (req: NextRequest) => {
  try {
    const sb = await getSupabaseServer();
    const { data: { user } } = await sb.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    // Check Pro status
    const { data: profile } = await sb
      .from('profiles')
      .select('is_pro')
      .eq('id', user.id)
      .single();

    if (!profile?.is_pro) {
      return NextResponse.json({ ok: false, error: 'pro_required' }, { status: 403 });
    }

    const { id, target_price } = await req.json();

    if (!id) {
      return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
    }

    // Update the target price
    const { error } = await sb
      .from('watchlist_items')
      .update({ target_price: target_price || null })
      .eq('id', id);

    if (error) {
      console.error('Failed to update watchlist item:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('Watchlist update error:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
});

