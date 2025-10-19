import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

    const supabase = await createClient();
    
    // Build query
    let query = supabase
      .from('decks')
      .select('id, title, commander, format, colors, created_at, updated_at, owner_id, deck_text', { count: 'exact' })
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

    // Get owner usernames
    const ownerIds = [...new Set(data?.map(d => d.owner_id).filter(Boolean))];
    const { data: users } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', ownerIds);

    const userMap = new Map(users?.map(u => [u.id, u.username]) || []);

    // Enrich deck data
    const decks = data?.map(deck => ({
      ...deck,
      owner_username: userMap.get(deck.owner_id) || 'Anonymous',
      card_count: deck.deck_text ? deck.deck_text.split('\n').filter((l: string) => l.trim()).length : 0,
    })) || [];

    return NextResponse.json({
      ok: true,
      decks,
      total: count || 0,
      page,
      limit,
      hasMore: (count || 0) > offset + limit,
    });
  } catch (error: any) {
    console.error('[Browse Decks] Exception:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}




