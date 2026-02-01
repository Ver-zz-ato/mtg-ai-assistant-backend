export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { canonicalize } from '@/lib/cards/canonicalize';
import { getPromptVersion } from '@/lib/config/prompts';

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

    const apiKey = process.env.OPENAI_API_KEY || '';
    if (!apiKey) {
      // Fallback explanation based on existing reason
      const fallback = existingReason || `${card} is recommended for this deck because it fills a missing role (ramp/draw/removal) or synergizes with your commander.`;
      return NextResponse.json({ ok: true, text: fallback });
    }

    // Load the deck_analysis prompt as the base
    let basePrompt = 'You are ManaTap AI, an expert Magic: The Gathering assistant.';
    try {
      const promptVersion = await getPromptVersion('deck_analysis');
      if (promptVersion) {
        basePrompt = promptVersion.system_prompt;
      }
    } catch (e) {
      console.warn('[suggestion-why] Failed to load prompt version:', e);
    }
    
    const system = [
      basePrompt,
      '',
      '=== SUGGESTION EXPLANATION MODE ===',
      'Explain why this card is recommended for this specific deck.',
      'Provide 1-2 bullet points covering:',
      '- Missing role (draw/ramp/removal/lands)',
      '- Synergy with commander',
      '- Curve smoothing',
      '- Meta pressure',
      'Be concise and specific. Use bullet points if multiple reasons apply.',
    ].join('\n');
    
    const commanderContext = commander ? `\nCommander: ${commander}` : '';
    const user = `Explain why "${card}" is recommended for this specific deck in 1-2 short bullet points. Cover: missing role (draw/ramp/removal), synergy with commander, curve smoothing, or meta pressure. Be specific and concrete.\n\nDeck list:\n${deckText}${commanderContext}`;

    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5.2-codex',
        input: [
          { role: 'system', content: [{ type: 'input_text', text: system }] },
          { role: 'user', content: [{ type: 'input_text', text: user }] },
        ],
        max_output_tokens: 120,
      }),
    }).catch(() => null as any);

    const j: any = await r?.json().catch(() => ({}));
    let text = (j?.output_text || '').toString().trim();
    
    // Sanitize bad responses
    const bad = /tighten|tightened|paste the (?:answer|text)|audience and goal|desired tone|word limit|must-keep/i.test(text || '');
    if (!r || !r.ok || !text || bad) {
      const fallback = existingReason || `${card} is recommended because it fills a missing role in your deck (ramp/draw/removal) or synergizes well with your commander's strategy.`;
      return NextResponse.json({ ok: true, text: fallback, provider: (!r || !r.ok || !text) ? 'fallback' : 'sanitized' });
    }
    
    return NextResponse.json({ ok: true, text });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}
