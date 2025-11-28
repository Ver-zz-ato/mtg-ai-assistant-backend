export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { canonicalize } from '@/lib/cards/canonicalize';
import { getPromptVersion } from '@/lib/config/prompts';

export async function POST(req: Request){
  try{
    const body = await req.json().catch(()=>({}));
    const fromRaw = String(body?.from||'');
    const toRaw = String(body?.to||'');
    const deckText = String(body?.deckText||'');
    if (!fromRaw || !toRaw) return NextResponse.json({ ok:false, error:'from/to required' }, { status:400 });
    const from = canonicalize(fromRaw).canonicalName || fromRaw;
    const to = canonicalize(toRaw).canonicalName || toRaw;

    const apiKey = process.env.OPENAI_API_KEY || '';
    if (!apiKey){
      const fallback = `${to} is a cheaper alternative to ${from}: it covers a similar role in your list and supports the same game plan at a lower cost.`;
      return NextResponse.json({ ok:true, text: fallback });
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
      'Focus on role/function overlap and synergy preservation.'
    ].join('\n');
    
    const user = `In 1–2 sentences, explain why replacing "${from}" with "${to}" is a sensible, cheaper swap for this specific deck.\n- Focus on role/function and synergy.\n- Mention the key effect overlap or the game plan it supports.\n- Do NOT ask questions or request more text.\n\nDeck list:\n${deckText}`;

    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type':'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5',
        input: [
          { role:'system', content:[{ type:'input_text', text: system }] },
          { role:'user', content:[{ type:'input_text', text: user }] },
        ],
        max_output_tokens: 80,
        temperature: 0.2,
      }),
    }).catch(()=>null as any);

    const j:any = await r?.json().catch(()=>({}));
    let text = (j?.output_text || '').toString().trim();
    const bad = /tighten|tightened|paste the (?:answer|text)|audience and goal|desired tone|word limit|must-keep/i.test(text||'');
    if (!r || !r.ok || !text || bad) {
      const fallback = `${to} is a cheaper alternative to ${from}: it fills a similar role in your list and supports the same game plan at a lower cost (with minor trade‑offs in speed/flexibility).`;
      return NextResponse.json({ ok:true, text: fallback, provider: (!r || !r.ok || !text)?'fallback':'sanitized' });
    }
    return NextResponse.json({ ok:true, text });
  } catch(e:any){
    return NextResponse.json({ ok:false, error: e?.message || 'server_error' }, { status:500 });
  }
}
