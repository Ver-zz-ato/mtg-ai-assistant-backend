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

    // Track the event
    try {
      // You can add analytics tracking here if needed
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

