/**
 * Pro Health Report: deterministic deck facts (scryfall_cache → enrich → tag → buildDeckFacts)
 * ground the LLM; the model interprets/explains rather than inventing counts/structure.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { HEALTH_REPORT_PRO } from '@/lib/feature-limits';
import { enrichDeck } from '@/lib/deck/deck-enrichment';
import { tagCards } from '@/lib/deck/card-role-tags';
import { buildDeckFacts, type DeckFacts } from '@/lib/deck/deck-facts';
import { parseDeckText } from '@/lib/deck/parseDeckText';
import { resolveCommanderFromEnriched } from '@/lib/deck/deck-context-summary';
import { tryDeckFormatStringToAnalyzeFormat, type AnalyzeFormat } from '@/lib/deck/formatRules';
import { getLimitedSupportNote } from '@/lib/deck/formatSupportMatrix';

export const runtime = 'nodejs';

function normalizeFactsFormat(raw: string): AnalyzeFormat | null {
  return tryDeckFormatStringToAnalyzeFormat(raw);
}

function deckEntriesFromDeckCards(
  deckCards: { name: string; qty: number; zone?: string | null }[] | null
): Array<{ name: string; qty: number }> {
  if (!Array.isArray(deckCards) || deckCards.length === 0) return [];
  const byName = new Map<string, number>();
  for (const c of deckCards) {
    if (String(c?.zone || 'mainboard').toLowerCase() === 'sideboard') continue;
    const name = String(c?.name ?? '').trim().replace(/\s+/g, ' ');
    const q = Math.max(0, Math.floor(Number(c?.qty) || 0));
    if (!name || q <= 0) continue;
    byName.set(name, (byName.get(name) || 0) + q);
  }
  return Array.from(byName.entries()).map(([name, qty]) => ({ name, qty }));
}

/** Compact JSON for the prompt; omits huge role_counts map. */
function deckFactsToPromptJson(facts: DeckFacts): string {
  const topRoles = Object.entries(facts.role_counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 18);
  const payload = {
    commander: facts.commander,
    format: facts.format,
    color_identity: facts.color_identity,
    land_count: facts.land_count,
    nonland_count: facts.nonland_count,
    avg_cmc: Math.round(facts.avg_cmc * 100) / 100,
    curve_histogram_cmc_buckets: {
      '0-1': facts.curve_histogram[0],
      '2': facts.curve_histogram[1],
      '3': facts.curve_histogram[2],
      '4': facts.curve_histogram[3],
      '5+': facts.curve_histogram[4],
    },
    curve_profile: facts.curve_profile,
    ramp_count: facts.ramp_count,
    draw_count: facts.draw_count,
    interaction_count: facts.interaction_count,
    interaction_buckets: facts.interaction_buckets,
    archetype_candidates: facts.archetype_candidates.slice(0, 5),
    engine_candidates: facts.engine_candidates.slice(0, 5),
    win_pattern_candidates: facts.win_pattern_candidates.slice(0, 5),
    top_role_tag_counts: Object.fromEntries(topRoles),
    off_color_cards: facts.off_color_cards,
    banned_cards: facts.banned_cards,
    uncertainty_flags: facts.uncertainty_flags,
    partial_enrichment_card_rows: facts.partial_enrichment_count,
    note:
      'interaction_count is the sum of tag hits (counterspell, spot_removal, board_wipe); one card with multiple tags can add more than once.',
  };
  return JSON.stringify(payload, null, 2);
}

