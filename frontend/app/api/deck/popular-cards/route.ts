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
    
    // Calculate inclusion rates and sort
    const totalDecks = decks.length;
    const popularCards = Object.entries(cardCounts)
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
