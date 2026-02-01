export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { canonicalize } from '@/lib/cards/canonicalize';
import { getPromptVersion } from '@/lib/config/prompts';
import { prepareOpenAIBody } from '@/lib/ai/openai-params';
import { getModelForTier } from '@/lib/ai/model-by-tier';
import { createClient } from '@/lib/server-supabase';
import { checkDurableRateLimit } from '@/lib/api/durable-rate-limit';
import { checkProStatus } from '@/lib/server-pro-check';
import { hashString, hashGuestToken } from '@/lib/guest-tracking';
import { GUEST_DAILY_FEATURE_LIMIT, SWAP_WHY_FREE, SWAP_WHY_PRO } from '@/lib/feature-limits';

export async function POST(req: NextRequest){
  try{
    const body = await req.json().catch(()=>({}));
    const fromRaw = String(body?.from||'');
    const toRaw = String(body?.to||'');
    const deckText = String(body?.deckText||'');
    if (!fromRaw || !toRaw) return NextResponse.json({ ok:false, error:'from/to required' }, { status:400 });
    const from = canonicalize(fromRaw).canonicalName || fromRaw;
    const to = canonicalize(toRaw).canonicalName || toRaw;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const isPro = await checkProStatus(user.id);
      const dailyLimit = isPro ? SWAP_WHY_PRO : SWAP_WHY_FREE;
      const userKeyHash = `user:${await hashString(user.id)}`;
      const rateLimit = await checkDurableRateLimit(supabase, userKeyHash, '/api/deck/swap-why', dailyLimit, 1);
      if (!rateLimit.allowed) {
        return NextResponse.json({
          ok: false,
          code: 'RATE_LIMIT_DAILY',
          error: isPro
            ? "You've reached your daily limit. Contact support if you need higher limits."
            : `You've used your ${SWAP_WHY_FREE} free swap explanations today. Upgrade to Pro for more!`,
          resetAt: rateLimit.resetAt
        }, { status: 429 });
      }
    } else {
      const { cookies } = await import('next/headers');
      const cookieStore = await cookies();
      const guestToken = cookieStore.get('guest_session_token')?.value;
      const keyHash = guestToken
        ? `guest:${await hashGuestToken(guestToken)}`
        : `ip:${await hashString((req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown')}`;
      const rateLimit = await checkDurableRateLimit(supabase, keyHash, '/api/deck/swap-why', GUEST_DAILY_FEATURE_LIMIT, 1);
      if (!rateLimit.allowed) {
        return NextResponse.json({
          ok: false,
          code: 'RATE_LIMIT_DAILY',
          error: `You've used your ${GUEST_DAILY_FEATURE_LIMIT} free swap explanations today. Sign in for more!`,
          resetAt: rateLimit.resetAt
        }, { status: 429 });
      }
    }

    // Load the deck_analysis prompt as the base, then add swap explanation instructions
    let basePrompt = 'You are ManaTap AI, an expert Magic: The Gathering assistant.';
    try {
      const promptVersion = await getPromptVersion('deck_analysis');
      if (promptVersion) {
        basePrompt = promptVersion.system_prompt;
      }
    } catch (e) {
      console.warn('[swap-why] Failed to load prompt version:', e);
    }
    
    const system = [
      basePrompt,
      '',
      '=== BUDGET SWAP EXPLANATION MODE ===',
      'Explain clearly and concisely why a cheaper swap preserves deck function.',
      'Focus on role/function overlap and synergy preservation. When explaining synergy, name both enabler and payoff cards and describe the mechanical sequence.'
    ].join('\n');
    
    const userPrompt = `In 1–2 sentences, explain why replacing "${from}" with "${to}" is a sensible, cheaper swap for this specific deck.\n- Focus on role/function and synergy.\n- If synergy is involved, name the enabler and payoff cards and explain the sequence (e.g., "Card A enables X; Card B pays off with Y").\n- Mention the key effect overlap or the game plan it supports.\n- Do NOT ask questions or request more text.\n\nDeck list:\n${deckText}`;

    try {
      const { callLLM } = await import('@/lib/ai/unified-llm-client');
      
      const currentUser = user;
      const isPro = currentUser ? await checkProStatus(currentUser.id) : false;
      const tierRes = getModelForTier({ isGuest: !currentUser, userId: currentUser?.id ?? null, isPro });
      
      const response = await callLLM(
        [
          { role: 'system', content: [{ type: 'input_text', text: system }] },
          { role: 'user', content: [{ type: 'input_text', text: userPrompt }] },
        ],
        {
          route: '/api/deck/swap-why',
          feature: 'swap_why',
          model: tierRes.model,
          fallbackModel: tierRes.fallbackModel,
          timeout: 300000,
          maxTokens: 80,
          apiType: 'responses',
          userId: currentUser?.id || null,
          isPro,
        }
      );

      let text = response.text.trim();
      const bad = /tighten|tightened|paste the (?:answer|text)|audience and goal|desired tone|word limit|must-keep/i.test(text || '');
      
      if (!text || bad) {
        const fallback = `${to} is a cheaper alternative to ${from}: it fills a similar role in your list and supports the same game plan at a lower cost (with minor trade‑offs in speed/flexibility).`;
        return NextResponse.json({ ok: true, text: fallback, provider: 'sanitized' });
      }
      
      return NextResponse.json({ ok: true, text, fallback: response.fallback });
    } catch (e: any) {
      // Fallback on error
      const fallback = `${to} is a cheaper alternative to ${from}: it covers a similar role in your list and supports the same game plan at a lower cost.`;
      return NextResponse.json({ ok: true, text: fallback, provider: 'fallback' });
    }
  } catch(e:any){
    return NextResponse.json({ ok:false, error: e?.message || 'server_error' }, { status:500 });
  }
}
