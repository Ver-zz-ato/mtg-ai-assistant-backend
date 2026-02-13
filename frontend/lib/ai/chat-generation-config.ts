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
 * Instruction to suppress closing filler. Prefer this over stop sequences for stream-safe behavior
 * (stop can truncate mid-sentence when streaming). Use with trimOutroLines post-processor.
 */
export const NO_FILLER_INSTRUCTION =
  "Do not add closing filler like 'Let me know if you have questions' or 'Feel free to ask'.";

/**
 * Stop sequences to cut filler phrases. Use sparingly—can amputate legitimate content when streaming.
 * Prefer NO_FILLER_INSTRUCTION + trimOutroLines for stream-safe behavior.
 */
export const CHAT_STOP_SEQUENCES: string[] = [
  "Let me know if you have any questions.",
  "Feel free to ask if you have any questions.",
  "If you have any questions, feel free to ask.",
  "Happy to help if you have more questions.",
];

/** Known outro phrases to trim only at end of response (stream-safe). */
export const OUTRO_PHRASES_TO_TRIM: string[] = [
  "Let me know if you have any questions.",
  "Feel free to ask if you have any questions.",
  "If you have any questions, feel free to ask.",
  "Happy to help if you have more questions.",
  "Let me know if you have any other questions.",
  "Feel free to ask if you have any other questions.",
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

/** Minimum predicted output tokens to use two-stage (avoids planner overhead on short answers). */
export const TWO_STAGE_MIN_PREDICTED_TOKENS = 350;

/**
 * Heuristic estimate of output length. Used to gate two-stage: only use when predicted > 350 tokens.
 * Based on intent type, deck context presence, and request patterns (e.g. "give me 10 swaps" → high).
 */
export function predictOutputTokens(
  query: string,
  hasDeckContext: boolean,
  isComplexAnalysis: boolean
): number {
  const q = (query || "").toLowerCase().trim();
  if (!isComplexAnalysis || !hasDeckContext) return 0;

  // Explicit list requests → high
  if (/\b(give me|list|suggest|recommend)\s+(\d+)\s+(swap|card|upgrade|addition)s?/i.test(q)) {
    const match = q.match(/(\d+)\s+(swap|card|upgrade|addition)/i);
    const n = match ? parseInt(match[1], 10) : 5;
    return 80 + n * 60; // ~60 tokens per card suggestion
  }
  if (/\b(top|best)\s+(\d+)\s+/i.test(q)) {
    const match = q.match(/(\d+)/);
    const n = match ? parseInt(match[1], 10) : 5;
    return 60 + n * 50;
  }

  // Analysis/improve/suggest (no count) → medium-high
  if (/\b(analyze|analysis|improve|optimize|review|what'?s? wrong|suggest improvement)/i.test(q))
    return 400;
  if (/\b(synergy|strategy|game plan|curve|mana base)\b/i.test(q)) return 350;

  // Vague long-answer → medium
  if (/\b(how can i|what should i|help me)\b/i.test(q)) return 320;

  return 250; // default for long-answer without specific signals
}
