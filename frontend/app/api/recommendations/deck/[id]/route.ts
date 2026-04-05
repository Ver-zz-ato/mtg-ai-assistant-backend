import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDetailsForNamesCached } from '@/lib/server/scryfallCache';
import { isWithinColorIdentity } from '@/lib/deck/mtgValidators';
import { parseDeckText } from '@/lib/deck/parseDeckText';
import { normalizeName } from '@/lib/mtg/normalize';

export const runtime = 'nodejs';

/** Same normalization as `scryfall_cache.name` keys in `lib/server/scryfallCache.ts` (`norm`). */
function cacheNameNorm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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
    let supabase = await createClient();
    let { data: { user } } = await supabase.auth.getUser();

    // Bearer fallback for mobile
    if (!user) {
      const authHeader = request.headers.get("Authorization");
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (bearerToken) {
        const { createClientWithBearerToken } = await import("@/lib/server-supabase");
        const bearerSupabase = createClientWithBearerToken(bearerToken);
        const { data: { user: bearerUser } } = await bearerSupabase.auth.getUser();
        if (bearerUser) {
          user = bearerUser;
          supabase = bearerSupabase;
        }
      }
    }

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
      imageNormal?: string;
      price?: number;
    }> = [];

    // Parse current deck cards (shared parser: strips set tails, section lines, etc.)
    const deckCards = new Set<string>();
    if (deck.deck_text) {
      for (const e of parseDeckText(deck.deck_text)) {
        deckCards.add(cacheNameNorm(e.name));
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
        items.forEach(item => collectionCards.add(cacheNameNorm(item.name)));
      }
    }

    // Commander: use deck colors (commander identity). 60-card: allow broader for suggestions.
    const deckFormat = (deck.format || 'commander').toLowerCase();
    const isCommander = deckFormat === 'commander';
    const colors = Array.isArray(deck.colors) && deck.colors.length > 0
      ? deck.colors.map((c: string) => c.toUpperCase())
      : isCommander ? [] : ['W', 'U', 'B', 'R', 'G'];

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
    let filtered = candidates.filter(card => !deckCards.has(cacheNameNorm(card.name)));

    // Commander: filter by color identity (ensure no off-color cards)
    if (isCommander && colors.length > 0) {
      const cardNames = filtered.map(c => c.name);
      const details = await getDetailsForNamesCached(cardNames);
      filtered = filtered.filter(card => {
        const key = cacheNameNorm(card.name);
        const entry = details.get(key);
        if (!entry) return true; // Unknown card: keep (e.g. cache miss)
        return isWithinColorIdentity(entry as any, colors);
      });
    }

    // Filter by format legality (non-Commander)
    if (deckFormat !== 'commander') {
      const legalityKeys = Array.from(new Set(filtered.map((c) => cacheNameNorm(c.name)))).filter(Boolean);
      if (legalityKeys.length > 0) {
        const { data: legalityData } = await supabase
          .from('scryfall_cache')
          .select('name, legalities')
          .in('name', legalityKeys);

        if (legalityData && legalityData.length > 0) {
          const legalCards = new Set<string>();
          legalityData.forEach((card: any) => {
            const legalities = card.legalities || {};
            const formatKey = deckFormat === 'standard' ? 'standard' : deckFormat === 'modern' ? 'modern' : 'commander';
            if (legalities[formatKey] === 'legal' || legalities[formatKey] === 'restricted') {
              legalCards.add(cacheNameNorm(String(card.name ?? '')));
            }
          });
          filtered = filtered.filter((card) => legalCards.has(cacheNameNorm(card.name)));
        }
      }
    }

    // Prioritize cards not in collection
    const notInCollection = filtered.filter(card => 
      !collectionCards.has(cacheNameNorm(card.name))
    );

    const inCollection = filtered.filter(card => 
      collectionCards.has(cacheNameNorm(card.name))
    );

    // Take up to 5 recommendations (prefer cards not in collection)
    const selected = [
      ...notInCollection.slice(0, 3),
      ...inCollection.slice(0, 2),
    ].slice(0, 5);

    recommendations.push(...selected);

    // Fetch card images and prices (scryfall_cache.name = oracle PK; price_cache uses normalizeName)
    for (const rec of recommendations) {
      try {
        const cachePk = cacheNameNorm(rec.name);
        const priceKey = normalizeName(rec.name);
        const { data: cached } = await supabase
          .from('scryfall_cache')
          .select('small, normal')
          .eq('name', cachePk)
          .maybeSingle();

        if (cached) {
          rec.imageUrl = cached.small || cached.normal;
          rec.imageNormal = cached.normal || cached.small;
        }

        const { data: priceData } = await supabase
          .from('price_cache')
          .select('usd_price')
          .eq('card_name', priceKey)
          .maybeSingle();

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

