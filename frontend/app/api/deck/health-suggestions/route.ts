import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/server-supabase';
import { getPromptVersion } from '@/lib/config/prompts';
import { prepareOpenAIBody } from '@/lib/ai/openai-params';
import { fetchCard, inferDeckContext } from '@/lib/deck/inference';
import { isWithinColorIdentity, isLegalForFormat, normalizeCardName } from '@/lib/deck/mtgValidators';

export const runtime = 'nodejs';

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.OPENAI_MODEL || "gpt-5";

export async function POST(req: NextRequest) {
  // Always log entry (even in production) for debugging
  const DEBUG = true; // Force debugging on
  console.log('🚀 [health-suggestions] ==========================================');
  console.log('🚀 [health-suggestions] API route called at', new Date().toISOString());
  console.log('🚀 [health-suggestions] ==========================================');
  
  try {
    const body = await req.json().catch((e) => {
      console.error('❌ [health-suggestions] JSON parse error:', e);
      return {};
    });
    
    const deckId = String(body?.deckId || '');
    const category = String(body?.category || '');
    const label = String(body?.label || '');

    console.log('📋 [health-suggestions] Request params:', { deckId, category, label });

    if (!deckId || !category) {
      console.error('❌ [health-suggestions] Missing required params');
      return NextResponse.json({ ok: false, error: 'deckId and category required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Check Pro status - deck health features are Pro-only
    // Use standardized Pro check that checks both database and metadata
    const { checkProStatus } = await import('@/lib/server-pro-check');
    const isPro = await checkProStatus(user.id);
    
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
    const format = String(deck.format || 'Commander') as 'Commander' | 'Modern' | 'Pioneer' | 'Standard';
    
    // Fetch commander color identity for validation
    let allowedColors: string[] = [];
    if (commander && format === 'Commander') {
      try {
        const commanderCard = await fetchCard(commander);
        if (commanderCard?.color_identity) {
          allowedColors = Array.isArray(commanderCard.color_identity) 
            ? commanderCard.color_identity.map((c: string) => c.toUpperCase())
            : [];
        }
      } catch (e) {
        console.warn('[health-suggestions] Failed to fetch commander color identity:', e);
      }
    }
    
    // If no commander or not Commander format, infer colors from deck
    if (allowedColors.length === 0) {
      try {
        const deckText = String(deck.deck_text || '');
        const entries = Array.isArray(deckCards) 
          ? deckCards.map((c: any) => ({ count: c.qty, name: c.name }))
          : [];
        const inferred = await inferDeckContext(deckText, '', entries, format, commander || null, [], new Map());
        allowedColors = inferred.colors.map((c: string) => c.toUpperCase());
      } catch (e) {
        console.warn('[health-suggestions] Failed to infer colors:', e);
        // Default to allowing all colors if inference fails
        allowedColors = ['W', 'U', 'B', 'R', 'G', 'C'];
      }
    }
    
    // If still no colors, allow colorless at minimum
    if (allowedColors.length === 0) {
      allowedColors = ['C'];
    }

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

    // Build request body - no token limit for deck scan; no temperature/top_p
    const requestBody = prepareOpenAIBody({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: fullPrompt }
      ]
      // No token limit - let the model generate as much as needed
    });

    console.log('📤 [health-suggestions] Sending request to OpenAI:', {
      url: OPENAI_URL,
      model: MODEL,
      hasApiKey: !!apiKey,
      requestBodyKeys: Object.keys(requestBody),
      messagesCount: requestBody.messages?.length || 0,
      systemPromptLength: requestBody.messages?.[0]?.content?.length || 0,
      userPromptLength: requestBody.messages?.[1]?.content?.length || 0
    });
    
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    console.log('📥 [health-suggestions] OpenAI response status:', res.status, res.statusText);
    console.log('📥 [health-suggestions] Response headers:', Object.fromEntries(res.headers.entries()));

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      console.error('❌ [health-suggestions] OpenAI error response:', errorText);
      let error: any = {};
      try {
        error = JSON.parse(errorText);
      } catch {
        error = { message: errorText || 'AI request failed' };
      }
      console.error('❌ [health-suggestions] Parsed error:', error);
      return NextResponse.json({ ok: false, error: error?.error?.message || error?.message || 'AI request failed' }, { status: 500 });
    }

    // CRITICAL: Parse JSON properly - use .text() first to avoid issues
    let json: any = {};
    try {
      const responseText = await res.text();
      console.log('📥 [health-suggestions] Raw response text length:', responseText.length);
      console.log('📥 [health-suggestions] Raw response text preview:', responseText.substring(0, 500));
      
      json = JSON.parse(responseText);
    } catch (e) {
      console.error('❌ [health-suggestions] Failed to parse JSON response:', e);
      return NextResponse.json({ ok: false, error: 'Failed to parse OpenAI response' }, { status: 500 });
    }
    
    console.log('📥 [health-suggestions] Parsed JSON response:', {
      hasChoices: !!json?.choices,
      choicesLength: json?.choices?.length || 0,
      hasMessage: !!json?.choices?.[0]?.message,
      hasContent: !!json?.choices?.[0]?.message?.content,
      contentType: typeof json?.choices?.[0]?.message?.content,
      contentValue: json?.choices?.[0]?.message?.content,
      messageKeys: json?.choices?.[0]?.message ? Object.keys(json.choices[0].message) : [],
      fullMessage: json?.choices?.[0]?.message ? JSON.stringify(json.choices[0].message, null, 2) : 'no message',
      fullResponseKeys: Object.keys(json),
      fullResponsePreview: JSON.stringify(json, null, 2).substring(0, 2000)
    });
    
    let content = json?.choices?.[0]?.message?.content || '';
    
    // Check if content is actually empty or if it's in a different field
    if (!content || content.length === 0) {
      console.warn('⚠️ [health-suggestions] Content is empty, checking alternative fields...');
      console.warn('⚠️ [health-suggestions] Full choice structure:', JSON.stringify(json.choices?.[0], null, 2));
      
      // Try alternative content fields
      const altContent = json?.choices?.[0]?.delta?.content || 
                        json?.choices?.[0]?.text || 
                        json?.output_text ||
                        json?.content ||
                        '';
      if (altContent) {
        console.log('✅ [health-suggestions] Found content in alternative field:', altContent.substring(0, 200));
        content = altContent;
      } else {
        console.error('❌ [health-suggestions] No content found in any field!');
        console.error('❌ [health-suggestions] Full response:', JSON.stringify(json, null, 2));
        return NextResponse.json({ ok: false, error: 'OpenAI returned empty response' }, { status: 500 });
      }
    }

    // Always log AI response (even in production) for debugging
    console.log('🤖 [health-suggestions] OpenAI response received');
    console.log('🤖 [health-suggestions] Response length:', content.length);
    console.log('🤖 [health-suggestions] First 500 chars:', content.substring(0, 500));
    if (content.length > 500) {
      console.log('🤖 [health-suggestions] Last 500 chars:', content.substring(content.length - 500));
    }

    // Extract card suggestions from response - more flexible parsing
    const suggestions: Array<{ card: string; reason: string }> = [];
    
    // Split content into lines for easier parsing
    const lines = content.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
    
    for (const line of lines) {
      // Try numbered list format: "1. Card Name - reason" or "1) Card Name - reason"
      const numberedMatch = line.match(/^\d+[\.\)]\s*([A-Z][A-Za-z\s,'-]+(?:,\s*the\s+[A-Za-z\s-]+)?(?:\s+[A-Z][A-Za-z\s-]+)*)(?:\s*[-–—:]\s*(.+))?$/);
      if (numberedMatch && numberedMatch[1]) {
        const cardName = numberedMatch[1].trim();
        const reason = numberedMatch[2]?.trim() || 'Recommended for this deck';
        if (cardName.length > 2 && cardName.length < 100 && !cardName.match(/^(Card|Name|Suggestion)/i)) {
          suggestions.push({ card: cardName, reason });
          if (suggestions.length >= 7) break;
          continue;
        }
      }
      
      // Try bullet points: "- Card Name - reason" or "* Card Name - reason"
      const bulletMatch = line.match(/^[-*•]\s*([A-Z][A-Za-z\s,'-]+(?:,\s*the\s+[A-Za-z\s-]+)?(?:\s+[A-Z][A-Za-z\s-]+)*)(?:\s*[-–—:]\s*(.+))?$/);
      if (bulletMatch && bulletMatch[1]) {
        const cardName = bulletMatch[1].trim();
        const reason = bulletMatch[2]?.trim() || 'Recommended for this deck';
        if (cardName.length > 2 && cardName.length < 100 && !cardName.match(/^(Card|Name|Suggestion)/i)) {
          suggestions.push({ card: cardName, reason });
          if (suggestions.length >= 7) break;
          continue;
        }
      }
      
      // Try simple card name on its own line (if it looks like a card name)
      if (line.match(/^[A-Z][A-Za-z\s,'-]+(?:,\s*the\s+[A-Za-z\s-]+)?(?:\s+[A-Z][A-Za-z\s-]+)*$/) && 
          line.length > 2 && line.length < 100 &&
          !line.match(/^(Card|Name|Suggestion|Here|These|Consider|Try|Add)/i)) {
        suggestions.push({ card: line, reason: 'Recommended for this deck' });
        if (suggestions.length >= 7) break;
      }
    }

    // Always log extraction results (even in production) for debugging
    console.log('📊 [health-suggestions] Extraction complete');
    console.log('📊 [health-suggestions] Extracted suggestions:', suggestions.length);
    console.log('📊 [health-suggestions] Allowed colors:', allowedColors);
    console.log('📊 [health-suggestions] Format:', format);
    
    // Validate suggestions: check color identity and format legality
    const validatedSuggestions: Array<{ card: string; reason: string }> = [];
    const filteredCount = { colorIdentity: 0, format: 0, notFound: 0 };
    
    for (const suggestion of suggestions) {
      try {
        // Fetch card data from Scryfall
        const card = await fetchCard(suggestion.card);
        if (!card) {
          console.warn(`⚠️ [health-suggestions] Card not found: ${suggestion.card}`);
          filteredCount.notFound++;
          continue;
        }
        
        // Check color identity
        const colorCheck = allowedColors.length > 0 ? allowedColors : ['C'];
        if (!isWithinColorIdentity(card, colorCheck)) {
          console.warn(`⚠️ [health-suggestions] Card ${suggestion.card} is off-color. Allowed: ${allowedColors.join(', ')}, Card colors: ${card.color_identity?.join(', ') || 'none'}`);
          filteredCount.colorIdentity++;
          continue;
        }
        
        // Check format legality
        if (!isLegalForFormat(card, format)) {
          console.warn(`⚠️ [health-suggestions] Card ${suggestion.card} is illegal in ${format}`);
          filteredCount.format++;
          continue;
        }
        
        // Card passed all checks
        validatedSuggestions.push(suggestion);
      } catch (e) {
        console.error(`❌ [health-suggestions] Error validating card ${suggestion.card}:`, e);
        // On error, include the card anyway (fail open) but log it
        validatedSuggestions.push(suggestion);
      }
    }
    
    console.log('✅ [health-suggestions] Validation complete:', {
      original: suggestions.length,
      validated: validatedSuggestions.length,
      filtered: {
        colorIdentity: filteredCount.colorIdentity,
        format: filteredCount.format,
        notFound: filteredCount.notFound
      }
    });
    
    if (validatedSuggestions.length === 0 && suggestions.length > 0) {
      console.warn('⚠️ [health-suggestions] All suggestions were filtered out!');
      console.warn('⚠️ [health-suggestions] Original suggestions:', JSON.stringify(suggestions, null, 2));
    }

    console.log('✅ [health-suggestions] Returning response with', validatedSuggestions.length, 'validated suggestions');
    return NextResponse.json({ ok: true, suggestions: validatedSuggestions });
  } catch (e: any) {
    console.error('💥 [health-suggestions] Exception caught:', e);
    console.error('💥 [health-suggestions] Error message:', e?.message);
    console.error('💥 [health-suggestions] Error stack:', e?.stack);
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 500 });
  }
}
