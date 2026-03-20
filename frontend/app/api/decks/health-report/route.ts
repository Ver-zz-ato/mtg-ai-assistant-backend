import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { HEALTH_REPORT_PRO } from '@/lib/feature-limits';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const deckId = String(body?.deckId ?? '').trim();
    if (!deckId) {
      return NextResponse.json({ ok: false, error: 'deckId required' }, { status: 400 });
    }

    let supabase = await createClient();
    let { data: { user } } = await supabase.auth.getUser();

    // Bearer fallback for mobile
    if (!user) {
      const authHeader = req.headers.get('Authorization');
      const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (bearerToken) {
        const { createClientWithBearerToken } = await import('@/lib/server-supabase');
        const bearerSupabase = createClientWithBearerToken(bearerToken);
        const { data: { user: bearerUser } } = await bearerSupabase.auth.getUser();
        if (bearerUser) {
          user = bearerUser;
          supabase = bearerSupabase;
        }
      }
    }

    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { checkProStatus } = await import('@/lib/server-pro-check');
    const isPro = await checkProStatus(user.id);
    if (!isPro) {
      try {
        const { logOpsEvent } = await import('@/lib/ops-events');
        await logOpsEvent(supabase, {
          event_type: 'ops_pro_access_denied',
          route: '/api/decks/health-report',
          status: 'ok',
          reason: 'pro_required',
          user_id: user.id,
          source: 'deck_health_report',
        });
      } catch {}
      return NextResponse.json(
        { ok: false, error: 'Pro Health Report is a Pro feature. Upgrade to unlock in-depth AI deck analysis.' },
        { status: 403 }
      );
    }

    const { checkDurableRateLimit } = await import('@/lib/api/durable-rate-limit');
    const { hashString } = await import('@/lib/guest-tracking');
    const userKeyHash = `user:${await hashString(user.id)}`;
    const rateLimit = await checkDurableRateLimit(supabase, userKeyHash, '/api/decks/health-report', HEALTH_REPORT_PRO, 1);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          code: 'RATE_LIMIT_DAILY',
          error: "You've reached your daily Pro Health Report limit. Try again tomorrow.",
          resetAt: rateLimit.resetAt,
        },
        { status: 429 }
      );
    }

    const { data: deck } = await supabase
      .from('decks')
      .select('id, title, commander, deck_text, format')
      .eq('id', deckId)
      .eq('user_id', user.id)
      .single();

    if (!deck) {
      return NextResponse.json({ ok: false, error: 'Deck not found' }, { status: 404 });
    }

    const { data: deckCards } = await supabase
      .from('deck_cards')
      .select('name, qty')
      .eq('deck_id', deckId)
      .limit(400);

    const cardList = Array.isArray(deckCards)
      ? deckCards.map((c: { name: string; qty: number }) => `${c.qty}x ${c.name}`).join('\n')
      : String(deck.deck_text ?? '').trim() || '';

    const commander = String(deck.commander ?? '');
    const title = String(deck.title ?? 'Untitled');
    const format = String(deck.format ?? 'Commander');

    const deckContext = `Deck: ${title}${commander ? ` | Commander: ${commander}` : ''} | Format: ${format}\n\nDecklist:\n${cardList.slice(0, 12000)}`;

    const systemPrompt = `You are ManaTap AI, an expert Magic: The Gathering deck analyst. Produce a Pro Health Report in the exact format below. Use clear, actionable language. For Commander decks, respect color identity.

Respond with exactly these sections, each starting with the header on its own line:

## OVERVIEW
(2-4 sentences summarizing the deck's strengths and main weaknesses.)

## BIGGEST_ISSUES
- Issue one
- Issue two
- Issue three
(3-5 bullet points, each one line.)

## PRIORITY_FIX_PLAN
- Step one
- Step two
- Step three
(3-5 ordered steps to improve the deck, each one line.)

## SUGGESTED_ADDS
- Card Name - brief reason
(5-7 cards to add, with short reason. Only cards legal in format and in color identity.)

## SUGGESTED_CUTS
- Card Name - brief reason
(3-5 cards to consider cutting, with short reason.)

Output only the report, no preamble.`;

    const userPrompt = `Analyze this deck and produce the Pro Health Report.\n\n${deckContext}`;

    const model = process.env.MODEL_DECK_SCAN || 'gpt-4o-mini';
    const { callLLM } = await import('@/lib/ai/unified-llm-client');
    const response = await callLLM(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      {
        route: '/api/decks/health-report',
        feature: 'health_report',
        model,
        fallbackModel: 'gpt-4o-mini',
        timeout: 90000,
        maxTokens: 8192,
        apiType: 'chat',
        userId: user.id,
        isPro: true,
      }
    );

    const content = response.text || '';
    const report = parseHealthReport(content);

    return NextResponse.json({
      ok: true,
      overview: report.overview,
      biggestIssues: report.biggestIssues,
      priorityFixPlan: report.priorityFixPlan,
      suggestedAdds: report.suggestedAdds,
      suggestedCuts: report.suggestedCuts,
    });
  } catch (e: unknown) {
    console.error('[health-report] Error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    );
  }
}

function parseHealthReport(content: string): {
  overview?: string;
  biggestIssues?: string[];
  priorityFixPlan?: string[];
  suggestedAdds?: string[];
  suggestedCuts?: string[];
} {
  const sectionNames = ['OVERVIEW', 'BIGGEST_ISSUES', 'PRIORITY_FIX_PLAN', 'SUGGESTED_ADDS', 'SUGGESTED_CUTS'];
  const sections: Record<string, string> = {};
  const regex = new RegExp(`##\\s*(${sectionNames.join('|')})[^\\n]*\\n([\\s\\S]*?)(?=##|$)`, 'gi');
  let m;
  while ((m = regex.exec(content)) !== null) {
    const key = m[1].toUpperCase().replace(/\s+/g, '_');
    if (sectionNames.includes(key)) sections[key] = m[2].trim();
  }

  const toBullets = (text: string): string[] =>
    text
      .split(/\n/)
      .map((l) => l.replace(/^[-*•]\s*/, '').trim())
      .filter(Boolean);

  return {
    overview: sections.OVERVIEW || undefined,
    biggestIssues: toBullets(sections.BIGGEST_ISSUES ?? '').length ? toBullets(sections.BIGGEST_ISSUES ?? '') : undefined,
    priorityFixPlan: toBullets(sections.PRIORITY_FIX_PLAN ?? '').length ? toBullets(sections.PRIORITY_FIX_PLAN ?? '') : undefined,
    suggestedAdds: toBullets(sections.SUGGESTED_ADDS ?? '').length ? toBullets(sections.SUGGESTED_ADDS ?? '') : undefined,
    suggestedCuts: toBullets(sections.SUGGESTED_CUTS ?? '').length ? toBullets(sections.SUGGESTED_CUTS ?? '') : undefined,
  };
}
