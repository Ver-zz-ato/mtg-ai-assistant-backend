/**
 * Layer 0: Deterministic / Mini-only gate.
 * Classifies each request as NO_LLM (deterministic), MINI_ONLY (cheap model), or FULL_LLM (existing behavior).
 * Feature flag: LLM_LAYER0=on enables this; routes call layer0Decide only when enabled.
 */

import { getFaqAnswer } from "./static-faq";
import { isLongAnswerRequest } from "./chat-generation-config";

export type Layer0Decision =
  | {
      mode: "NO_LLM";
      reason: string;
      handler: "card_lookup" | "static_faq" | "need_more_info";
    }
  | {
      mode: "MINI_ONLY";
      reason: string;
      model: string;
      max_tokens: number;
    }
  | {
      mode: "FULL_LLM";
      reason: string;
    };

export type Layer0DecideArgs = {
  text: string;
  hasDeckContext: boolean;
  deckCardCount?: number | null;
  isAuthenticated: boolean;
  route: "chat" | "chat_stream" | "deck_analyze";
  /** When true, prefer MINI_ONLY unless request clearly needs FULL_LLM. */
  nearBudgetCap?: boolean;
};

const MINI_MODEL = "gpt-4o-mini";
const MINI_CEILING_TIGHT = 128;
const MINI_CEILING_NORMAL = 192;

/**
 * True if the user is asking for deck analysis/improvement/suggestions (needs deck context).
 */
export function isDeckAnalysisRequest(text: string): boolean {
  const q = (text || "").toLowerCase().trim();
  const patterns = [
    /\b(analyze|analysis|improve|upgrade|optimize|review)\s+(my\s+|this\s+)?(deck|list)\b/i,
    /\b(what'?s? wrong|what is wrong)\s+(with\s+)?(my\s+)?(deck|list)\b/i,
    /\bsuggest\s+(swap|card|upgrade)s?\b/i,
    /\bbudget\s+swap|swap\s+suggestions\b/i,
    /\b(how can i|what should i)\s+(improve|upgrade|fix)\b/i,
    /\b(deck|list)\s+(analysis|improvement|suggestions)\b/i,
  ];
  return patterns.some((re) => re.test(q));
}

/**
 * True if the query is a short MTG rules/term question (no deck needed).
 */
export function isSimpleRulesOrTerm(text: string): boolean {
  const q = (text || "").toLowerCase().trim();
  if (q.length > 120) return false;
  const patterns = [
    /\bwhat\s+is\s+(ward|trample|haste|vigilance|first strike|double strike|lifelink|menace|reach)\b/i,
    /\bwhat\s+does\s+(trample|ward|haste|vigilance|lifelink|menace|reach)\s+do\b/i,
    /\bcommander\s+tax\b/i,
    /\bwhat\s+is\s+(the\s+)?command\s+zone\b/i,
    /\bwhat\s+is\s+(the\s+)?stack\b/i,
    /\bwhat\s+is\s+priority\b/i,
    /\bwhat\s+is\s+CMC\b/i,
    /\bwhat\s+does\s+CMC\s+mean\b/i,
    /\bwhat\s+is\s+mana\s+value\b/i,
    /\bwhat\s+is\s+color\s+identity\b/i,
    /\bwhat\s+is\s+colorless\s+mana\b/i,
    /\bwhat\s+is\s+convoke\b/i,
    /\bwhat\s+is\s+flashback\b/i,
    /\bwhat\s+is\s+equip\b/i,
  ];
  return patterns.some((re) => re.test(q));
}

/**
 * True if the query matches a ManaTap app FAQ (answer from static map).
 */
export function isManaTapFaq(text: string): boolean {
  return getFaqAnswer(text) !== null;
}

/**
 * True if the user is asking for something that requires a deck but hasDeckContext is false.
 */
export function needsDeckButMissing(text: string, hasDeckContext: boolean): boolean {
  if (hasDeckContext) return false;
  return isDeckAnalysisRequest(text);
}

/**
 * Layer 0 classification. Deterministic, explainable.
 */
export function layer0Decide(args: Layer0DecideArgs): Layer0Decision {
  const { text, hasDeckContext, isAuthenticated, route, nearBudgetCap } = args;
  const q = (text || "").trim();
  const qLower = q.toLowerCase();

  // 1. Empty / whitespace
  if (!q) {
    return { mode: "NO_LLM", reason: "empty_input", handler: "need_more_info" };
  }

  // 2. Needs deck but missing → ask for deck link or paste
  if (needsDeckButMissing(text, hasDeckContext)) {
    return { mode: "NO_LLM", reason: "needs_deck_no_context", handler: "need_more_info" };
  }

  // 3. ManaTap FAQ → static answer
  if (isManaTapFaq(text)) {
    return { mode: "NO_LLM", reason: "static_faq_match", handler: "static_faq" };
  }

  // 4. Simple rules/term question, no deck → MINI_ONLY
  if (!hasDeckContext && isSimpleRulesOrTerm(text)) {
    return {
      mode: "MINI_ONLY",
      reason: "simple_rules_or_term",
      model: MINI_MODEL,
      max_tokens: MINI_CEILING_TIGHT,
    };
  }

  // 5. Near budget cap → prefer MINI unless clearly FULL_LLM (deck + complex/long-answer)
  if (nearBudgetCap) {
    const clearlyFull =
      hasDeckContext &&
      (isDeckAnalysisRequest(text) || isLongAnswerRequest(text));
    if (!clearlyFull) {
      return {
        mode: "MINI_ONLY",
        reason: "near_budget_cap",
        model: MINI_MODEL,
        max_tokens: MINI_CEILING_NORMAL,
      };
    }
  }

  // 6. Deck context + analysis/long-answer → FULL_LLM
  if (hasDeckContext && (isDeckAnalysisRequest(text) || isLongAnswerRequest(text))) {
    return { mode: "FULL_LLM", reason: "deck_context_complex_or_long" };
  }

  // 7. Simple one-liner, no deck (e.g. "best commander for zombies?") → MINI_ONLY (keep short so long queries get FULL_LLM)
  if (!hasDeckContext && q.length < 65 && !isDeckAnalysisRequest(text)) {
    const looksSimple = !/\b(analyze|improve|suggest|optimize|synergy|strategy|combo|engine)\b/i.test(qLower);
    if (looksSimple) {
      return {
        mode: "MINI_ONLY",
        reason: "simple_one_liner_no_deck",
        model: MINI_MODEL,
        max_tokens: MINI_CEILING_NORMAL,
      };
    }
  }

  // 8. Default
  return { mode: "FULL_LLM", reason: "default" };
}
