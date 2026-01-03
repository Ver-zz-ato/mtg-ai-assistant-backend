import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CachePresets } from "@/lib/api/cache";
import { logger } from "@/lib/logger";

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
  // Handle both actual newlines and escaped \n characters
  let text = String(deckText);
  // Replace escaped newlines with actual newlines (handle both \n and \\n)
  text = text.replace(/\\n/g, '\n').replace(/\\\\n/g, '\n');
  // Also handle if it's stored as literal backslash-n characters
  if (text.includes('\\n') && !text.includes('\n')) {
    // If we have \n but no actual newlines, try to split on \n
    const lines = text.split(/\\n/).filter(l => l.trim());
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
  // Normal path: split on actual newlines
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  let total = 0;
  for (const line of lines) {
    // Match patterns like "1 Card Name" or "2x Card Name"
    const m = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    if (m) {
      total += parseInt(m[1], 10) || 1;
    } else if (line.trim() && !line.match(/^(Commander|Sideboard|Deck|Maybeboard):/i)) {
      // If no quantity found but line has content, count as 1
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
    
    // Build query - use service role to bypass RLS for public deck browsing
    // Check both is_public and public columns to be safe (some decks might only have one set)
    let query = supabase
      .from('decks')
      .select('id, title, commander, format, colors, created_at, updated_at, user_id, deck_text, is_public, public', { count: 'exact' })
      .or('is_public.eq.true,public.eq.true');

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

    // Debug logging
    console.log(`[Browse Decks] Query returned ${data?.length || 0} decks (total count: ${count})`);
    console.log(`[Browse Decks] Using service role: ${!!serviceKey}`);
    if (data && data.length > 0) {
      const sampleDeck = data[0];
      const cardCount = countCards(sampleDeck.deck_text);
      console.log(`[Browse Decks] Sample deck: "${sampleDeck.title}"`);
      console.log(`[Browse Decks]   - Card count: ${cardCount}`);
      console.log(`[Browse Decks]   - is_public: ${sampleDeck.is_public}, public: ${(sampleDeck as any).public}`);
      console.log(`[Browse Decks]   - deck_text length: ${(sampleDeck.deck_text || '').length}`);
      console.log(`[Browse Decks]   - deck_text preview: ${(sampleDeck.deck_text || '').substring(0, 300)}`);
    } else {
      console.log(`[Browse Decks] No decks found! Checking if any public decks exist...`);
      // Debug query to see if ANY public decks exist
      const { data: debugData, error: debugError } = await supabase
        .from('decks')
        .select('id, title, is_public, public', { count: 'exact' })
        .limit(5);
      console.log(`[Browse Decks] Debug query: ${debugData?.length || 0} total decks found, error: ${debugError?.message || 'none'}`);
      if (debugData && debugData.length > 0) {
        console.log(`[Browse Decks] Sample decks from debug query:`, debugData.map((d: any) => ({
          title: d.title,
          is_public: d.is_public,
          public: d.public
        })));
      }
    }

    // Filter decks with at least 10 cards
    const filteredDecks = (data || []).filter(d => {
      const cardCount = countCards(d.deck_text);
      if (cardCount < 10) {
        logger.debug(`[Browse Decks] Filtered out deck "${d.title}" - only ${cardCount} cards`);
      }
      return cardCount >= 10;
    });
    
    logger.debug(`[Browse Decks] After card count filter: ${filteredDecks.length} decks (from ${data?.length || 0} fetched, total available: ${count || 0})`);

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
      deck_text: deck.deck_text, // Include deck_text for art loading
    }));

    // Calculate if there are more pages
    // Note: We use the original count from Supabase, but we've filtered some out
    // For simplicity, we'll use the filtered count and check if we got a full page
    const totalAfterFilter = (count || 0); // This is approximate since filtering happens after pagination
    const hasMore = filteredDecks.length === limit; // If we got a full page, there might be more

    return NextResponse.json({
      ok: true,
      decks,
      total: totalAfterFilter, // Use the count from Supabase query
      page,
      limit,
      hasMore,
    }, {
      headers: CachePresets.SHORT
    });
  } catch (error: any) {
    logger.error('[Browse Decks] Exception:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}





