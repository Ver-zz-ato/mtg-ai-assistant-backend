// app/api/playstyle/explain/route.ts
// AI-powered playstyle explanation with caching

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PlaystyleTraits, AvoidItem } from '@/lib/quiz/quiz-data';
import {
  costAuditRequestId,
  costAuditSafeErr,
  isCostAuditStorageEnabled,
} from '@/lib/observability/cost-audit';
import { costAuditServerLog } from '@/lib/observability/cost-audit-server';
import {
  formatKeyToDisplayTitle,
  isCommanderFormatKey,
  normalizeManatapDeckFormatKey,
} from '@/lib/format/manatap-deck-format';
import { DEFAULT_FALLBACK_MODEL } from '@/lib/ai/default-models';
import { createClient } from '@/lib/supabase/server';
import { createClientWithBearerToken } from '@/lib/server-supabase';
import { buildGroundedPlaystyleProfile } from '@/lib/quiz/playstyle-grounding';
import { buildAiRouteExecutionContext, buildTierCapabilityBlock, runStructuredAiFlow } from '@/lib/ai/structured-pipeline';
import { enforceDailyDurableRateLimit } from '@/lib/api/route-guard';
import { PLAYSTYLE_EXPLAIN_FREE, PLAYSTYLE_EXPLAIN_GUEST, PLAYSTYLE_EXPLAIN_PRO } from '@/lib/feature-limits';

export const runtime = 'nodejs';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MINI_MODEL = DEFAULT_FALLBACK_MODEL;
const ROUTE_PATH = '/api/playstyle/explain';
const FEATURE_KEY = 'playstyle_explain';
const RATE_LIMIT_KEY = ROUTE_PATH;
const MAX_REQUEST_BYTES = 8_192;
const MAX_PROFILE_LABEL_LENGTH = 120;
const MAX_ARCHETYPES = 8;
const MAX_AVOID_ITEMS = 8;

// In-memory cache with 1-hour TTL
const explainCache = new Map<string, { data: ExplainResult; expiry: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface ExplainRequest {
  traits: PlaystyleTraits;
  topArchetypes: { label: string; matchPct: number }[];
  avoidList: AvoidItem[];
  level: 'short' | 'full';
  profileLabel?: string;
  /** Optional deck format (default Commander) — additive for existing website callers. */
  format?: string;
}

interface ExplainResult {
  paragraph: string;
  becauseBullets: string[];
}

const TraitValueSchema = z.number().finite().min(0).max(100);

const ExplainRequestSchema = z.object({
  traits: z.object({
    control: TraitValueSchema,
    aggression: TraitValueSchema,
    comboAppetite: TraitValueSchema,
    varianceTolerance: TraitValueSchema,
    interactionPref: TraitValueSchema,
    gameLengthPref: TraitValueSchema,
    budgetElasticity: TraitValueSchema,
  }).strict(),
  topArchetypes: z.array(z.object({
    label: z.string().trim().min(1).max(80),
    matchPct: z.number().finite().min(0).max(100),
  }).strict()).max(MAX_ARCHETYPES).default([]),
  avoidList: z.array(z.object({
    label: z.string().trim().min(1).max(80),
    why: z.string().trim().min(1).max(240).default('Matched by your playstyle preferences.'),
  }).strict()).max(MAX_AVOID_ITEMS).default([]),
  level: z.enum(['short', 'full']),
  profileLabel: z.string().trim().min(1).max(MAX_PROFILE_LABEL_LENGTH).optional(),
  format: z.string().trim().min(1).max(40).optional(),
}).strict();

async function parseExplainRequest(req: NextRequest): Promise<
  | { ok: true; body: ExplainRequest }
  | { ok: false; response: NextResponse }
> {
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'Request too large' }, { status: 413 }),
    };
  }

  const raw = await req.text();
  if (raw.length > MAX_REQUEST_BYTES) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'Request too large' }, { status: 413 }),
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }),
    };
  }

  const parsed = ExplainRequestSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'Invalid playstyle request' }, { status: 400 }),
    };
  }

  return { ok: true, body: parsed.data };
}

/**
 * Generate a cache key from traits (rounded to nearest 5) + archetypes + level.
 */
function generateCacheKey(req: ExplainRequest): string {
  const fmt = normalizeManatapDeckFormatKey(req.format);
  const roundedTraits = Object.entries(req.traits)
    .map(([k, v]) => `${k}:${Math.round(v / 5) * 5}`)
    .sort()
    .join('|');
  const archetypes = req.topArchetypes.map(a => a.label).sort().join(',');
  const avoids = (req.avoidList || []).map((a) => a.label).sort().join(',');
  return `${roundedTraits}::${archetypes}::${req.level}::fmt:${fmt}::avoid:${avoids}`;
}

