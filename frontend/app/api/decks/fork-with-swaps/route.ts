import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { checkProStatus } from '@/lib/server-pro-check';
import { assertCanCreateDecks } from '@/lib/pro-storage-limits-server';
import { rejectUnlessCsrfOrBearer } from '@/lib/api/requireCsrf';
import { applySwapsToCards } from '@/lib/decks/applySwapsToCards';
import { sanitizeName } from '@/lib/profanity';

const BodySchema = z.object({
  sourceDeckId: z.string().uuid().optional(),
  deckText: z.string().max(50000).optional(),
  commander: z.string().max(200).optional(),
  format: z.string().max(64).optional(),
  title: z.string().min(1).max(120).optional(),
  swaps: z.array(z.object({
    from: z.string().min(1).max(200),
    to: z.string().min(1).max(200),
  })).min(1).max(100),
});

export async function POST(req: NextRequest) {
  try {
    const csrfBlock = rejectUnlessCsrfOrBearer(req);
    if (csrfBlock) return csrfBlock;

    let supabase = await createClient();
    let { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      const authHeader = req.headers.get('Authorization');
      const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (bearerToken) {
        const { createClientWithBearerToken } = await import('@/lib/server-supabase');
        const bearerSupabase = createClientWithBearerToken(bearerToken);
        const { data: { user: bearerUser } } = await bearerSupabase.auth.getUser();
        if (bearerUser) {
          user = bearerUser;
          supabase = bearerSupabase;
        }
      }
    }

    if (!user) {
      return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
    }

    const isPro = await checkProStatus(user.id);
    if (!isPro) {
      return NextResponse.json({ ok: false, code: 'PRO_REQUIRED', error: 'Pro subscription required' }, { status: 403 });
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message || 'Invalid request' }, { status: 400 });
    }

    const { sourceDeckId, deckText, commander, format, title, swaps } = parsed.data;
    if (!sourceDeckId && !deckText?.trim()) {
      return NextResponse.json({ ok: false, error: 'sourceDeckId or deckText required' }, { status: 400 });
    }

    const deckLimit = await assertCanCreateDecks(supabase, user.id);
    if (deckLimit) {
      return NextResponse.json(
        { ok: false, code: deckLimit.code, error: deckLimit.message, limit: deckLimit.limit },
        { status: 403 },
      );
    }

    let sourceTitle = title || 'My Deck';
    let sourceCommander = commander || null;
    let sourceFormat = format || 'Commander';
    let sourceColors: string[] | null = null;
    let cards: Array<{ name: string; qty: number; zone?: string | null }> = [];

    if (sourceDeckId) {
      const { data: sourceDeck, error: deckError } = await supabase
        .from('decks')
        .select('title, commander, format, colors, is_public, user_id')
        .eq('id', sourceDeckId)
        .single();

      if (deckError || !sourceDeck) {
        return NextResponse.json({ ok: false, error: 'Deck not found' }, { status: 404 });
      }
      if (!sourceDeck.is_public && sourceDeck.user_id !== user.id) {
        return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }

      sourceTitle = title || `${sourceDeck.title} (Budget Swaps)`;
      sourceCommander = commander || sourceDeck.commander;
      sourceFormat = format || sourceDeck.format || 'Commander';
      sourceColors = sourceDeck.colors;

      const { data: sourceCards, error: cardsError } = await supabase
        .from('deck_cards')
        .select('name, qty, zone')
        .eq('deck_id', sourceDeckId);

      if (cardsError) {
        return NextResponse.json({ ok: false, error: 'Failed to load deck cards' }, { status: 500 });
      }
      cards = sourceCards || [];
    } else if (deckText) {
      const { parseDeckTextWithZones } = await import('@/lib/deck/parseDeckText');
      const zoned = parseDeckTextWithZones(deckText, {
        isCommanderFormat: !format || /^commander$/i.test(String(format).trim()),
      });
      cards = zoned.map((c) => ({ name: c.name, qty: c.qty, zone: c.zone }));
      sourceTitle = title || 'My Deck (Budget Swaps)';
    }

    const swappedCards = applySwapsToCards(cards, swaps);
    const cleanTitle = sanitizeName(sourceTitle, 120) || 'Budget Swaps Deck';

    const { data: newDeck, error: createError } = await supabase
      .from('decks')
      .insert({
        user_id: user.id,
        title: cleanTitle,
        commander: sourceCommander,
        format: sourceFormat,
        colors: sourceColors,
        is_public: false,
      })
      .select('id, title')
      .single();

    if (createError || !newDeck) {
      return NextResponse.json({ ok: false, error: 'Failed to create deck' }, { status: 500 });
    }

    if (swappedCards.length > 0) {
      const rows = swappedCards.map((c) => ({
        deck_id: newDeck.id,
        name: c.name,
        qty: Math.max(1, Number(c.qty) || 1),
        zone: c.zone ?? 'mainboard',
      }));

      const { error: insertError } = await supabase.from('deck_cards').insert(rows);
      if (insertError) {
        await supabase.from('decks').delete().eq('id', newDeck.id);
        return NextResponse.json({ ok: false, error: 'Failed to copy swapped cards' }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      deckId: newDeck.id,
      id: newDeck.id,
      title: newDeck.title,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
