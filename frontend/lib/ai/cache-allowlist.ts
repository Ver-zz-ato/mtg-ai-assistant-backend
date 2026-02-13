/**
 * Public cache allowlist. Brutally strict—gatekeeper between safe savings and privacy bugs.
 * Public cache eligible only when: no deck context, no chat history, allowlisted intent, no context-implying phrases.
 */

import { getFaqAnswer } from "./static-faq";

/** Phrases that strongly imply prior context. Hard deny if present. */
const CONTEXT_IMPLYING_PHRASES = [
  "my deck",
  "my list",
  "i said earlier",
  "as we discussed",
  "you mentioned",
  "earlier you",
  "you said",
  "we talked",
  "as i said",
  "like i said",
];

/** Narrow patterns for allowlisted public intents (rules, terminology, generic how-does-X-work). */
const PUBLIC_INTENT_PATTERNS = [
  /\bwhat\s+is\s+(ward|trample|haste|vigilance|first strike|double strike|lifelink|menace|reach|affinity|convoke|flashback|equip|mana value|cmc|color identity|colorless mana)\b/i,
  /\bwhat\s+does\s+(trample|ward|haste|vigilance|lifelink|menace|reach)\s+do\b/i,
  /\bcommander\s+tax\b/i,
  /\bwhat\s+is\s+(the\s+)?(command\s+zone|stack|priority)\b/i,
  /\bhow\s+does\s+(convoke|flashback|equip|affinity)\s+work\b/i,
  /\b(format|commander|edh)\s+(legality|legal|banned)\b/i,
  /\bwhat\s+cards?\s+are\s+(banned|legal)\s+in\s+(commander|edh|modern)\b/i,
];

/**
 * True if user message contains context-implying phrases. Hard deny for public cache.
 */
function hasContextImplyingPhrase(text: string): boolean {
  const q = (text || "").toLowerCase().trim();
  return CONTEXT_IMPLYING_PHRASES.some((phrase) => q.includes(phrase));
}

/**
 * True if intent is allowlisted for public cache (static_faq or narrow rules/terminology patterns).
 */
export function isPublicCacheIntent(text: string, layer0Handler?: "static_faq" | string): boolean {
  if (layer0Handler === "static_faq") return true;
  if (getFaqAnswer(text) !== null) return true;
  return PUBLIC_INTENT_PATTERNS.some((re) => re.test(text));
}

/**
 * Public cache eligible only if ALL of:
 * - hasDeckContext === false
 * - hasChatHistory === false
 * - intent is allowlisted
 * - no context-implying phrases in message
 */
export function isPublicCacheEligible(opts: {
  hasDeckContext: boolean;
  hasChatHistory: boolean;
  userMessage: string;
  layer0Handler?: "static_faq" | "need_more_info" | "off_topic" | string;
}): boolean {
  const { hasDeckContext, hasChatHistory, userMessage, layer0Handler } = opts;
  if (hasDeckContext || hasChatHistory) return false;
  if (hasContextImplyingPhrase(userMessage)) return false;
  return isPublicCacheIntent(userMessage, layer0Handler);
}
