// app/api/playstyle/explain/route.ts
// AI-powered playstyle explanation with caching

import { NextRequest, NextResponse } from 'next/server';
import { PlaystyleTraits, AvoidItem } from '@/lib/quiz/quiz-data';

export const runtime = 'nodejs';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MINI_MODEL = 'gpt-4o-mini';

// In-memory cache with 1-hour TTL
const explainCache = new Map<string, { data: ExplainResult; expiry: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface ExplainRequest {
  traits: PlaystyleTraits;
  topArchetypes: { label: string; matchPct: number }[];
  avoidList: AvoidItem[];
  level: 'short' | 'full';
  profileLabel?: string;
}

interface ExplainResult {
  paragraph: string;
  becauseBullets: string[];
}

/**
 * Generate a cache key from traits (rounded to nearest 5) + archetypes + level.
 */
function generateCacheKey(req: ExplainRequest): string {
  const roundedTraits = Object.entries(req.traits)
    .map(([k, v]) => `${k}:${Math.round(v / 5) * 5}`)
    .sort()
    .join('|');
  const archetypes = req.topArchetypes.map(a => a.label).sort().join(',');
  return `${roundedTraits}::${archetypes}::${req.level}`;
}

/**
 * Fallback explanation computed locally (no AI).
 */
function fallbackExplanation(req: ExplainRequest): ExplainResult {
  const { traits, topArchetypes, avoidList, level, profileLabel } = req;
  
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
  
  const paragraph = `Your ${profileLabel || 'playstyle'} profile suggests a ${controlDesc} approach that ${varianceDesc}. ${archStr} archetypes likely resonate with how you enjoy Commander. Your preferences indicate you'll thrive with decks that match your interaction style and game length expectations.`;
  
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
  const bulletCount = level === 'short' ? 3 : 5;
  const wordCount = level === 'short' ? '40-70' : '80-120';
  
  const systemPrompt = `You are an expert Magic: The Gathering Commander format analyst. Write personalized playstyle insights that feel computed and data-driven. Be MTG-flavored but not cringe. Avoid claiming certainty—use "suggests", "likely", "tends to".`;
  
  const userPrompt = `Based on this Commander player's trait analysis, write a brief playstyle explanation.

Profile: ${profileLabel || 'Commander Player'}
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
      max_tokens: level === 'short' ? 200 : 350,
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as ExplainRequest;
    
    // Validate request
    if (!body.traits || !body.level) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields: traits, level' },
        { status: 400 }
      );
    }
    
    if (!['short', 'full'].includes(body.level)) {
      return NextResponse.json(
        { ok: false, error: 'level must be "short" or "full"' },
        { status: 400 }
      );
    }
    
    // Check cache
    const cacheKey = generateCacheKey(body);
    const cached = explainCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return NextResponse.json({ ok: true, ...cached.data, cached: true });
    }
    
    // Try AI, fallback to local
    let result: ExplainResult;
    try {
      result = await callOpenAIMini(body);
    } catch (aiError) {
      console.warn('AI explanation failed, using fallback:', aiError);
      result = fallbackExplanation(body);
    }
    
    // Ensure we have valid data
    if (!result.paragraph) {
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
    
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('Playstyle explain error:', error);
    return NextResponse.json(
      { ok: false, error: 'Server error' },
      { status: 500 }
    );
  }
}
