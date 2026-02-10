/**
 * Phase B: Dynamic token ceilings and stop sequences for chat generation.
 * Used by /api/chat and /api/chat/stream to reduce cost and filler.
 */

export type TokenCeilingOpts = {
  isComplex: boolean;
  deckCardCount?: number;
};

/** Non-stream (single completion) ceilings. Kept conservative to reduce cost. */
const BASE_SIMPLE = 192;
const BASE_COMPLEX = 320;
const DECK_BONUS_SMALL = 64;   // deck present, small
const DECK_BONUS_LARGE = 128;  // deck present, large (e.g. 60+)
const LARGE_DECK_THRESHOLD = 60;
const CAP_NON_STREAM = 512;

/** Stream ceilings: allow longer answers but still cap to avoid runaway. */
const STREAM_BASE_SIMPLE = 768;
const STREAM_BASE_COMPLEX = 1536;
const STREAM_DECK_BONUS = 256;
const CAP_STREAM = 2000;

/**
 * Dynamic token ceiling for chat completion.
 * Scales with complexity and deck size to avoid over-generation on simple queries.
 * Future: clamp by user_tier (e.g. pro gets longer analysis ceiling).
 */
export function getDynamicTokenCeiling(
  opts: TokenCeilingOpts,
  forStream: boolean = false
): number {
  const { isComplex, deckCardCount = 0 } = opts;
  const hasDeck = deckCardCount > 0;
  const deckBonus = hasDeck
    ? deckCardCount >= LARGE_DECK_THRESHOLD
      ? (forStream ? STREAM_DECK_BONUS : DECK_BONUS_LARGE)
      : (forStream ? Math.min(STREAM_DECK_BONUS, 128) : DECK_BONUS_SMALL)
    : 0;

  if (forStream) {
    const base = isComplex ? STREAM_BASE_COMPLEX : STREAM_BASE_SIMPLE;
    return Math.min(base + deckBonus, CAP_STREAM);
  }
  const base = isComplex ? BASE_COMPLEX : BASE_SIMPLE;
  return Math.min(base + deckBonus, CAP_NON_STREAM);
}

/**
 * Stop sequences to cut filler phrases and keep responses concise.
 * OpenAI stops at the first occurrence of any of these (substring match).
 * Kept long and specific to avoid cutting mid-sentence when streaming.
 */
export const CHAT_STOP_SEQUENCES: string[] = [
  "Let me know if you have any questions.",
  "Feel free to ask if you have any questions.",
  "If you have any questions, feel free to ask.",
  "Happy to help if you have more questions.",
  "Don't hesitate to ask if you need anything else.",
  "I'm here if you need any more help.",
];

/**
 * Whether the query likely expects a long, structured answer (analysis, suggestions, improve).
 * Used to enable two-stage generation (outline then write).
 */
export function isLongAnswerRequest(query: string): boolean {
  const q = (query || '').toLowerCase().trim();
  const longPatterns = [
    /\b(analyze|analysis|improve|suggest|recommend|optimize|upgrade|what.*wrong|what to change)\b/i,
    /\b(how can i|what should i|help me (with|improve)|review my deck)\b/i,
    /\b(synergy|strategy|game plan|curve|mana base)\b/i,
  ];
  return longPatterns.some((re) => re.test(q));
}

/** Max tokens for the mini-model outline step (two-stage). */
export const OUTLINE_MAX_TOKENS = 256;
