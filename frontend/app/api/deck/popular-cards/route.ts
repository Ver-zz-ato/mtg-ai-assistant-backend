export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const commander = searchParams.get('commander');
    
    if (!commander || !commander.trim()) {
      return NextResponse.json({ ok: false, error: 'commander parameter required' }, { status: 400 });
    }
    
    const supabase = await createClient();
    const commanderName = commander.trim();
    
    // Query public Commander decks with matching commander
    const { data: decks, error: decksError } = await supabase
      .from('decks')
      .select('id')
      .eq('is_public', true)
      .eq('format', 'Commander')
      .ilike('commander', commanderName)
      .limit(500); // Sample up to 500 decks
    
    if (decksError) {
      console.error('[popular-cards] Error fetching decks:', decksError);
      return NextResponse.json({ ok: false, error: 'Failed to fetch decks' }, { status: 500 });
    }
    
    if (!decks || decks.length === 0) {
      return NextResponse.json({ ok: true, cards: [] });
    }
    
    const deckIds = decks.map(d => d.id);
    
    // Get all cards from these decks
    const { data: cards, error: cardsError } = await supabase
      .from('deck_cards')
      .select('name')
      .in('deck_id', deckIds);
    
    if (cardsError) {
      console.error('[popular-cards] Error fetching cards:', cardsError);
      return NextResponse.json({ ok: false, error: 'Failed to fetch cards' }, { status: 500 });
    }
    
    // Count card inclusions
    const cardCounts: Record<string, number> = {};
    if (cards && cards.length > 0) {
      cards.forEach((card: any) => {
        const name = String(card.name || '').trim();
        if (name) {
          cardCounts[name] = (cardCounts[name] || 0) + 1;
        }
      });
    }
    
    // Get commander's color identity and filter cards
    let filteredCardCounts = cardCounts;
    try {
      // Normalize commander name for lookup
      const normName = commanderName.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
      
      const { data: cmdCache } = await supabase
        .from('scryfall_cache')
        .select('color_identity')
        .eq('name', normName)
        .maybeSingle();
      
      const allowedColors = (cmdCache?.color_identity || []).map((c: string) => c.toUpperCase());
      
      if (allowedColors.length > 0) {
        console.log(`[popular-cards] Commander ${commanderName} color identity: ${allowedColors.join(',')}`);
        
        // Fetch color identity for all popular cards
        const cardNames = Object.keys(cardCounts);
        const { getDetailsForNamesCached } = await import('@/lib/server/scryfallCache');
        const { isWithinColorIdentity } = await import('@/lib/deck/mtgValidators');
        
        const cardDetails = await getDetailsForNamesCached(cardNames);
        
        // Filter out off-color cards
        filteredCardCounts = {};
        let removedCount = 0;
        
        for (const [cardName, count] of Object.entries(cardCounts)) {
          const normCard = cardName.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
          const entry = cardDetails.get(normCard) || 
            Array.from(cardDetails.entries()).find(([k]) => k.toLowerCase() === normCard)?.[1];
          
          if (!entry) {
            // Card not found in cache - include it (might be valid)
            filteredCardCounts[cardName] = count;
            continue;
          }
          
          const cardColors = entry.color_identity || [];
          const isValid = isWithinColorIdentity({ color_identity: cardColors } as any, allowedColors);
          
          if (isValid) {
            filteredCardCounts[cardName] = count;
          } else {
            removedCount++;
          }
        }
        
        if (removedCount > 0) {
          console.log(`[popular-cards] Filtered out ${removedCount} off-color cards`);
        }
      }
    } catch (colorErr) {
      console.warn('[popular-cards] Color identity filtering failed, returning unfiltered:', colorErr);
      // Continue with unfiltered results
    }
    
    // Calculate inclusion rates and sort
    const totalDecks = decks.length;
    const popularCards = Object.entries(filteredCardCounts)
      .map(([card, count]) => ({
        card,
        inclusion_rate: `${Math.round((count / totalDecks) * 100)}%`,
        deck_count: count
      }))
      .sort((a, b) => b.deck_count - a.deck_count)
      .slice(0, 30); // Top 30 cards
    
    return NextResponse.json({
      ok: true,
      cards: popularCards,
      total_decks: totalDecks
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' // Cache for 1 hour
      }
    });
  } catch (e: any) {
    console.error('[popular-cards] Error:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}
