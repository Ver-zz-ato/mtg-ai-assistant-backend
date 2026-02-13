export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/server-supabase';
import { canonicalize } from '@/lib/cards/canonicalize';
import { SUGGESTION_WHY_GUEST, SUGGESTION_WHY_FREE, SUGGESTION_WHY_PRO } from '@/lib/feature-limits';

/** Hard-set cheap model for suggestion-why (do not inherit Pro). */
const SUGGESTION_WHY_MODEL = 'gpt-4o-mini';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const cardRaw = String(body?.card || '');
    const deckText = String(body?.deckText || '');
    const commander = String(body?.commander || '');
    const existingReason = String(body?.reason || '');

    if (!cardRaw) {
      return NextResponse.json({ ok: false, error: 'card required' }, { status: 400 });
    }

    const card = canonicalize(cardRaw).canonicalName || cardRaw;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Rate-limit as if public: every caller gets a durable limit (user id or anonymous key).
    const { checkDurableRateLimit } = await import('@/lib/api/durable-rate-limit');
    const { hashString } = await import('@/lib/guest-tracking');

    let keyHash: string;
    let dailyCap: number;

    if (user?.id) {
      const { checkProStatus } = await import('@/lib/server-pro-check');
      const isPro = await checkProStatus(user.id);
      keyHash = `user:${await hashString(user.id)}`;
      dailyCap = isPro ? SUGGESTION_WHY_PRO : SUGGESTION_WHY_FREE;
    } else {
      const forwarded = req.headers.get('x-forwarded-for');
      const ip = forwarded ? forwarded.split(',')[0].trim() : req.headers.get('x-real-ip') || 'unknown';
      const ua = req.headers.get('user-agent') || 'unknown';
      keyHash = `guest:${await hashString(`suggestion-why:${ip}:${ua}`)}`;
      dailyCap = SUGGESTION_WHY_GUEST;
    }

    const rateLimit = await checkDurableRateLimit(supabase, keyHash, '/api/deck/suggestion-why', dailyCap, 1);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: "Daily limit reached. Try again tomorrow.", code: 'RATE_LIMIT_DAILY' },
        { status: 429 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY || '';
    if (!apiKey) {
      const fallback = existingReason || `${card} is recommended for this deck because it fills a missing role (ramp/draw/removal) or synergizes with your commander.`;
      return NextResponse.json({ ok: true, text: fallback });
    }

    const system = `You are ManaTap AI, an expert Magic: The Gathering assistant.

Explain why this card is recommended for this specific deck in 1-2 bullet points.
Cover: missing role (draw/ramp/removal/lands), synergy with commander, curve smoothing, or meta pressure.
Be concise and specific. Use bullet points if multiple reasons apply.`;

    const commanderContext = commander ? `\nCommander: ${commander}` : '';
    const userText = `Explain why "${card}" is recommended for this specific deck in 1-2 short bullet points. Cover: missing role (draw/ramp/removal), synergy with commander, curve smoothing, or meta pressure. Be specific and concrete.\n\nDeck list:\n${deckText}${commanderContext}`;

    const messages = [
      { role: 'system', content: [{ type: 'input_text', text: system }] },
      { role: 'user', content: [{ type: 'input_text', text: userText }] },
    ];

    try {
      const { callLLM } = await import('@/lib/ai/unified-llm-client');
      const response = await callLLM(messages as any, {
        route: '/api/deck/suggestion-why',
        feature: 'suggestion_why',
        model: SUGGESTION_WHY_MODEL,
        fallbackModel: SUGGESTION_WHY_MODEL,
        maxTokens: 120,
        apiType: 'responses',
        userId: user?.id ?? null,
        isPro: false,
      });

      let text = (response.text || '').trim();
      const bad = /tighten|tightened|paste the (?:answer|text)|audience and goal|desired tone|word limit|must-keep/i.test(text || '');
      if (!text || bad) {
        const fallback = existingReason || `${card} is recommended because it fills a missing role in your deck (ramp/draw/removal) or synergizes well with your commander's strategy.`;
        return NextResponse.json({ ok: true, text: fallback, provider: !text ? 'fallback' : 'sanitized' });
      }
      return NextResponse.json({ ok: true, text });
    } catch (err) {
      const fallback = existingReason || `${card} is recommended because it fills a missing role in your deck (ramp/draw/removal) or synergizes well with your commander's strategy.`;
      return NextResponse.json({ ok: true, text: fallback, provider: 'fallback' });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'server_error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
