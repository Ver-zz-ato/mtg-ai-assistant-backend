import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/server-supabase';
import { HEALTH_SCAN_FREE, HEALTH_SCAN_PRO } from '@/lib/feature-limits';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
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

    // Analyze current deck composition for context
    let compositionContext = '';
    try {
      const cardNamesLower = (deckCards || []).map((c: any) => c.name.toLowerCase());
      
      // Detect current role counts (simplified heuristics)
      const rampKeywords = ['sol ring', 'arcane signet', 'signet', 'talisman', 'mana crypt', 'mana vault', 'cultivate', 'kodama\'s reach', 'farseek', 'rampant growth', 'three visits', 'nature\'s lore', 'llanowar', 'birds of paradise', 'elvish mystic', 'land tax'];
      const drawKeywords = ['brainstorm', 'ponder', 'preordain', 'rhystic study', 'mystic remora', 'sylvan library', 'phyrexian arena', 'necropotence', 'harmonize', 'read the bones', 'sign in blood', 'divination', 'night\'s whisper', 'impulse', 'fact or fiction'];
      const removalKeywords = ['swords to plowshares', 'path to exile', 'beast within', 'chaos warp', 'counterspell', 'swan song', 'force of will', 'cyclonic rift', 'wrath of god', 'damnation', 'toxic deluge', 'terminate', 'mortify', 'anguished unmaking', 'vindicate', 'assassin\'s trophy'];
      
      let rampCount = 0;
      let drawCount = 0;
      let removalCount = 0;
      let landCount = 0;
      
      for (const name of cardNamesLower) {
        if (rampKeywords.some(k => name.includes(k))) rampCount++;
        if (drawKeywords.some(k => name.includes(k))) drawCount++;
        if (removalKeywords.some(k => name.includes(k))) removalCount++;
        if (name.includes('land') || name.includes('forest') || name.includes('island') || name.includes('swamp') || name.includes('mountain') || name.includes('plains') || name.includes('command tower') || name.includes('shock') || name.includes('fetch')) landCount++;
      }
      
      // Add basic land count from deck_text pattern matching
      const deckText = String(deck.deck_text || '');
      const basicLandMatch = deckText.match(/\d+x?\s*(basic\s+)?(forest|island|swamp|mountain|plains)/gi);
      if (basicLandMatch) landCount += basicLandMatch.length;
      
      compositionContext = `\n\n**DECK COMPOSITION ANALYSIS**:
- Current ramp sources: ~${rampCount} cards
- Current draw sources: ~${drawCount} cards  
- Current removal/interaction: ~${removalCount} cards
- Approximate land count: ~${landCount} lands

Use this context to make targeted suggestions that fill gaps. For example, if ramp count is low (<8), prioritize ramp suggestions. If removal is lacking (<8), prioritize interaction.`;
      
      console.log('📊 [health-suggestions] Deck composition:', { rampCount, drawCount, removalCount, landCount });
    } catch (compErr) {
      console.warn('[health-suggestions] Could not analyze deck composition:', compErr);
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

    // Get commander's color identity for the prompt
    let colorIdentityHint = '';
    if (commander && (format.toLowerCase().includes('commander') || format.toLowerCase().includes('edh'))) {
      try {
        const { getDetailsForNamesCached } = await import('@/lib/server/scryfallCache');
        const commanderDetails = await getDetailsForNamesCached([commander]);
        const commanderEntry = commanderDetails.get(commander.toLowerCase()) || 
          Array.from(commanderDetails.values())[0];
        const allowedColors = (commanderEntry?.color_identity || []).map((c: string) => c.toUpperCase());
        if (allowedColors.length > 0) {
          const colorNames: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
          const colorNamesStr = allowedColors.map((c: string) => colorNames[c] || c).join(', ');
          colorIdentityHint = `\n\n**CRITICAL - COLOR IDENTITY**: This is a Commander deck. The commander ${commander} has color identity: ${allowedColors.join('')} (${colorNamesStr}). You MUST ONLY suggest cards within this color identity. Do NOT suggest any cards that contain mana symbols outside of ${allowedColors.join(', ')}.`;
        }
      } catch (e) {
        console.warn('[health-suggestions] Could not fetch commander color identity for prompt:', e);
      }
    }

    // Minimal system prompt - deck_analysis prompt is 4k+ tokens and overkill for "suggest 5-7 cards"
    const systemPrompt = `You are ManaTap AI, an expert Magic: The Gathering assistant.

Provide specific card suggestions to improve the deck's health in the requested category.
Format your response as a numbered list with card names and brief explanations.
Example:
1. Lightning Greaves - Provides haste and protection for key creatures
2. Sol Ring - Essential mana acceleration

Focus on cards that are: legal in the deck's format, match the deck's color identity, fill the specific role requested, and are commonly played. Do not suggest cards already in the decklist.
Output ONLY the numbered list, no preamble.${colorIdentityHint}${compositionContext}`;

    // Use gpt-4o-mini for cost efficiency - card suggestions don't need flagship model (~$0.70/call → ~$0.05/call)
    const model = process.env.MODEL_DECK_SCAN || 'gpt-4o-mini';
    const fallbackModel = 'gpt-4o-mini';

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
          model,
          fallbackModel,
          timeout: 60000,
          maxTokens: 600,
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

      // Extract card suggestions from response - flexible parsing for various AI output formats
      const suggestions: Array<{ card: string; reason: string }> = [];
      const SKIP_PREFIXES = /^(Card|Name|Suggestion|Here|These|Consider|Try|Add|I suggest|I recommend)/i;
      
      const lines = content.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
      
      for (const line of lines) {
        let cardName = '';
        let reason = 'Recommended for this deck';
        
        // 1. Numbered: "1. Card Name - reason" or "1) Card Name: reason"
        const numMatch = line.match(/^\d+[\.\)]\s*(.+)$/);
        if (numMatch) {
          const rest = numMatch[1];
          const dashIdx = rest.search(/\s[-–—:]\s/);
          if (dashIdx >= 0) {
            cardName = rest.slice(0, dashIdx).replace(/\*\*/g, '').trim();
            reason = rest.slice(dashIdx + 3).trim();
          } else {
            cardName = rest.replace(/\*\*/g, '').trim();
          }
        }
        // 2. Bullet: "- Card Name - reason" or "* Card Name: reason"
        else if (/^[-*•]\s+/.test(line)) {
          const rest = line.replace(/^[-*•]\s+/, '');
          const dashIdx = rest.search(/\s[-–—:]\s/);
          if (dashIdx >= 0) {
            cardName = rest.slice(0, dashIdx).replace(/\*\*/g, '').trim();
            reason = rest.slice(dashIdx + 3).trim();
          } else {
            cardName = rest.replace(/\*\*/g, '').trim();
          }
        }
        // 3. Bold markdown: "**Card Name** - reason"
        else if (line.includes('**')) {
          const boldMatch = line.match(/\*\*([^*]+)\*\*(?:\s*[-–—:]\s*(.+))?/);
          if (boldMatch) {
            cardName = boldMatch[1].trim();
            reason = boldMatch[2]?.trim() || reason;
          }
        }
        // 4. Plain "Card Name - reason" (line starts with capital, has dash)
        else if (/^[A-Z]/.test(line)) {
          const dashIdx = line.search(/\s[-–—:]\s/);
          if (dashIdx >= 0) {
            cardName = line.slice(0, dashIdx).replace(/\*\*/g, '').trim();
            reason = line.slice(dashIdx + 3).trim();
          } else {
            cardName = line.replace(/\*\*/g, '').trim();
          }
        }
        
        if (cardName && cardName.length >= 2 && cardName.length < 100 && !SKIP_PREFIXES.test(cardName)) {
          suggestions.push({ card: cardName, reason });
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

      // COLOR IDENTITY VALIDATION: Filter out off-color cards for Commander format
      let validatedSuggestions = suggestions;
      const isCommanderFormat = format.toLowerCase().includes('commander') || format.toLowerCase().includes('edh');
      
      if (isCommanderFormat && commander && suggestions.length > 0) {
        try {
          const { getDetailsForNamesCached } = await import('@/lib/server/scryfallCache');
          const { isWithinColorIdentity } = await import('@/lib/deck/mtgValidators');
          
          // Get commander's color identity
          const commanderDetails = await getDetailsForNamesCached([commander]);
          const commanderEntry = commanderDetails.get(commander.toLowerCase()) || 
            Array.from(commanderDetails.values())[0];
          const allowedColors = (commanderEntry?.color_identity || []).map((c: string) => c.toUpperCase());
          
          if (allowedColors.length > 0) {
            console.log('🎨 [health-suggestions] Commander color identity:', allowedColors.join(','));
            
            // Fetch color identity for all suggested cards
            const cardNames = suggestions.map(s => s.card);
            const cardDetails = await getDetailsForNamesCached(cardNames);
            
            // Filter out off-color suggestions
            const beforeCount = suggestions.length;
            validatedSuggestions = suggestions.filter(s => {
              const cardKey = s.card.toLowerCase();
              const cardEntry = cardDetails.get(cardKey) || 
                Array.from(cardDetails.entries()).find(([k]) => k.toLowerCase() === cardKey)?.[1];
              
              if (!cardEntry) {
                // Card not found in cache - keep it (might be valid)
                console.warn(`⚠️ [health-suggestions] Card not in cache: ${s.card}`);
                return true;
              }
              
              const cardColors = cardEntry.color_identity || [];
              const isValid = isWithinColorIdentity({ color_identity: cardColors } as any, allowedColors);
              
              if (!isValid) {
                console.log(`🚫 [health-suggestions] Filtered off-color card: ${s.card} (${cardColors.join(',')}) not in ${allowedColors.join(',')}`);
              }
              
              return isValid;
            });
            
            const removedCount = beforeCount - validatedSuggestions.length;
            if (removedCount > 0) {
              console.log(`🎨 [health-suggestions] Removed ${removedCount} off-color suggestions`);
            }
          } else {
            console.warn('⚠️ [health-suggestions] Could not determine commander color identity');
          }
        } catch (colorErr) {
          console.error('❌ [health-suggestions] Color identity validation error:', colorErr);
          // Continue with unfiltered suggestions on error
        }
      }

      console.log('✅ [health-suggestions] Returning response with', validatedSuggestions.length, 'suggestions');
      return NextResponse.json({ ok: true, suggestions: validatedSuggestions });
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
