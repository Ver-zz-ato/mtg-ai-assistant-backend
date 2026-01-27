import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

type Params = { id: string };

export async function GET(req: NextRequest, ctx: { params: Promise<Params> }) {
  try {
    const { id: collectionId } = await ctx.params;
    const url = new URL(req.url);
    const wishlistId = url.searchParams.get('wishlist_id');
    
    if (!wishlistId) {
      return NextResponse.json({ ok: false, error: 'wishlist_id required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Verify collection ownership
    const { data: collection } = await supabase
      .from('collections')
      .select('id, user_id')
      .eq('id', collectionId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!collection) {
      return NextResponse.json({ ok: false, error: 'Collection not found' }, { status: 404 });
    }

    // Verify wishlist ownership
    const { data: wishlist } = await supabase
      .from('wishlists')
      .select('id, user_id')
      .eq('id', wishlistId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!wishlist) {
      return NextResponse.json({ ok: false, error: 'Wishlist not found' }, { status: 404 });
    }

    // Get collection cards
    const { data: collectionCards } = await supabase
      .from('collection_cards')
      .select('name, qty')
      .eq('collection_id', collectionId);

    // Get wishlist items
    const { data: wishlistItems } = await supabase
      .from('wishlist_items')
      .select('name, qty')
      .eq('wishlist_id', wishlistId);

    // Build maps for comparison
    const collectionMap = new Map<string, number>();
    (collectionCards || []).forEach((c: any) => {
      const name = String(c.name || '').toLowerCase().trim();
      collectionMap.set(name, (collectionMap.get(name) || 0) + Number(c.qty || 1));
    });

    const wishlistMap = new Map<string, number>();
    (wishlistItems || []).forEach((w: any) => {
      const name = String(w.name || '').toLowerCase().trim();
      wishlistMap.set(name, (wishlistMap.get(name) || 0) + Number(w.qty || 1));
    });

    // Find gaps (cards in wishlist but not in collection, or insufficient quantity)
    const gaps: Array<{ card_name: string; quantity_missing: number; avg_price?: number }> = [];
    
    for (const [wishName, wishQty] of wishlistMap.entries()) {
      const ownedQty = collectionMap.get(wishName) || 0;
      const missing = Math.max(0, wishQty - ownedQty);
      
      if (missing > 0) {
        gaps.push({
          card_name: wishName,
          quantity_missing: missing,
        });
      }
    }

    // Fetch prices for missing cards (optional - can be slow for many cards)
    if (gaps.length > 0) {
      try {
        const gapNames = gaps.map(g => g.card_name);
        const priceRes = await fetch(`${req.nextUrl.origin}/api/price`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ names: gapNames, currency: 'USD' }),
          cache: 'no-store'
        });
        const priceJson = await priceRes.json().catch(() => ({}));
        
        if (priceRes.ok && priceJson?.ok && priceJson.prices) {
          const prices = priceJson.prices as Record<string, number>;
          gaps.forEach(gap => {
            const normName = gap.card_name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
            gap.avg_price = prices[normName] || 0;
          });
        }
      } catch (priceErr) {
        // Continue without prices if fetch fails
        console.warn('[compare-wishlist] Price fetch failed:', priceErr);
      }
    }

    return NextResponse.json({ ok: true, gaps }, { headers: { 'content-type': 'application/json' } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}
