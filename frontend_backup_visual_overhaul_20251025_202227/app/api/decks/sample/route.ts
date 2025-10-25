// API route to import a sample deck for a user
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSampleDeckById, SAMPLE_DECKS } from '@/lib/sample-decks';

export async function GET(req: NextRequest) {
  try {
    // Return list of available sample decks
    const decks = SAMPLE_DECKS.map(deck => ({
      id: deck.id,
      name: deck.name,
      commander: deck.commander,
      description: deck.description,
      colors: deck.colors,
      powerLevel: deck.powerLevel,
      estimatedPrice: deck.estimatedPrice,
      archetype: deck.archetype,
    }));

    return NextResponse.json({ ok: true, decks });
  } catch (error: any) {
    console.error('Error listing sample decks:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to list sample decks' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { deckId } = body;

    if (!deckId) {
      return NextResponse.json(
        { ok: false, error: 'deckId is required' },
        { status: 400 }
      );
    }

    // Get the sample deck
    const sampleDeck = getSampleDeckById(deckId);
    if (!sampleDeck) {
      return NextResponse.json(
        { ok: false, error: 'Sample deck not found' },
        { status: 404 }
      );
    }

    // Create the deck for the user
    const { data: newDeck, error: deckError } = await supabase
      .from('decks')
      .insert({
        user_id: user.id,
        title: sampleDeck.name,
        format: 'commander',
        deck_text: sampleDeck.deckList,
        commander: sampleDeck.commander,
        colors: sampleDeck.colors, // Already an array, don't join
        is_public: false,
      })
      .select()
      .single();

    if (deckError) {
      console.error('Error creating deck:', deckError);
      return NextResponse.json(
        { ok: false, error: 'Failed to create deck' },
        { status: 500 }
      );
    }

    // Parse deck list and insert individual cards into deck_cards table
    try {
      console.log('[Sample Deck] Starting card parsing for deck:', newDeck.id);
      console.log('[Sample Deck] Deck list preview:', sampleDeck.deckList.substring(0, 200));
      
      const lines = sampleDeck.deckList.split('\n').filter(l => l.trim());
      const cardRows: Array<{ deck_id: string; name: string; qty: number }> = [];
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        // Skip category markers (Commander, Sideboard, etc.)
        if (trimmed.toLowerCase().startsWith('commander') || 
            trimmed.toLowerCase().includes('commander:') ||
            trimmed.toLowerCase().startsWith('sideboard') ||
            trimmed.toLowerCase().startsWith('mainboard') ||
            trimmed.toLowerCase().startsWith('deck')) {
          continue;
        }
        
        // Parse card line (format: "1x Card Name" or "1 Card Name")
        const match = trimmed.match(/^(\d+)\s*[xX]?\s+(.+)$/);
        if (match) {
          const quantity = parseInt(match[1], 10);
          const cardName = match[2].trim();
          
          if (cardName && quantity > 0) {
            cardRows.push({
              deck_id: newDeck.id,
              name: cardName,
              qty: quantity,
            });
          }
        }
      }
      
      console.log(`[Sample Deck] Parsed ${cardRows.length} cards from deck list`);
      
      // Insert all cards in one batch
      if (cardRows.length > 0) {
        console.log('[Sample Deck] Attempting to insert cards...');
        const { error: cardsError } = await supabase
          .from('deck_cards')
          .insert(cardRows);
        
        if (cardsError) {
          console.error('[Sample Deck] ERROR inserting deck cards:', cardsError);
          console.error('[Sample Deck] Error details:', JSON.stringify(cardsError, null, 2));
          // Don't fail the whole import, just log it
        } else {
          console.log(`[Sample Deck] ✓ Successfully inserted ${cardRows.length} cards for deck ${newDeck.id}`);
        }
      } else {
        console.warn('[Sample Deck] WARNING: No cards were parsed from the deck list!');
      }
    } catch (parseError) {
      console.error('[Sample Deck] Exception during card parsing:', parseError);
      // Don't fail the import, just log it
    }

    // Track the event
    try {
      console.log(`Sample deck imported: ${sampleDeck.name} for user ${user.id}`);
    } catch (e) {
      // Non-critical, ignore analytics errors
    }

    return NextResponse.json({
      ok: true,
      deck: {
        id: newDeck.id,
        title: newDeck.title,
        commander: newDeck.commander,
      },
      message: `Successfully imported ${sampleDeck.name}!`,
    });
  } catch (error: any) {
    console.error('Error importing sample deck:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to import sample deck' },
      { status: 500 }
    );
  }
}

