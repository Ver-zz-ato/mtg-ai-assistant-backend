import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Deck-Specific Card Recommendations API
 * Returns 3-5 recommended cards based on the current deck's strategy and color identity
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: deckId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get the deck
    const { data: deck } = await supabase
      .from('decks')
      .select('deck_text, commander, colors, format')
      .eq('id', deckId)
      .eq('user_id', user.id)
      .single();

    if (!deck) {
      return NextResponse.json({ ok: false, error: 'Deck not found' }, { status: 404 });
    }

    const recommendations: Array<{
      name: string;
      reason: string;
      imageUrl?: string;
      price?: number;
    }> = [];

    // Parse current deck cards
    const deckCards = new Set<string>();
    if (deck.deck_text) {
      const lines = deck.deck_text.split(/\r?\n/);
      for (const line of lines) {
        const match = line.match(/^(?:\d+x?\s+)?(.+?)(?:\s+\(.*\))?$/);
        if (match) {
          const cardName = match[1].trim();
          if (cardName && !cardName.match(/^(Commander|Sideboard|Deck|Maybeboard):/i)) {
            deckCards.add(cardName.toLowerCase());
          }
        }
      }
    }

    // Get user's collection
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
        items.forEach(item => collectionCards.add(item.name.toLowerCase()));
      }
    }

    // Determine deck colors (from colors field or fallback to common colors)
    const colors = deck.colors || ['W', 'U', 'B', 'R', 'G'];

    // Recommend by deck archetype and colors
    const staplesByColor: Record<string, Array<{ name: string; reason: string }>> = {
      'W': [
        { name: 'Swords to Plowshares', reason: 'Best removal in white' },
        { name: 'Smothering Tithe', reason: 'Top-tier ramp' },
        { name: 'Teferi\'s Protection', reason: 'Ultimate protection spell' },
        { name: 'Enlightened Tutor', reason: 'Finds key enchantments/artifacts' },
        { name: 'Esper Sentinel', reason: 'Card advantage engine' },
      ],
      'U': [
        { name: 'Rhystic Study', reason: 'Best card draw in blue' },
        { name: 'Cyclonic Rift', reason: 'Board wipe on a stick' },
        { name: 'Counterspell', reason: 'Classic protection' },
        { name: 'Mystic Remora', reason: 'Early game card draw' },
        { name: 'Fierce Guardianship', reason: 'Free counterspell' },
      ],
      'B': [
        { name: 'Demonic Tutor', reason: 'Best tutor in the game' },
        { name: 'Toxic Deluge', reason: 'Efficient board wipe' },
        { name: 'Bolas\'s Citadel', reason: 'Powerful card advantage' },
        { name: 'Necropotence', reason: 'Explosive draw engine' },
        { name: 'Deadly Rollick', reason: 'Free removal spell' },
      ],
      'R': [
        { name: 'Dockside Extortionist', reason: 'Explosive mana generation' },
        { name: 'Jeska\'s Will', reason: 'Ritual with card draw' },
        { name: 'Deflecting Swat', reason: 'Free protection/redirect' },
        { name: 'Wheel of Fortune', reason: 'Refill your hand' },
        { name: 'Chaos Warp', reason: 'Versatile removal' },
      ],
      'G': [
        { name: 'Worldly Tutor', reason: 'Finds any creature' },
        { name: 'Eternal Witness', reason: 'Recursion staple' },
        { name: 'Beast Within', reason: 'Flexible removal' },
        { name: 'Three Visits', reason: 'Efficient ramp' },
        { name: 'Heroic Intervention', reason: 'Protects your board' },
      ],
    };

    // Universal colorless staples
    const colorlessStaples = [
      { name: 'Sol Ring', reason: 'Best mana rock' },
      { name: 'Arcane Signet', reason: 'Perfect mana rock' },
      { name: 'Lightning Greaves', reason: 'Haste + protection' },
      { name: 'Swiftfoot Boots', reason: 'Haste + hexproof' },
      { name: 'Command Tower', reason: 'Perfect mana fixing' },
    ];

    // Collect candidates from deck's colors
    const candidates: Array<{ name: string; reason: string }> = [...colorlessStaples];
    colors.forEach((color: string) => {
      if (staplesByColor[color]) {
        candidates.push(...staplesByColor[color]);
      }
    });

    // Filter out cards already in deck
    let filtered = candidates.filter(card => 
      !deckCards.has(card.name.toLowerCase())
    );

    // Filter by format legality
    const deckFormat = (deck.format || 'commander').toLowerCase();
    if (deckFormat !== 'commander') {
      // Check legality in scryfall_cache
      const cardNames = filtered.map(c => c.name);
      const { data: legalityData } = await supabase
        .from('scryfall_cache')
        .select('name, legalities')
        .in('name', cardNames);

      if (legalityData && legalityData.length > 0) {
        const legalCards = new Set<string>();
        legalityData.forEach((card: any) => {
          const legalities = card.legalities || {};
          const formatKey = deckFormat === 'standard' ? 'standard' : deckFormat === 'modern' ? 'modern' : 'commander';
          if (legalities[formatKey] === 'legal' || legalities[formatKey] === 'restricted') {
            legalCards.add(card.name.toLowerCase());
          }
        });
        filtered = filtered.filter(card => legalCards.has(card.name.toLowerCase()));
      }
    }

    // Prioritize cards not in collection
    const notInCollection = filtered.filter(card => 
      !collectionCards.has(card.name.toLowerCase())
    );

    const inCollection = filtered.filter(card => 
      collectionCards.has(card.name.toLowerCase())
    );

    // Take up to 5 recommendations (prefer cards not in collection)
    const selected = [
      ...notInCollection.slice(0, 3),
      ...inCollection.slice(0, 2),
    ].slice(0, 5);

    recommendations.push(...selected);

    // Fetch card images and prices
    for (const rec of recommendations) {
      try {
        // Get image from Scryfall cache
        const { data: cached } = await supabase
          .from('scryfall_cache')
          .select('small, normal')
          .ilike('name', rec.name)
          .single();

        if (cached) {
          rec.imageUrl = cached.small || cached.normal;
        }

        // Get price from price cache
        const { data: priceData } = await supabase
          .from('price_cache')
          .select('usd_price')
          .ilike('card_name', rec.name)
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
        'Cache-Control': 'private, max-age=300', // 5 minutes cache per deck
      }
    });

  } catch (error: any) {
    console.error('Error generating deck recommendations:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to generate recommendations' },
      { status: 500 }
    );
  }
}