/**
 * Fallback explanation computed locally (no AI).
 */
function fallbackExplanation(req: ExplainRequest): ExplainResult {
  const { traits, topArchetypes, avoidList, level, profileLabel } = req;
  const fmtKey = normalizeManatapDeckFormatKey(req.format);
  const fmtTitle = formatKeyToDisplayTitle(fmtKey);
  
  const bullets: string[] = [];
  
  // Generate bullets based on traits
  if (traits.control > 60) {
    bullets.push('You lean toward reactive, control-oriented strategies');
  } else if (traits.aggression > 60) {
    bullets.push('You prefer proactive, aggressive gameplans');
  } else {
    bullets.push('You balance proactive and reactive play');
  }
  
  if (traits.comboAppetite > 60) {
    bullets.push('Combo finishes appeal to your deckbuilding sensibilities');
  }
  
  if (traits.varianceTolerance > 60) {
    bullets.push('You embrace variance and unexpected outcomes');
  } else if (traits.varianceTolerance < 40) {
    bullets.push('Consistency and reliability are important to you');
  }
  
  if (traits.interactionPref > 60) {
    bullets.push('You value interaction with opponents');
  }
  
  if (traits.gameLengthPref > 60) {
    bullets.push('Longer games with more decisions suit your style');
  } else if (traits.gameLengthPref < 40) {
    bullets.push('You prefer games that reach a conclusion efficiently');
  }
  
  if (avoidList.length > 0) {
    bullets.push(`You likely want to avoid: ${avoidList[0].label.toLowerCase()}`);
  }
  
  // Build paragraph
  const archStr = topArchetypes.length > 0 
    ? topArchetypes.slice(0, 2).map(a => a.label).join(' and ') 
    : 'value-oriented';
  
  const controlDesc = traits.control > 60 ? 'control-leaning' : traits.aggression > 60 ? 'aggressive' : 'balanced';
  const varianceDesc = traits.varianceTolerance > 60 ? 'embraces variance' : traits.varianceTolerance < 40 ? 'values consistency' : 'accepts moderate variance';
  
  const formatClause = isCommanderFormatKey(fmtKey)
    ? `how you enjoy Commander`
    : `how you like to play ${fmtTitle} (verify example card picks in a deckbuilder for legality)`;
  const paragraph = `Your ${profileLabel || 'playstyle'} profile suggests a ${controlDesc} approach that ${varianceDesc}. ${archStr} archetypes likely resonate with ${formatClause}. Your preferences indicate you'll thrive with decks that match your interaction style and game length expectations.`;
  
  return {
    paragraph,
    becauseBullets: bullets.slice(0, level === 'short' ? 3 : 5),
  };
}

/**
 * Call OpenAI mini model for explanation.
 */
