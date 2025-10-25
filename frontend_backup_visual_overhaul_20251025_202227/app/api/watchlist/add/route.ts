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

    // Check if user is Pro
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('is_pro')
      .eq('id', user.id)
      .maybeSingle();
    
    const isPro = profile?.is_pro || user?.user_metadata?.pro;
    
    if (!isPro) {
      return NextResponse.json({ ok: false, error: 'pro_required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const cardName = String(body?.name || '').trim();
    const targetPrice = body?.target_price ? Number(body.target_price) : null;

    if (!cardName) {
      return NextResponse.json({ ok: false, error: 'name required' }, { status: 400 });
    }

    // Get or create watchlist
    let { data: watchlist } = await (supabase as any)
      .from('watchlists')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!watchlist) {
      const { data: newWl, error: createErr } = await (supabase as any)
        .from('watchlists')
        .insert({ user_id: user.id, name: 'My Watchlist', is_public: false })
        .select('id')
        .maybeSingle();
      
      if (createErr || !newWl) {
        return NextResponse.json({ ok: false, error: 'failed to create watchlist' }, { status: 500 });
      }
      
      watchlist = newWl;
    }

    // Normalize card name using Scryfall
    let normalizedName = cardName;
    try {
      const scryfallRes = await fetch(
        `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`
      );
      
      if (scryfallRes.ok) {
        const scryfallData: any = await scryfallRes.json();
        normalizedName = scryfallData?.name || cardName;
      }
    } catch (e) {
      console.warn('Scryfall lookup failed, using original name:', e);
    }

    // Check if already exists
    const { data: existing } = await (supabase as any)
      .from('watchlist_items')
      .select('id')
      .eq('watchlist_id', watchlist.id)
      .eq('name', normalizedName)
      .maybeSingle();

    if (existing) {
      // Update target price if provided
      if (targetPrice !== null) {
        const { error: updateErr } = await (supabase as any)
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
    const { error: insertErr } = await (supabase as any)
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
  } catch (e: any) {
    console.error('Watchlist add error:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}

