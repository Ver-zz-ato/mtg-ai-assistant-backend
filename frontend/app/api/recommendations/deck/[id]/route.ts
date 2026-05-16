import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchAllSupabaseRows } from '@/lib/supabase/fetchAllRows';
import { getDetailsForNamesCached } from '@/lib/server/scryfallCache';
import { isWithinColorIdentity } from '@/lib/deck/mtgValidators';
import { parseDeckText } from '@/lib/deck/parseDeckText';
import { normalizeName } from '@/lib/mtg/normalize';
import { getAdmin } from '@/app/api/_lib/supa';
import { checkProStatus } from '@/lib/server-pro-check';
import {
  type GroundedCardCandidate,
  buildGroundedReason,
  buildTagProfile,
  fetchGroundedCandidatesForProfile,
  fetchTagGroundedRowsByNames,
  hydratePriceAndImages,
  scoreCandidateAgainstProfile,
} from '@/lib/recommendations/tag-grounding';
import { aiRerankRecommendations, buildRecommendationIntent, rankGroundedCandidates } from '@/lib/recommendations/recommendation-pipeline';

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
    const isPro = await checkProStatus(user.id);

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
    const rerankPool: GroundedCardCandidate[] = [];

    // Parse current deck cards (shared parser: strips set tails, section lines, etc.)
    const deckCards = new Set<string>();
    if (deck.deck_text) {
      for (const e of parseDeckText(deck.deck_text)) {
        deckCards.add(cacheNameNorm(e.name));
      }
    }
    const admin = getAdmin();
    const deckCardNames = Array.from(deckCards);
    const deckProfile =
      admin && deckCardNames.length > 0
        ? buildTagProfile(await fetchTagGroundedRowsByNames(admin, deckCardNames))
        : null;

    // Get user's collection
    const { data: collections } = await supabase
      .from('collections')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    let collectionCards = new Set<string>();
    if (collections && collections.length > 0) {
      const items = await fetchAllSupabaseRows<{ name: string }>(() =>
        supabase
          .from("collection_cards")
          .select("name")
          .eq("collection_id", collections[0].id)
          .order("id", { ascending: true }),
      );
      items.forEach((item) => collectionCards.add(cacheNameNorm(item.name)));
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
        if (!entry) return false;
        return isWithinColorIdentity(entry as any, colors);
      });
    }

    const formatLabel =
      (deck.format || "Commander").trim().length > 0
        ? (deck.format || "Commander").trim().charAt(0).toUpperCase() +
          (deck.format || "Commander").trim().slice(1).toLowerCase()
        : "Commander";

    try {
      const { filterRecommendationRowsByName } = await import("@/lib/deck/recommendation-legality");
      const { allowed } = await filterRecommendationRowsByName(filtered, formatLabel, {
        logPrefix: "/api/recommendations/deck",
      });
      filtered = allowed;
    } catch (legErr) {
      console.warn("[recommendations/deck] Legality filter failed:", legErr);
    }

    let selected: Array<{ name: string; reason: string }> = [];
    if (admin && deckProfile) {
      const groundedPool = await fetchGroundedCandidatesForProfile(admin, {
        formatLabel,
        topThemeTags: deckProfile.topThemeTags,
        topGameplayTags: deckProfile.topGameplayTags,
        topArchetypeTags: deckProfile.topArchetypeTags,
        commanderColors: isCommander ? colors : undefined,
        excludeNames: Array.from(deckCards),
        limitPerBucket: 72,
      });
      const hydratedGrounded = await hydratePriceAndImages(admin, groundedPool);
      rerankPool.push(...hydratedGrounded);
      const scoredGrounded = hydratedGrounded
        .map((row) => ({
          name: String(row.printed_name || row.name),
          reason: buildGroundedReason(row, deckProfile, {
            prefix: 'Matches the deck plan better than a generic color staple.',
          }),
          score: scoreCandidateAgainstProfile(row, deckProfile),
          inCollection: collectionCards.has(cacheNameNorm(String(row.printed_name || row.name))),
        }))
        .sort((a, b) => {
          if (a.inCollection !== b.inCollection) return a.inCollection ? 1 : -1;
          return b.score - a.score || a.name.localeCompare(b.name);
        });
      selected = scoredGrounded.slice(0, 5).map(({ name, reason }) => ({ name, reason }));
    }

    if (selected.length === 0) {
      // Prioritize cards not in collection
      const notInCollection = filtered.filter(card => 
        !collectionCards.has(cacheNameNorm(card.name))
      );

      const inCollection = filtered.filter(card => 
        collectionCards.has(cacheNameNorm(card.name))
      );

      // Take up to 5 recommendations (prefer cards not in collection)
      selected = [
        ...notInCollection.slice(0, 3),
        ...inCollection.slice(0, 2),
      ].slice(0, 5);
    }

    recommendations.push(...selected);

    if (admin && deckProfile && rerankPool.length > 0) {
      const intent = buildRecommendationIntent({
        routeKind: "deck",
        routeLabel: "deck_recommendations",
        formatLabel,
        profile: deckProfile,
        selectionCount: recommendations.length || 5,
        commanderColors: isCommander ? colors : undefined,
        isGuest: false,
        isPro,
        userId: user.id,
      });
      const ranked = rankGroundedCandidates(rerankPool, deckProfile, intent).slice(0, 28);
      const reranked = await aiRerankRecommendations({
        candidates: ranked,
        intent,
        userId: user.id,
        isPro,
      }).catch(() => null);
      if (reranked?.picks?.length) {
        const byName = new Map(ranked.map((row) => [String(row.printed_name || row.name), row]));
        const nextRecs: Array<{ name: string; reason: string; imageUrl?: string; imageNormal?: string; price?: number }> = [];
        for (const pick of reranked.picks) {
          const row = byName.get(pick.name);
          if (!row) continue;
          nextRecs.push({
            name: pick.name,
            reason: pick.reason || row.groundedReason,
            imageUrl: row.small ?? row.normal ?? undefined,
            imageNormal: row.normal ?? row.small ?? undefined,
            price: row.price,
          });
          if (nextRecs.length >= (recommendations.length || 5)) break;
        }
        if (nextRecs.length > 0) {
          recommendations.length = 0;
          recommendations.push(...nextRecs);
        }
      }
    }

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
