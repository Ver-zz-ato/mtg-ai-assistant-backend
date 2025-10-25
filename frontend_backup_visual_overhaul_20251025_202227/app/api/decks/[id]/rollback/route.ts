import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Rollback deck to a previous version
 */
export async function POST(
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

    const body = await request.json();
    const { version_id } = body;

    if (!version_id) {
      return NextResponse.json({ ok: false, error: 'version_id required' }, { status: 400 });
    }

    // Verify deck ownership
    const { data: deck, error: deckError } = await supabase
      .from('decks')
      .select('user_id')
      .eq('id', deckId)
      .single();

    if (deckError || !deck) {
      return NextResponse.json({ ok: false, error: 'Deck not found' }, { status: 404 });
    }

    if (deck.user_id !== user.id) {
      return NextResponse.json({ ok: false, error: 'Not your deck' }, { status: 403 });
    }

    // Get the version to rollback to
    const { data: version, error: versionError } = await supabase
      .from('deck_versions')
      .select('deck_text, card_count')
      .eq('id', version_id)
      .eq('deck_id', deckId)
      .single();

    if (versionError || !version) {
      return NextResponse.json({ ok: false, error: 'Version not found' }, { status: 404 });
    }

    // Update the deck with the old version's content
    const { error: updateError } = await supabase
      .from('decks')
      .update({
        deck_text: version.deck_text,
        updated_at: new Date().toISOString(),
      })
      .eq('id', deckId);

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    // Create a new version entry for this rollback
    const { error: versionInsertError } = await supabase
      .from('deck_versions')
      .insert({
        deck_id: deckId,
        deck_text: version.deck_text,
        version_number: Date.now(), // Use timestamp as version number
        changes_summary: `Rolled back to version ${version_id.substring(0, 8)}`,
        changelog_note: 'Rollback',
        card_count: version.card_count,
        created_by: user.id,
      });

    if (versionInsertError) {
      console.error('Failed to create rollback version:', versionInsertError);
    }

    return NextResponse.json({ ok: true });

  } catch (error: any) {
    console.error('Error rolling back deck:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to rollback' },
      { status: 500 }
    );
  }
}


