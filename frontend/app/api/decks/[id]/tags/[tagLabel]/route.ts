import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; tagLabel: string }> }
) {
  const { id: deckId, tagLabel } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Check if deck belongs to user
  const { data: deck } = await supabase
    .from('decks')
    .select('user_id')
    .eq('id', deckId)
    .single();

  if (!deck || deck.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: 'Deck not found or unauthorized' }, { status: 403 });
  }

  // Delete the tag
  const { error } = await supabase
    .from('deck_tags')
    .delete()
    .eq('deck_id', deckId)
    .eq('tag', decodeURIComponent(tagLabel));

  if (error) {
    console.error('Error removing tag from deck:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: 'Tag removed successfully' });
}

