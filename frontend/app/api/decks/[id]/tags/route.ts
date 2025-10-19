import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateTag } from '@/lib/predefined-tags';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: deckId } = await params;
  const supabase = await createClient();

  const { data: deckTags, error } = await supabase
    .from('deck_tags')
    .select('tag')
    .eq('deck_id', deckId);

  if (error) {
    console.error('Error fetching deck tags:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const tags = deckTags.map(dt => dt.tag).filter(Boolean);
  return NextResponse.json({ ok: true, tags });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: deckId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { tagLabel } = await request.json();

  if (!tagLabel) {
    return NextResponse.json({ ok: false, error: 'Tag label is required' }, { status: 400 });
  }

  // Validate tag
  const validation = validateTag(tagLabel);
  if (!validation.valid || !validation.sanitized) {
    return NextResponse.json({ ok: false, error: validation.error || 'Invalid tag' }, { status: 400 });
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

  // Check if tag already exists on deck
  const { data: existing } = await supabase
    .from('deck_tags')
    .select('id')
    .eq('deck_id', deckId)
    .eq('tag', validation.sanitized)
    .single();

  if (existing) {
    return NextResponse.json({ ok: false, error: 'Tag already exists on this deck' }, { status: 409 });
  }

  // Add the tag
  const { error: addError } = await supabase
    .from('deck_tags')
    .insert({ deck_id: deckId, tag: validation.sanitized });

  if (addError) {
    console.error('Error adding tag to deck:', addError);
    return NextResponse.json({ ok: false, error: addError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: 'Tag added successfully' });
}

