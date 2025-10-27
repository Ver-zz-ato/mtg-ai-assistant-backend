import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Card Recommendations API
 * Returns 1-3 recommended cards based on user's decks and collection
 * 
 * Algorithm:
 * 1. Cards in user's decks but not in collection (if collection exists)
 * 2. Cards synergizing with favorite commanders (based on color identity)
 * 3. Popular cards in similar decks (based on color identity match)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const recommendations: Array<{
      name: string;
      reason: string;
      imageUrl?: string;
      price?: number;
    }> = [];

    // Step 1: Get user's decks
    const { data: decks } = await supabase
      .from('decks')
      .select('id, deck_text, commander, colors')
      .eq('user_id', user.id)
      .limit(10);

    if (!decks || decks.length === 0) {
      return NextResponse.json({ 
        ok: true, 
        recommendations: [],
        message: 'Create a deck to get personalized recommendations!' 
      });
    }

    // Step 2: Extract all cards from decks
    const deckCards = new Set<string>();
    for (const deck of decks) {
      if (deck.deck_text) {
        const lines = deck.deck_text.split(/\r?\n/);
        for (const line of lines) {
          const match = line.match(/^(?:\d+x?\s+)?(.+?)(?:\s+\(.*\))?$/);
          if (match) {
            const cardName = match[1].trim();
            if (cardName && !cardName.match(/^(Commander|Sideboard|Deck|Maybeboard):/i)) {
              deckCards.add(cardName);
            }
          }
        }
      }
    }

    // Step 3: Check if user has collection
    const { data: collections } = await supabase
      .from('collections')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    let collectionCards = new Set<string>();
    if (collections && collections.length > 0) {
      const { data: items } = await supabase
        .from('collection_cards')
        .select('name')
        .eq('collection_id', collections[0].id);
      
      if (items) {
        items.forEach(item => collectionCards.add(item.name));
      }
    }

    // Step 4: Find cards in decks but not in collection
    const missingCards = Array.from(deckCards).filter(card => !collectionCards.has(card));
    
    if (missingCards.length > 0) {
      // Randomly select up to 3 cards
      const shuffled = missingCards.sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, 3);
      
      for (const cardName of selected) {
        recommendations.push({
          name: cardName,
          reason: 'In your decks, not in collection',
        });
      }
    }

    // Step 5: If we don't have 3 recommendations yet, add popular cards by color
    if (recommendations.length < 3 && decks.length > 0) {
      // Get most common colors from user's decks
      const colorCount: Record<string, number> = {};
      decks.forEach(deck => {
        if (deck.colors) {
          deck.colors.forEach((color: string) => {
            colorCount[color] = (colorCount[color] || 0) + 1;
          });
        }
      });

      const topColors = Object.entries(colorCount)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 2)
        .map(([color]) => color);

      // Popular Commander staples by color
      const staples: Record<string, string[]> = {
        'W': ['Swords to Plowshares', 'Smothering Tithe', 'Teferi\'s Protection'],
        'U': ['Rhystic Study', 'Cyclonic Rift', 'Counterspell'],
        'B': ['Demonic Tutor', 'Toxic Deluge', 'Dark Ritual'],
        'R': ['Dockside Extortionist', 'Jeska\'s Will', 'Lightning Bolt'],
        'G': ['Sol Ring', 'Eternal Witness', 'Beast Within'],
      };

      const candidates = topColors.flatMap(color => staples[color] || []);
      const needed = 3 - recommendations.length;
      const newRecs = candidates
        .filter(card => !deckCards.has(card))
        .slice(0, needed);

      newRecs.forEach(cardName => {
        recommendations.push({
          name: cardName,
          reason: `Popular in ${topColors.join('/')} decks`,
        });
      });
    }

    // Step 6: Fetch card images and prices
    for (const rec of recommendations) {
      try {
        // Get image from Scryfall cache
        const { data: cached } = await supabase
          .from('scryfall_cache')
          .select('small, normal')
          .eq('name', rec.name)
          .single();

        if (cached) {
          rec.imageUrl = cached.small || cached.normal;
        }

        // Get price from price cache
        const { data: priceData } = await supabase
          .from('price_cache')
          .select('usd_price')
          .eq('card_name', rec.name)
          .single();

        if (priceData && priceData.usd_price) {
          rec.price = Number(priceData.usd_price);
        }
      } catch (err) {
        // Skip if card not found in cache
      }
    }

    return NextResponse.json({
      ok: true,
      recommendations,
    }, {
      headers: {
        'Cache-Control': 'private, max-age=300', // 5 minutes cache per user
      }
    });

  } catch (error: any) {
    console.error('Error generating recommendations:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to generate recommendations' },
      { status: 500 }
    );
  }
}


