export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getUserAndSupabase } from '@/lib/api/get-user-from-request';
import { canonicalize } from '@/lib/cards/canonicalize';
import { SUGGESTION_WHY_GUEST, SUGGESTION_WHY_FREE, SUGGESTION_WHY_PRO } from '@/lib/feature-limits';
import { DEFAULT_FALLBACK_MODEL } from '@/lib/ai/default-models';
import {
  formatKeyToDisplayTitle,
  isCommanderFormatKey,
  normalizeManatapDeckFormatKey,
  type ManatapDeckFormatKey,
} from '@/lib/format/manatap-deck-format';

/** Hard-set cheap model for suggestion-why (do not inherit Pro). */
const SUGGESTION_WHY_MODEL = DEFAULT_FALLBACK_MODEL;

function buildFallbackReason(card: string, existingReason: string, formatKey: ManatapDeckFormatKey, commander: string): string {
  if (existingReason.trim()) return existingReason.trim();
  if (isCommanderFormatKey(formatKey) && commander.trim()) {
    return `${card} is recommended because it fills a missing role in your deck (ramp/draw/removal) or supports ${commander.trim()}'s game plan.`;
  }
  const fmtTitle = formatKeyToDisplayTitle(formatKey);
  return `${card} is recommended because it fills a useful ${fmtTitle} role in your list, improves curve or interaction, or pressures the metagame in a way your current build needs.`;
}

function buildSuggestionWhyPrompts(args: {
  card: string;
  deckText: string;
  commander: string;
  formatKey: ManatapDeckFormatKey;
}): { system: string; user: string } {
  const { card, deckText, commander, formatKey } = args;
  const fmtTitle = formatKeyToDisplayTitle(formatKey);
  const isCommander = isCommanderFormatKey(formatKey);
  const commanderName = commander.trim();

  const system = isCommander
    ? `You are ManaTap AI, an expert Magic: The Gathering Commander assistant.

Explain why one suggested card fits this specific Commander deck in 1-2 short bullet points.
Cover missing role (draw/ramp/removal/lands), commander synergy when a commander is known, curve smoothing, resilience, or table pressure.
Only mention commander synergy if it is supported by the supplied commander or decklist.
Be concise, concrete, and actionable.`
    : `You are ManaTap AI, an expert Magic: The Gathering ${fmtTitle} assistant.

Explain why one suggested card fits this specific ${fmtTitle} list in 1-2 short bullet points.
Cover missing role (draw/ramp/removal/lands), curve smoothing, interaction, sideboard/meta pressure, or how it improves the deck's main plan.
Do not describe the deck as Commander, EDH, singleton, or commander-based unless that word appears on a card name in the list.
Be concise, concrete, and actionable.`;

  const commanderContext = isCommander && commanderName ? `\nCommander: ${commanderName}` : '';
  const user = `Explain why "${card}" is recommended for this ${fmtTitle} deck in 1-2 short bullet points.
- Be specific about role/function, curve, synergy, or meta pressure.
- Do not ask questions or request more deck text.

Deck list:
${deckText}${commanderContext}`;

  return { system, user };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const cardRaw = String(body?.card || '');
    const deckText = String(body?.deckText || '');
    const commander = String(body?.commander || '');
    const existingReason = String(body?.reason || '');
    const formatKey = normalizeManatapDeckFormatKey(body?.format ?? body?.deckFormat);

    if (!cardRaw) {
      return NextResponse.json({ ok: false, error: 'card required' }, { status: 400 });
    }

    const card = canonicalize(cardRaw).canonicalName || cardRaw;

    const { supabase, user } = await getUserAndSupabase(req);

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
      const fallback = buildFallbackReason(card, existingReason, formatKey, commander);
      return NextResponse.json({ ok: true, text: fallback });
    }

    const { system, user: userText } = buildSuggestionWhyPrompts({ card, deckText, commander, formatKey });

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
        maxTokens: 1024,
        apiType: 'responses',
        userId: user?.id ?? null,
        isPro: false,
      });

      let text = (response.text || '').trim();
      const bad = /tighten|tightened|paste the (?:answer|text)|audience and goal|desired tone|word limit|must-keep/i.test(text || '');
      if (!text || bad) {
        const fallback = buildFallbackReason(card, existingReason, formatKey, commander);
        return NextResponse.json({ ok: true, text: fallback, provider: !text ? 'fallback' : 'sanitized' });
      }
      return NextResponse.json({ ok: true, text });
    } catch (err) {
      const fallback = buildFallbackReason(card, existingReason, formatKey, commander);
      return NextResponse.json({ ok: true, text: fallback, provider: 'fallback' });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'server_error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
