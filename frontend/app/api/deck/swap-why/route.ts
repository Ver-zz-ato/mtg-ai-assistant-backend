export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { canonicalize } from '@/lib/cards/canonicalize';
import { getUserAndSupabase } from '@/lib/api/get-user-from-request';
import { checkDurableRateLimit } from '@/lib/api/durable-rate-limit';
import { checkProStatus } from '@/lib/server-pro-check';
import { hashString, hashGuestToken } from '@/lib/guest-tracking';
import { GUEST_DAILY_FEATURE_LIMIT, SWAP_WHY_FREE, SWAP_WHY_PRO } from '@/lib/feature-limits';
import { DEFAULT_FALLBACK_MODEL } from '@/lib/ai/default-models';
import {
  annotateOwnership,
  appendOwnershipToReason,
  buildOwnershipContextForUserDeck,
  formatOwnershipContextForPrompt,
} from '@/lib/collections/ownership-context';
import {
  formatKeyToDisplayTitle,
  isCommanderFormatKey,
  normalizeManatapDeckFormatKey,
  type ManatapDeckFormatKey,
} from '@/lib/format/manatap-deck-format';

function buildSwapWhyPrompts(args: {
  from: string;
  to: string;
  deckText: string;
  formatKey: ManatapDeckFormatKey;
  commander: string | null;
  ownershipNote?: string;
}): { system: string; user: string } {
  const { from, to, deckText, formatKey, commander, ownershipNote } = args;
  const fmtTitle = formatKeyToDisplayTitle(formatKey);
  const cmd = commander?.trim() || null;

  if (isCommanderFormatKey(formatKey)) {
    const system = `You are ManaTap AI, an expert Magic: The Gathering assistant.

Explain clearly and concisely why a cheaper swap preserves deck function in **Commander (singleton, 100-card)**.
Focus on role/function overlap and synergy preservation. When explaining synergy, name both enabler and payoff cards and describe the mechanical sequence.
${
  cmd
    ? `The deck's commander is "${cmd}". You may reference color identity or commander synergy only when clearly supported by cards named in the list — do not invent bans or legality claims beyond what the list suggests.`
    : 'Do not assume a specific commander if the list does not name one.'
}`;

    const userPrompt = `In 1–2 sentences, explain why replacing "${from}" with "${to}" is a sensible, cheaper swap for this **Commander** deck.
- Focus on role/function and synergy.
- If synergy is involved, name the enabler and payoff cards and explain the sequence.
- Do NOT ask questions or request more text.

Deck list:
${deckText}${ownershipNote ? `\n\n${ownershipNote}` : ''}`;

    return { system, user: userPrompt };
  }

  const system = `You are ManaTap AI, an expert Magic: The Gathering assistant.

Explain clearly and concisely why a cheaper swap preserves deck function for **${fmtTitle}** (60-card constructed context).
Focus on role/function overlap, curve, and interaction. Do **not** describe the deck as a Commander singleton list, do not mention "commander" unless that word appears on a **card** in the list, and do not claim a card is legal or banned unless you are certain from context — otherwise stay neutral and suggest verifying in a deckbuilder.`;

  const userPrompt = `In 1–2 sentences, explain why replacing "${from}" with "${to}" is a sensible, cheaper swap for this **${fmtTitle}** list.
- Focus on role/function, curve, and how the replacement supports the same game plan at lower cost.
- Do NOT ask questions or request more text.

Deck list:
${deckText}${ownershipNote ? `\n\n${ownershipNote}` : ''}`;

  return { system, user: userPrompt };
}

export async function POST(req: NextRequest){
  try{
    const body = await req.json().catch(()=>({}));
    const { resolveAiUsageSourceForRequest } = await import("@/lib/ai/manatap-client-origin");
    const usageSource = resolveAiUsageSourceForRequest(req, body, null);
    const sourcePage =
      (typeof body.sourcePage === "string" ? body.sourcePage : typeof body.source_page === "string" ? body.source_page : null)?.trim() || null;
    const fromRaw = String(body?.from||'');
    const toRaw = String(body?.to||'');
    const deckText = String(body?.deckText||'');
    if (!fromRaw || !toRaw) return NextResponse.json({ ok:false, error:'from/to required' }, { status:400 });
    const from = canonicalize(fromRaw).canonicalName || fromRaw;
    const to = canonicalize(toRaw).canonicalName || toRaw;

    // Optional format + commander (additive). Missing format defaults to Commander for existing website/mobile callers.
    const formatKey = normalizeManatapDeckFormatKey(body?.format ?? body?.deckFormat);
    const commanderRaw =
      typeof body?.commander === 'string'
        ? body.commander
        : typeof body?.commanderName === 'string'
          ? body.commanderName
          : null;
    const commanderForPrompt = commanderRaw?.trim() ? commanderRaw.trim() : null;

    const { supabase, user } = await getUserAndSupabase(req);
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

    const ownershipContext = await buildOwnershipContextForUserDeck({
      supabase,
      userId: user?.id,
      deckCards: [
        { name: from, qty: 1 },
        { name: to, qty: 1 },
      ],
      sampleLimit: 8,
    });
    const toOwnership = annotateOwnership(ownershipContext, to);
    const fromOwnership = annotateOwnership(ownershipContext, from);
    const ownershipPrompt = formatOwnershipContextForPrompt(ownershipContext);
    const ownershipNote = ownershipPrompt
      ? [
          ownershipPrompt,
          `Swap ownership: "${from}" is ${fromOwnership.ownership}; "${to}" is ${toOwnership.ownership}${toOwnership.ownedQty ? ` (owned quantity ${toOwnership.ownedQty})` : ''}.`,
          'Mention the replacement ownership briefly when relevant; do not claim ownership without this context.',
        ].join('\n')
      : '';

    const { system, user: userPrompt } = buildSwapWhyPrompts({
      from,
      to,
      deckText,
      formatKey,
      commander: commanderForPrompt,
      ownershipNote,
    });

    try {
      const { callLLM } = await import('@/lib/ai/unified-llm-client');
      const model = process.env.MODEL_SWAP_WHY || DEFAULT_FALLBACK_MODEL;
      let anonId: string | null = null;
      if (user?.id) anonId = await hashString(user.id);
      else {
        const { cookies } = await import('next/headers');
        const guestToken = (await cookies()).get('guest_session_token')?.value;
        if (guestToken) anonId = await hashGuestToken(guestToken);
      }

      const response = await callLLM(
        [
          { role: 'system', content: [{ type: 'input_text', text: system }] },
          { role: 'user', content: [{ type: 'input_text', text: userPrompt }] },
        ],
        {
          route: '/api/deck/swap-why',
          feature: 'swap_why',
          model,
          fallbackModel: DEFAULT_FALLBACK_MODEL,
          timeout: 60000,
          maxTokens: 1024,
          apiType: 'responses',
          userId: user?.id || null,
          isPro: user ? await checkProStatus(user.id) : false,
          anonId,
          source_page: sourcePage,
          source: usageSource ?? null,
        }
      );

      let text = appendOwnershipToReason(response.text.trim(), toOwnership);
      const bad = /tighten|tightened|paste the (?:answer|text)|audience and goal|desired tone|word limit|must-keep/i.test(text || '');
      
      if (!text || bad) {
        const fallback = `${to} is a cheaper alternative to ${from}: it fills a similar role in your list and supports the same game plan at a lower cost (with minor trade‑offs in speed/flexibility).`;
        return NextResponse.json({
          ok: true,
          text: appendOwnershipToReason(fallback, toOwnership),
          provider: 'sanitized',
          ownership: toOwnership.ownership,
          ownedQty: toOwnership.ownedQty,
        });
      }
      
      return NextResponse.json({ ok: true, text, fallback: response.fallback, ownership: toOwnership.ownership, ownedQty: toOwnership.ownedQty });
    } catch (e: any) {
      // Fallback on error
      const fallback = `${to} is a cheaper alternative to ${from}: it covers a similar role in your list and supports the same game plan at a lower cost.`;
      return NextResponse.json({
        ok: true,
        text: appendOwnershipToReason(fallback, toOwnership),
        provider: 'fallback',
        ownership: toOwnership.ownership,
        ownedQty: toOwnership.ownedQty,
      });
    }
  } catch(e:any){
    return NextResponse.json({ ok:false, error: e?.message || 'server_error' }, { status:500 });
  }
}
