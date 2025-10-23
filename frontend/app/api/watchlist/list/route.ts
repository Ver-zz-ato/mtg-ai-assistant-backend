import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const { data: ures } = await (supabase as any).auth.getUser();
    const user = ures?.user;
    
    if (!user) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    // Get user's watchlist (create if doesn't exist)
    let { data: watchlist, error: wlErr } = await (supabase as any)
      .from('watchlists')
      .select('id, name, created_at, updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!watchlist) {
      // Create default watchlist
      const { data: newWl, error: createErr } = await (supabase as any)
        .from('watchlists')
        .insert({ user_id: user.id, name: 'My Watchlist', is_public: false })
        .select('id, name, created_at, updated_at')
        .maybeSingle();
      
      if (createErr) {
        console.error('Error creating watchlist:', createErr);
        return NextResponse.json({ ok: false, error: createErr.message }, { status: 500 });
      }
      
      watchlist = newWl;
    }

    if (!watchlist) {
      return NextResponse.json({ ok: false, error: 'watchlist_not_found' }, { status: 404 });
    }

    // Get watchlist items
    const { data: items, error: itemsErr } = await (supabase as any)
      .from('watchlist_items')
      .select('id, name, target_price, created_at, updated_at')
      .eq('watchlist_id', watchlist.id)
      .order('created_at', { ascending: false });

    if (itemsErr) {
      console.error('Error fetching watchlist items:', itemsErr);
      return NextResponse.json({ ok: false, error: itemsErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      watchlist: {
        ...watchlist,
        items: items || []
      }
    });
  } catch (e: any) {
    console.error('Watchlist list error:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}

