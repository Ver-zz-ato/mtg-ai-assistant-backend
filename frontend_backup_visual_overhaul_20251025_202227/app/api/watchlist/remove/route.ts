import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const { data: ures } = await (supabase as any).auth.getUser();
    const user = ures?.user;
    
    if (!user) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const itemId = String(body?.id || '').trim();

    if (!itemId) {
      return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
    }

    // Delete item (RLS ensures user owns it)
    const { error: deleteErr } = await (supabase as any)
      .from('watchlist_items')
      .delete()
      .eq('id', itemId);

    if (deleteErr) {
      return NextResponse.json({ ok: false, error: deleteErr.message }, { status: 500 });
    }

    // ANALYTICS: Track watchlist removal
    try {
      const { captureServer } = await import('@/lib/server/analytics');
      await captureServer('watchlist_item_removed', {
        user_id: user.id,
        item_id: itemId
      });
    } catch (e) {
      console.error('Analytics error:', e);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('Watchlist remove error:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}

