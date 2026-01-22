import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/server-supabase';
import { getPromptVersion } from '@/lib/config/prompts';

export const runtime = 'nodejs';

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.OPENAI_MODEL || "gpt-5";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const deckId = String(body?.deckId || '');
    const category = String(body?.category || '');
    const label = String(body?.label || '');

    if (!deckId || !category) {
      return NextResponse.json({ ok: false, error: 'deckId and category required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Check Pro status - deck health features are Pro-only
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_pro')
      .eq('id', user.id)
      .single();
    const isPro = profile?.is_pro || false;
    
    if (!isPro) {
      return NextResponse.json({ ok: false, error: 'Deck Health features are Pro-only. Upgrade to unlock AI suggestions!' }, { status: 403 });
    }

    // Verify deck ownership
    const { data: deck } = await supabase
      .from('decks')
      .select('title, commander, deck_text, format')
      .eq('id', deckId)
      .eq('user_id', user.id)
      .single();

    if (!deck) {
      return NextResponse.json({ ok: false, error: 'Deck not found' }, { status: 404 });
    }

    // Get deck cards
    const { data: deckCards } = await supabase
      .from('deck_cards')
      .select('name, qty')
      .eq('deck_id', deckId)
      .limit(400);

    const cardList = Array.isArray(deckCards) 
      ? deckCards.map((c: any) => `${c.qty}x ${c.name}`).join("; ")
      : String(deck.deck_text || '').split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean).join("; ");

    const commander = String(deck.commander || '');
    const title = String(deck.title || 'Untitled');
    const format = String(deck.format || 'Commander');

    // Generate category-specific prompt
    const categoryPrompts: Record<string, string> = {
      'mana_base': 'Suggest 5-7 lands or mana fixing cards to improve the mana base for this deck. Focus on lands that produce the deck\'s colors efficiently.',
      'interaction': 'Suggest 5-7 removal spells, counterspells, or interaction cards to improve this deck\'s ability to interact with opponents.',
      'card_draw': 'Suggest 5-7 card draw or card advantage spells to improve this deck\'s ability to draw cards and maintain card advantage.',
      'win_condition': 'Suggest 5-7 win conditions, finishers, or ways to close out the game for this deck.'
    };

    const prompt = categoryPrompts[category] || `Suggest 5-7 cards to improve ${label.toLowerCase()} for this deck.`;
    const deckContext = `Deck: ${title}${commander ? ` | Commander: ${commander}` : ''} | Format: ${format} | Full Decklist: ${cardList}`;
    const fullPrompt = `${prompt}\n\n${deckContext}`;

    // Load deck analysis prompt as base
    let basePrompt = 'You are ManaTap AI, an expert Magic: The Gathering assistant.';
    try {
      const promptVersion = await getPromptVersion('deck_analysis');
      if (promptVersion) {
        basePrompt = promptVersion.system_prompt;
      }
    } catch (e) {
      console.warn('[health-suggestions] Failed to load prompt version:', e);
    }

    const systemPrompt = [
      basePrompt,
      '',
      '=== DECK HEALTH SUGGESTIONS MODE ===',
      'Provide specific card suggestions to improve the deck\'s health in the requested category.',
      'Format your response as a numbered list with card names and brief explanations.',
      'Example:',
      '1. Lightning Greaves - Provides haste and protection for key creatures',
      '2. Sol Ring - Essential mana acceleration',
      '',
      'Focus on cards that are:',
      '- Legal in the deck\'s format',
      '- Match the deck\'s color identity',
      '- Fill the specific role requested',
      '- Are commonly played and effective',
    ].join('\n');

    // Call OpenAI
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: 'AI service unavailable' }, { status: 503 });
    }

    // Build request body - use max_completion_tokens for newer models, max_tokens for older ones
    const requestBody: any = {
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: fullPrompt }
      ],
      temperature: 0.7
    };
    
    // Only add max tokens parameter if model supports it
    // Newer models (gpt-4o, gpt-4-turbo, o1, etc.) use max_completion_tokens
    // Older models (gpt-3.5, gpt-4) use max_tokens
    // If model name contains 'o1' or 'o3', skip the parameter entirely as it's not supported
    const modelLower = MODEL.toLowerCase();
    if (modelLower.includes('o1') || modelLower.includes('o3')) {
      // O1/O3 models don't support max tokens parameters
      // Don't add any max tokens parameter
    } else if (modelLower.includes('gpt-4o') || modelLower.includes('gpt-4-turbo') || modelLower.includes('gpt-4o-2024')) {
      // Newer models use max_completion_tokens
      requestBody.max_completion_tokens = 512;
    } else {
      // Older models use max_tokens
      requestBody.max_tokens = 512;
    }
    
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      return NextResponse.json({ ok: false, error: error?.error?.message || 'AI request failed' }, { status: 500 });
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content || '';

    // Extract card suggestions from response
    const suggestions: Array<{ card: string; reason: string }> = [];
    
    // Try numbered list format: "1. Card Name - reason"
    const numberedMatches = content.match(/(?:^|\n)\d+\.\s*([A-Z][A-Za-z\s,'-]+(?:,\s*the\s+[A-Za-z\s-]+)?)(?:\s*[-–—]\s*([^\n]+))?/g) || [];
    for (const match of numberedMatches.slice(0, 7)) {
      const parts = match.match(/\d+\.\s*([A-Z][A-Za-z\s,'-]+(?:,\s*the\s+[A-Za-z\s-]+)?)(?:\s*[-–—]\s*([^\n]+))?/);
      if (parts && parts[1]) {
        const cardName = parts[1].trim();
        const reason = parts[2]?.trim() || 'Recommended for this deck';
        if (cardName.length > 2 && cardName.length < 100) {
          suggestions.push({ card: cardName, reason });
        }
      }
    }

    // Fallback: try bullet points
    if (suggestions.length === 0) {
      const bulletMatches = content.match(/(?:^|\n)[-*]\s*([A-Z][A-Za-z\s,'-]+)/g) || [];
      for (const match of bulletMatches.slice(0, 7)) {
        const cardName = match.replace(/^[\n\s]*[-*]\s*/, '').trim();
        if (cardName.length > 2 && cardName.length < 100) {
          suggestions.push({ card: cardName, reason: 'Recommended for this deck' });
        }
      }
    }

    return NextResponse.json({ ok: true, suggestions });
  } catch (e: any) {
    console.error('[health-suggestions] Error:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 500 });
  }
}
