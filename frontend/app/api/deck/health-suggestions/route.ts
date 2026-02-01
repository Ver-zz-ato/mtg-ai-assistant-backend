import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/server-supabase';
import { getPromptVersion } from '@/lib/config/prompts';
import { prepareOpenAIBody } from '@/lib/ai/openai-params';
import { getModelForTier } from '@/lib/ai/model-by-tier';
import { HEALTH_SCAN_FREE, HEALTH_SCAN_PRO } from '@/lib/feature-limits';

export const runtime = 'nodejs';

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

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

    const { checkProStatus } = await import('@/lib/server-pro-check');
    const isPro = await checkProStatus(user.id);
    const dailyCap = isPro ? HEALTH_SCAN_PRO : HEALTH_SCAN_FREE;

    const { checkDurableRateLimit } = await import('@/lib/api/durable-rate-limit');
    const { hashString } = await import('@/lib/guest-tracking');
    const userKeyHash = `user:${await hashString(user.id)}`;
    const rateLimit = await checkDurableRateLimit(supabase, userKeyHash, '/api/deck/health-suggestions', dailyCap, 1);

    if (!rateLimit.allowed) {
      return NextResponse.json({
        ok: false,
        code: 'RATE_LIMIT_DAILY',
        proUpsell: !isPro,
        error: isPro
          ? "You've reached your daily limit. Contact support if you need higher limits."
          : `You've used your ${HEALTH_SCAN_FREE} free AI Deck Scans today. Upgrade to Pro for more!`,
        resetAt: rateLimit.resetAt,
      }, { status: 429 });
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

    const tierRes = getModelForTier({ isGuest: false, userId: user.id, isPro });

    // Call OpenAI using unified wrapper
    try {
      const { callLLM } = await import('@/lib/ai/unified-llm-client');
      
      const response = await callLLM(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: fullPrompt }
        ],
        {
          route: '/api/deck/health-suggestions',
          feature: 'deck_scan',
          model: tierRes.model,
          fallbackModel: tierRes.fallbackModel,
          timeout: 300000,
          maxTokens: undefined,
          apiType: 'chat',
          userId: user.id,
          isPro,
        }
      );

      const content = response.text;

      // Always log AI response (even in production) for debugging
      console.log('🤖 [health-suggestions] OpenAI response received');
      console.log('🤖 [health-suggestions] Response length:', content.length);
      console.log('🤖 [health-suggestions] Fallback used:', response.fallback);
      if (content.length > 500) {
        console.log('🤖 [health-suggestions] First 500 chars:', content.substring(0, 500));
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
      console.log('📊 [health-suggestions] Suggestions:', JSON.stringify(suggestions, null, 2));
      console.log('📊 [health-suggestions] All lines checked:', lines.length);
      
      if (suggestions.length === 0) {
        console.warn('⚠️ [health-suggestions] No suggestions extracted!');
        console.warn('⚠️ [health-suggestions] Sample lines:', lines.slice(0, 20));
        console.warn('⚠️ [health-suggestions] Full content for debugging:', content);
      }

      console.log('✅ [health-suggestions] Returning response with', suggestions.length, 'suggestions');
      return NextResponse.json({ ok: true, suggestions });
    } catch (e: any) {
      console.error('💥 [health-suggestions] OpenAI call failed:', e);
      console.error('💥 [health-suggestions] Error details:', {
        message: e?.message,
        name: e?.name,
        stack: e?.stack,
        cause: e?.cause
      });
      
      // Provide more specific error messages
      let errorMessage = e?.message || 'AI service error';
      if (errorMessage.includes('busy') || errorMessage.includes('timeout')) {
        errorMessage = 'The AI service is currently busy or timed out. Please try again in a moment.';
      } else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        errorMessage = 'Rate limit exceeded. Please try again later.';
      } else if (errorMessage.includes('401') || errorMessage.includes('403')) {
        errorMessage = 'Authentication error. Please refresh the page and try again.';
      }
      
      return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
    }
  } catch (e: any) {
    console.error('💥 [health-suggestions] Exception caught:', e);
    console.error('💥 [health-suggestions] Error message:', e?.message);
    console.error('💥 [health-suggestions] Error stack:', e?.stack);
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 500 });
  }
}
