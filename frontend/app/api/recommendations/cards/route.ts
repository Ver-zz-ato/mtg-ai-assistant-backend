import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchAllSupabaseRows } from '@/lib/supabase/fetchAllRows';
import { normalizeScryfallCacheName } from '@/lib/server/scryfallCacheRow';
import { normalizeName } from '@/lib/mtg/normalize';
import { getAdmin } from '@/app/api/_lib/supa';
import {
  buildGroundedReason,
  buildTagProfile,
  fetchGroundedCandidatesForProfile,
  fetchTagGroundedRowsByNames,
  hydratePriceAndImages,
  scoreCandidateAgainstProfile,
} from '@/lib/recommendations/tag-grounding';

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
      .select('id, deck_text, commander, colors, format')
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
      const items = await fetchAllSupabaseRows<{ name: string }>(() =>
        supabase
          .from("collection_cards")
          .select("name")
          .eq("collection_id", collections[0].id)
          .order("id", { ascending: true }),
      );
      items.forEach((item) => collectionCards.add(item.name));
    }

    const admin = getAdmin();
    const deckCardNames = Array.from(deckCards);
    const deckProfile =
      admin && deckCardNames.length > 0
        ? buildTagProfile(await fetchTagGroundedRowsByNames(admin, deckCardNames))
        : null;

    // Step 4: Find cards in decks but not in collection
    const missingCards = Array.from(deckCards).filter(card => !collectionCards.has(card));
    
    if (missingCards.length > 0) {
      let selected = missingCards.slice(0, 3);
      if (admin && deckProfile) {
        const groundedMissing = await fetchTagGroundedRowsByNames(admin, missingCards);
        selected = groundedMissing
          .map((row) => ({
            name: String(row.printed_name || row.name),
            score: scoreCandidateAgainstProfile(row, deckProfile),
            reason: buildGroundedReason(row, deckProfile, {
              prefix: 'Already shows up in your decks and matches the themes you build most.',
            }),
          }))
          .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
          .slice(0, 3)
          .map((row) => row.name);
      }
      
      for (const cardName of selected) {
        recommendations.push({
          name: cardName,
          reason: admin && deckProfile
            ? 'Missing from your collection, but it fits the themes you already build.'
            : 'In your decks, not in collection',
        });
      }
    }

    const formatRaw =
      request.nextUrl.searchParams.get("format")?.trim() ||
      (decks && decks[0] && typeof (decks[0] as { format?: string }).format === "string"
        ? (decks[0] as { format: string }).format
        : "Commander");
    const formatLabel =
      formatRaw.length > 0
        ? formatRaw.charAt(0).toUpperCase() + formatRaw.slice(1).toLowerCase()
        : "Commander";

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
      const existingNames = new Set(recommendations.map((row) => normalizeScryfallCacheName(row.name)));

      let newRecs = candidates
        .filter(card => !deckCards.has(card) && !existingNames.has(normalizeScryfallCacheName(card)))
        .slice(0, needed)
        .map((name) => ({ name, reason: `Popular in ${topColors.join('/')} decks` }));

      if (admin && deckProfile) {
        const groundedCandidates = await fetchGroundedCandidatesForProfile(admin, {
          formatLabel,
          topThemeTags: deckProfile.topThemeTags,
          topGameplayTags: deckProfile.topGameplayTags,
          topArchetypeTags: deckProfile.topArchetypeTags,
          excludeNames: [...Array.from(deckCards).map(normalizeScryfallCacheName), ...Array.from(existingNames)],
          limitPerBucket: 48,
        });
        const hydrated = await hydratePriceAndImages(admin, groundedCandidates);
        newRecs = hydrated
          .filter((row) => !collectionCards.has(String(row.printed_name || row.name)))
          .sort((a, b) => scoreCandidateAgainstProfile(b, deckProfile) - scoreCandidateAgainstProfile(a, deckProfile))
          .slice(0, needed)
          .map((row) => ({
            name: String(row.printed_name || row.name),
            reason: buildGroundedReason(row, deckProfile, {
              prefix: `Fits what you already build better than a generic ${topColors.join('/')} staple.`,
            }),
          }));
      }

      newRecs.forEach((rec) => {
        recommendations.push(rec);
      });
    }

    try {
      const { filterRecommendationRowsByName } = await import("@/lib/deck/recommendation-legality");
      const { allowed } = await filterRecommendationRowsByName(recommendations, formatLabel, {
        logPrefix: "/api/recommendations/cards",
      });
      recommendations.length = 0;
      recommendations.push(...allowed);
    } catch (legErr) {
      console.warn("[recommendations/cards] Legality filter failed:", legErr);
    }

    // Step 6: Fetch card images and prices (cache PK vs price_cache key differ — see CARD_DATA_GUARDRAILS)
    for (const rec of recommendations) {
      try {
        const cachePk = normalizeScryfallCacheName(rec.name);
        const priceKey = normalizeName(rec.name);
        const { data: cached } = await supabase
          .from('scryfall_cache')
          .select('small, normal')
          .eq('name', cachePk)
          .maybeSingle();

        if (cached) {
          rec.imageUrl = cached.small || cached.normal;
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
