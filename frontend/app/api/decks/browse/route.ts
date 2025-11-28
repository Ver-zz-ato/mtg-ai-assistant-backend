import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use service role client to bypass RLS for public deck browsing
// This is safe because we only query decks with is_public = true
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
const supabase = serviceKey 
  ? createClient(url, serviceKey, { auth: { persistSession: false } })
  : createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

export const revalidate = 60; // Cache for 1 minute
export const dynamic = "force-dynamic";

// Helper to count cards in deck_text
function countCards(deckText: string | null | undefined): number {
  if (!deckText) return 0;
  const lines = String(deckText).split(/\r?\n/).filter(l => l.trim());
  let total = 0;
  for (const line of lines) {
    const m = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    if (m) {
      total += parseInt(m[1], 10) || 1;
    } else if (line.trim() && !line.match(/^(Commander|Sideboard|Deck|Maybeboard):/i)) {
      total += 1;
    }
  }
  return total;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    
    // Filters
    const search = searchParams.get('search') || '';
    const format = searchParams.get('format') || '';
    const colors = searchParams.get('colors') || '';
    const sort = searchParams.get('sort') || 'recent'; // recent, popular, budget, expensive
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '24'), 100);
    const offset = (page - 1) * limit;
    
    // Build query - use cookie-free client for public data
    let query = supabase
      .from('decks')
      .select('id, title, commander, format, colors, created_at, updated_at, user_id, deck_text', { count: 'exact' })
      .eq('is_public', true);

    // Apply filters
    if (search) {
      query = query.or(`title.ilike.%${search}%,commander.ilike.%${search}%,deck_text.ilike.%${search}%`);
    }

    if (format && format !== 'all') {
      query = query.eq('format', format);
    }

    if (colors && colors !== 'all') {
      // Color filter: contains any of the specified colors
      const colorArray = colors.split('');
      const colorFilters = colorArray.map(c => `colors.cs.{${c}}`);
      query = query.or(colorFilters.join(','));
    }

    // Sorting
    switch (sort) {
      case 'popular':
        // We'll need to add a likes_count column or join with likes
        // For now, use created_at as a proxy
        query = query.order('created_at', { ascending: false });
        break;
      case 'budget':
        // Would need a price column
        query = query.order('created_at', { ascending: false });
        break;
      case 'expensive':
        query = query.order('created_at', { ascending: false });
        break;
      case 'recent':
      default:
        query = query.order('created_at', { ascending: false });
        break;
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[Browse Decks] Error:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Debug logging (can be removed later)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Browse Decks] Found ${data?.length || 0} decks (total count: ${count})`);
    }

    // Filter decks with at least 10 cards
    const filteredDecks = (data || []).filter(d => countCards(d.deck_text) >= 10);

    // Get owner usernames
    const ownerIds = [...new Set(filteredDecks.map(d => d.user_id).filter(Boolean))];
    const { data: users } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', ownerIds);

    const userMap = new Map(users?.map(u => [u.id, u.username]) || []);

    // Enrich deck data
    const decks = filteredDecks.map(deck => ({
      ...deck,
      owner_username: userMap.get(deck.user_id) || 'Anonymous',
      card_count: countCards(deck.deck_text),
    }));

    return NextResponse.json({
      ok: true,
      decks,
      total: filteredDecks.length,
      page,
      limit,
      hasMore: filteredDecks.length > offset + limit,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
      }
    });
  } catch (error: any) {
    console.error('[Browse Decks] Exception:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}





