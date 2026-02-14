/**
 * 3-tier prompt architecture: micro, standard, full.
 * Reduces input token costs on trivial queries while preserving full MTG intelligence for complex deck analysis.
 * MICRO requires explicit pattern match (greeting or simple definition) — length alone is never enough.
 */

import { isSimpleRulesOrTerm, isDeckAnalysisRequest } from "./layer0-gate";

export type PromptTier = "micro" | "standard" | "full";

export type ClassifyPromptTierArgs = {
  text: string;
  hasDeckContext: boolean;
  deckContextForCompose?: { deckCards?: { name: string }[] } | null;
};

export type ClassifyPromptTierResult = {
  tier: PromptTier;
  reason: string;
};

/** Featherweight prompt for greetings and simple definitions. ~80 tokens. */
export const MICRO_PROMPT =
  "You are ManaTap AI, a concise Magic: The Gathering assistant. Answer clearly and briefly. When referencing cards, use [[Double Brackets]]. Do not add closing filler.";

/** Rough token estimate: ~4 chars per token for English. */
export function estimateSystemPromptTokens(prompt: string): number {
  return Math.ceil((prompt || "").length / 4);
}

/** Greeting patterns — explicit only. Length alone is NOT enough for micro. */
const GREETING_PATTERNS = [
  /^(hi|hey|hello|howdy|yo)\s*[!.]?$/i,
  /^thanks?\s*(you|a lot|so much)?\s*[!.]?$/i,
  /^thank\s+you\s*[!.]?$/i,
  /^ok(ay)?\s*[!.]?$/i,
  /^got\s+it\s*[!.]?$/i,
  /^cool\s*[!.]?$/i,
  /^nice\s*[!.]?$/i,
];

function matchesGreeting(text: string): boolean {
  const q = (text || "").trim();
  return GREETING_PATTERNS.some((re) => re.test(q));
}

/** Explicit list request patterns — always full tier. */
const LIST_REQUEST_PATTERNS = [
  /\b(give me|list|suggest|recommend)\s+(\d+)\s+(swap|card|upgrade|addition)s?/i,
  /\b(top|best)\s+(\d+)\s+/i,
  /\b(\d+)\s+(swap|card|upgrade|addition)s?\s+(for|in)\b/i,
];

function matchesExplicitListRequest(text: string): boolean {
  return LIST_REQUEST_PATTERNS.some((re) => re.test(text || ""));
}

/**
 * Classify request into prompt tier.
 * Escalate when uncertain; never downgrade to micro on length alone.
 */
export function classifyPromptTier(args: ClassifyPromptTierArgs): ClassifyPromptTierResult {
  const { text, hasDeckContext, deckContextForCompose } = args;
  const hasDeck = hasDeckContext || !!(deckContextForCompose?.deckCards?.length);

  // FULL: deck context present — never micro
  if (hasDeck) {
    return { tier: "full", reason: "deck_context" };
  }

  // FULL: deck-intent query (e.g. "analyze my deck") — even without deck, never micro
  if (isDeckAnalysisRequest(text)) {
    return { tier: "full", reason: "deck_intent_no_context" };
  }

  // FULL: explicit list request (e.g. "give me 10 swaps") — even without deck, needs full prompt
  if (matchesExplicitListRequest(text)) {
    return { tier: "full", reason: "explicit_list_request" };
  }

  // MICRO: greeting — explicit pattern only
  if (matchesGreeting(text)) {
    return { tier: "micro", reason: "greeting" };
  }

  // FULL: multi-step / detailed request heuristic
  if (/\b(step by step|step-by-step|detailed|in detail|break down|walk me through)\b/i.test(text)) {
    return { tier: "full", reason: "multi_step_or_detailed" };
  }

  // MICRO: simple rules/term definition (what is trample, what does ward do)
  if (isSimpleRulesOrTerm(text)) {
    return { tier: "micro", reason: "simple_definition" };
  }

  // STANDARD: everything else (including short-but-non-trivial like "best budget ramp?", "help with cuts?")
  return { tier: "standard", reason: "default" };
}