async function computeDeckFactsForHealthReport(
  entries: Array<{ name: string; qty: number }>,
  format: AnalyzeFormat,
  commanderFromDeck: string
): Promise<{ facts: DeckFacts | null; factsNote: string }> {
  if (entries.length === 0) {
    return {
      facts: null,
      factsNote:
        'No structured deck rows (deck_cards / parsed deck_text). Deterministic metrics unavailable; rely on decklist text only.',
    };
  }
  try {
    const commander = format === 'Commander' ? commanderFromDeck.trim() || null : null;
    const enriched = await enrichDeck(entries, { format, commander });
    const resolvedCommander = format === 'Commander' ? resolveCommanderFromEnriched(enriched, commander) : null;
    const tagged = tagCards(enriched);
    const facts = buildDeckFacts(tagged, { format, commander: resolvedCommander });
    return { facts, factsNote: '' };
  } catch (e) {
    console.warn('[health-report] deck facts enrichment failed:', e);
    return {
      facts: null,
      factsNote:
        'Deterministic deck metrics could not be computed (enrichment error). Rely on decklist text; do not invent precise counts.',
    };
  }
}

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
      .select('name, qty, zone')
      .eq('deck_id', deckId)
      .limit(400);

    let entries = deckEntriesFromDeckCards(
      Array.isArray(deckCards) ? (deckCards as { name: string; qty: number }[]) : null
    );
    if (entries.length === 0) {
      const parsed = parseDeckText(String(deck.deck_text ?? ''));
      entries = parsed.map((e) => ({ name: e.name, qty: e.qty }));
    }

    const cardList =
      entries.length > 0
        ? entries.map((e) => `${e.qty}x ${e.name}`).join('\n')
        : String(deck.deck_text ?? '').trim() || '';

    const commander = String(deck.commander ?? '');
    const title = String(deck.title ?? 'Untitled');
    const formatRaw = String(deck.format ?? 'Commander');
    const format = normalizeFactsFormat(formatRaw);
    if (!format) {
      return NextResponse.json(
        {
          ok: false,
          error:
            getLimitedSupportNote(formatRaw) ??
            'Pro Health Report currently supports Commander, Modern, Pioneer, Standard, and Pauper.',
        },
        { status: 400 }
      );
    }
    const isCommanderFormat = format === 'Commander';

    const { facts, factsNote } = await computeDeckFactsForHealthReport(entries, format, commander);
    const factsBlock = facts
      ? deckFactsToPromptJson(facts)
      : factsNote;
    const uncertaintyLine =
      facts?.uncertainty_flags?.length && facts.uncertainty_flags.length > 0
        ? `Uncertainty flags (metrics may be incomplete): ${facts.uncertainty_flags.join(', ')}.`
      : facts
        ? 'No uncertainty flags; treat counts as authoritative for this enriched snapshot.'
        : '';

    const decklistForPrompt = cardList.slice(0, 12000);

    const systemPrompt = `You are ManaTap AI, an expert Magic: The Gathering deck analyst. Produce a Pro Health Report in the exact format below.

You will receive COMPUTED_DECK_FACTS as JSON from our pipeline (Scryfall cache enrichment, role tags, deterministic counts, curve, archetype/engine/win-pattern candidates${
      isCommanderFormat ? ', color identity, off-color and banned card lists when available' : ', banned card lists when available'
    }). Treat those facts as the source of truth for numbers and structure unless an "uncertainty_flags" field says otherwise or facts are missing. Do not contradict provided counts when present. Use the decklist text for card-specific reasoning, adds, and cuts.

If facts are partial or unavailable, say so briefly in the overview and avoid asserting precise metrics you were not given.

${uncertaintyLine}

${
      isCommanderFormat
        ? 'Stay format-legal and within color identity for suggestions. Use clear, actionable language.'
        : 'This is a 60-card constructed context unless the metadata says otherwise: focus on main-deck curve, interaction, consistency, and manabase. Do not use Commander/EDH-specific advice (no color identity rules for generic constructed). Use clear, actionable language.'
    }

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
(5-7 cards to add, with short reason. Only cards legal in this format${
      isCommanderFormat ? ' and in the deck color identity' : ''
    }.)

## SUGGESTED_CUTS
- Card Name - brief reason
(3-5 cards to consider cutting, with short reason.)

Output only the report, no preamble.`;

    const userPrompt = `Analyze this deck and produce the Pro Health Report.

## COMPUTED_DECK_FACTS
${factsBlock}

## DECLARED_METADATA
title: ${title}
commander (saved): ${commander || '(none)'}
format (saved): ${formatRaw}

## DECKLIST_FOR_CARD_LEVEL_CONTEXT
${decklistForPrompt}`;

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