async function callOpenAIMini(req: ExplainRequest): Promise<ExplainResult> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }
  
  const { traits, topArchetypes, avoidList, level, profileLabel } = req;
  const fmtKey = normalizeManatapDeckFormatKey(req.format);
  const fmtTitle = formatKeyToDisplayTitle(fmtKey);
  const bulletCount = level === 'short' ? 3 : 5;
  const wordCount = level === 'short' ? '40-70' : '80-120';

  const systemPrompt = isCommanderFormatKey(fmtKey)
    ? `You are an expert Magic: The Gathering Commander format analyst. Write personalized playstyle insights that feel computed and data-driven. Be MTG-flavored but not cringe. Avoid claiming certainty—use "suggests", "likely", "tends to".`
    : `You are an expert Magic: The Gathering ${fmtTitle} (60-card constructed) deckbuilding analyst. Write personalized playstyle insights that feel computed and data-driven. Avoid Commander-only multiplayer assumptions. Avoid claiming certainty—use "suggests", "likely", "tends to".`;

  const userPrompt = `Based on this ${fmtTitle} player's trait analysis, write a brief playstyle explanation.

Profile: ${profileLabel || `${fmtTitle} Player`}
Traits (0-100 scale):
- Control: ${traits.control} (higher = prefers control)
- Aggression: ${traits.aggression} (higher = more aggressive)
- Combo Appetite: ${traits.comboAppetite} (higher = combo-focused)
- Variance Tolerance: ${traits.varianceTolerance} (higher = embraces chaos)
- Interaction: ${traits.interactionPref} (higher = more interactive)
- Game Length: ${traits.gameLengthPref} (higher = prefers longer games)
- Budget: ${traits.budgetElasticity} (higher = no budget concerns)

Top Archetypes: ${topArchetypes.map(a => `${a.label} (${a.matchPct}%)`).join(', ')}
${avoidList.length > 0 ? `Likely Avoids: ${avoidList.map(a => a.label).join(', ')}` : ''}

Write:
1. A ${wordCount} word paragraph summarizing their playstyle
2. ${bulletCount} short bullet points (each 8-15 words) starting with "Because..." explaining why they match these archetypes

Format response as JSON:
{"paragraph": "...", "becauseBullets": ["Because ...", "Because ...", ...]}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MINI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1024,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error?.message || `HTTP ${response.status}`);
  }
  
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || '{}';
  
  try {
    const parsed = JSON.parse(content);
    return {
      paragraph: String(parsed.paragraph || '').trim(),
      becauseBullets: Array.isArray(parsed.becauseBullets) 
        ? parsed.becauseBullets.slice(0, bulletCount).map((b: unknown) => String(b).trim())
        : [],
    };
  } catch {
    throw new Error('Failed to parse AI response');
  }
}

async function resolveExplainTier(req: NextRequest): Promise<{ userId: string | null; isPro: boolean; isGuest: boolean }> {
  try {
    let supabase = await createClient();
    let { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const authHeader = req.headers.get("Authorization");
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (bearerToken) {
        const bearerSupabase = createClientWithBearerToken(bearerToken);
        const { data: { user: bearerUser } } = await bearerSupabase.auth.getUser();
        if (bearerUser) {
          user = bearerUser;
          supabase = bearerSupabase;
        }
      }
    }
    if (!user) return { userId: null, isPro: false, isGuest: true };
    const { checkProStatus } = await import("@/lib/server-pro-check");
    const isPro = await checkProStatus(user.id);
    return { userId: user.id, isPro, isGuest: false };
  } catch {
    return { userId: null, isPro: false, isGuest: true };
  }
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const reqId = isCostAuditStorageEnabled() ? costAuditRequestId() : '';
  try {
    const parsedRequest = await parseExplainRequest(req);
    if (!parsedRequest.ok) {
      if (isCostAuditStorageEnabled()) {
        costAuditServerLog({
          route: '/api/playstyle/explain',
          method: 'POST',
          reqId,
          event: 'playstyle.explain',
          durationMs: Date.now() - t0,
          ok: false,
          err: `validation: ${parsedRequest.response.status}`,
        });
      }
      return parsedRequest.response;
    }

    const body = parsedRequest.body;
    
    // Check cache
    const cacheKey = generateCacheKey(body);
    const cached = explainCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      if (isCostAuditStorageEnabled()) {
        costAuditServerLog({
          route: '/api/playstyle/explain',
          method: 'POST',
          reqId,
          event: 'playstyle.explain',
          durationMs: Date.now() - t0,
          ok: true,
          cacheHit: true,
          cacheKey,
          level: body.level,
          archetypeCount: body.topArchetypes?.length ?? 0,
          avoidCount: body.avoidList?.length ?? 0,
          source: 'memory_cache',
        });
      }
      return NextResponse.json({ ok: true, ...cached.data, cached: true });
    }
    
    const auth = await resolveExplainTier(req);
    const rateLimitSupabase = await createClient();
    const rateLimit = await enforceDailyDurableRateLimit({
      req,
      supabase: rateLimitSupabase,
      routePath: ROUTE_PATH,
      user: auth.userId ? { id: auth.userId, is_anonymous: false } : null,
      isPro: auth.isPro,
      limits: {
        guest: PLAYSTYLE_EXPLAIN_GUEST,
        free: PLAYSTYLE_EXPLAIN_FREE,
        pro: PLAYSTYLE_EXPLAIN_PRO,
      },
      error: 'Daily playstyle explanation limit reached. Try again tomorrow.',
    });
    if (!rateLimit.allowed) return rateLimit.response;

    const fmtTitle = formatKeyToDisplayTitle(normalizeManatapDeckFormatKey(body.format));
    const grounded = buildGroundedPlaystyleProfile({
      traits: body.traits,
      topArchetypes: body.topArchetypes || [],
      avoidList: body.avoidList || [],
      profileLabel: body.profileLabel,
      formatTitle: fmtTitle,
    });

    const deterministic = fallbackExplanation(body);
    const context = buildAiRouteExecutionContext({
      userId: auth.userId,
      isGuest: auth.isGuest,
      isPro: auth.isPro,
      featureKey: FEATURE_KEY,
      rateLimitKey: RATE_LIMIT_KEY,
    });

    let result: ExplainResult = deterministic;
    let source: 'openai' | 'fallback' = 'openai';
    try {
      const flow = await runStructuredAiFlow<ExplainResult>({
        context,
        routePath: ROUTE_PATH,
        deterministic,
        judge: {
          recordUsage: context.judgePasses < 2,
          passName: 'judge',
          maxTokens: body.level === 'short' ? 500 : 900,
          buildMessages: () => [
            {
              role: 'system',
              content: [
                isCommanderFormatKey(normalizeManatapDeckFormatKey(body.format))
                  ? "You are an expert MTG Commander playstyle analyst."
                  : `You are an expert MTG ${fmtTitle} playstyle analyst.`,
                "Write personalized playstyle summaries from the supplied deterministic profile only.",
                "Return strict JSON: {\"paragraph\":\"...\",\"becauseBullets\":[\"...\",\"...\"]}.",
                "Do not invent extra archetypes or preferences beyond the provided profile.",
                buildTierCapabilityBlock(context),
              ].join("\n\n"),
            },
            {
              role: 'user',
              content: [
                `Profile summary: ${grounded.profileSummary}`,
                `Dominant axis: ${grounded.dominantAxis}`,
                `Secondary axis: ${grounded.secondaryAxis}`,
                `Variance: ${grounded.variancePreference}`,
                `Interaction: ${grounded.interactionProfile}`,
                `Game length: ${grounded.gameLengthProfile}`,
                `Budget: ${grounded.budgetProfile}`,
                `Archetype family: ${grounded.archetypeFamily}`,
                grounded.antiArchetype ? `Likely avoids: ${grounded.antiArchetype}` : "",
                `Level: ${body.level}`,
                `Bullet anchors: ${grounded.bullets.join(" | ")}`,
              ].filter(Boolean).join("\n"),
            },
          ],
          parse: (text, current) => {
            try {
              const parsed = JSON.parse(text) as ExplainResult;
              const bulletCount = body.level === 'short' ? 3 : 5;
              return {
                paragraph: String(parsed.paragraph || '').trim() || current.paragraph,
                becauseBullets: Array.isArray(parsed.becauseBullets)
                  ? parsed.becauseBullets.map((b) => String(b).trim()).filter(Boolean).slice(0, bulletCount)
                  : current.becauseBullets,
              };
            } catch {
              return current;
            }
          },
        },
        writer: {
          recordUsage: context.judgePasses >= 2,
          passName: 'writer',
          maxTokens: body.level === 'short' ? 400 : 700,
          buildMessages: (current) => [
            {
              role: 'system',
              content: "Rewrite the explanation to be crisp, stable, and non-repetitive. Return the same strict JSON shape only.",
            },
            {
              role: 'user',
              content: [
                `Deterministic profile: ${grounded.profileSummary}`,
                `Current draft JSON: ${JSON.stringify(current)}`,
                "Keep the meaning, improve the wording, and avoid swingy overclaims.",
              ].join("\n"),
            },
          ],
          parse: (text, current) => {
            try {
              const parsed = JSON.parse(text) as ExplainResult;
              return {
                paragraph: String(parsed.paragraph || '').trim() || current.paragraph,
                becauseBullets: Array.isArray(parsed.becauseBullets)
                  ? parsed.becauseBullets.map((b) => String(b).trim()).filter(Boolean).slice(0, current.becauseBullets.length || 3)
                  : current.becauseBullets,
              };
            } catch {
              return current;
            }
          },
        },
      });
      result = flow.value;
      source = flow.fallbackUsed ? 'fallback' : 'openai';
    } catch (aiError) {
      console.warn('AI explanation failed, using fallback:', aiError);
      source = 'fallback';
      result = deterministic;
    }

    // Ensure we have valid data
    if (!result.paragraph) {
      source = 'fallback';
      result = fallbackExplanation(body);
    }
    
    // Cache result
    explainCache.set(cacheKey, {
      data: result,
      expiry: Date.now() + CACHE_TTL_MS,
    });
    
    // Clean old cache entries periodically
    if (explainCache.size > 500) {
      const now = Date.now();
      for (const [key, value] of explainCache) {
        if (value.expiry < now) {
          explainCache.delete(key);
        }
      }
    }
    
    if (isCostAuditStorageEnabled()) {
      costAuditServerLog({
        route: '/api/playstyle/explain',
        method: 'POST',
        reqId,
        event: 'playstyle.explain',
        durationMs: Date.now() - t0,
        ok: true,
        cacheHit: false,
        cacheKey,
        level: body.level,
        archetypeCount: body.topArchetypes?.length ?? 0,
        avoidCount: body.avoidList?.length ?? 0,
        source,
      });
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('Playstyle explain error:', error);
    if (isCostAuditStorageEnabled()) {
      costAuditServerLog({
        route: '/api/playstyle/explain',
        method: 'POST',
        reqId,
        event: 'playstyle.explain',
        durationMs: Date.now() - t0,
        ok: false,
        err: costAuditSafeErr(error),
      });
    }
    return NextResponse.json(
      { ok: false, error: 'Server error' },
      { status: 500 }
    );
  }
}
