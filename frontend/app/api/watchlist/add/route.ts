import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { checkProStatus } from '@/lib/server-pro-check';
import { findCardNameMatches } from '@/lib/server/cardNameResolution';

export const runtime = 'nodejs';

type WatchlistRow = { id: string };
type AddWatchlistRequest = {
  name?: string;
  target_price?: number | string | null;
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const isPro = await checkProStatus(user.id);

    if (!isPro) {
      try {
        const { logOpsEvent } = await import('@/lib/ops-events');
        await logOpsEvent(supabase, {
          event_type: 'ops_pro_access_denied',
          route: '/api/watchlist/add',
          status: 'ok',
          reason: 'pro_required',
          user_id: user.id,
          source: 'watchlist_add',
        });
      } catch {}
      return NextResponse.json({ ok: false, error: 'pro_required' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as AddWatchlistRequest;
    const cardName = String(body?.name || '').trim();
    const targetPrice = body?.target_price ? Number(body.target_price) : null;

    if (!cardName) {
      return NextResponse.json({ ok: false, error: 'name required' }, { status: 400 });
    }

    // Get or create watchlist
    let { data: watchlist } = await supabase
      .from('watchlists')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle<WatchlistRow>();

    if (!watchlist) {
      const { data: newWl, error: createErr } = await supabase
        .from('watchlists')
        .insert({ user_id: user.id, name: 'My Watchlist', is_public: false })
        .select('id')
        .maybeSingle<WatchlistRow>();
      
      if (createErr || !newWl) {
        return NextResponse.json({ ok: false, error: 'failed to create watchlist' }, { status: 500 });
      }
      
      watchlist = newWl;
    }

    // Normalize card name using cache-first resolver
    let normalizedName = cardName;
    try {
      const matches = await findCardNameMatches(supabase as any, cardName, 1);
      if (matches[0]?.name) normalizedName = matches[0].name;
    } catch (e) {
      console.warn('Card name resolution failed, using original name:', e);
    }

    // Check if already exists
    const { data: existing } = await supabase
      .from('watchlist_items')
      .select('id')
      .eq('watchlist_id', watchlist.id)
      .eq('name', normalizedName)
      .maybeSingle<WatchlistRow>();

    if (existing) {
      // Update target price if provided
      if (targetPrice !== null) {
        const { error: updateErr } = await supabase
          .from('watchlist_items')
          .update({ target_price: targetPrice, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        
        if (updateErr) {
          return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
        }
      }
      
      return NextResponse.json({ ok: true, already_exists: true, name: normalizedName });
    }

    // Insert new item
    const { error: insertErr } = await supabase
      .from('watchlist_items')
      .insert({
        watchlist_id: watchlist.id,
        name: normalizedName,
        target_price: targetPrice
      });

    if (insertErr) {
      return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
    }

    // ANALYTICS: Track watchlist addition
    try {
      const { captureServer } = await import('@/lib/server/analytics');
      await captureServer('watchlist_item_added', {
        user_id: user.id,
        card_name: normalizedName,
        has_target_price: targetPrice !== null
      });
    } catch (e) {
      console.error('Analytics error:', e);
    }

    return NextResponse.json({ ok: true, name: normalizedName });
  } catch (e: unknown) {
    console.error('Watchlist add error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'server_error' },
      { status: 500 }
    );
  }
}

