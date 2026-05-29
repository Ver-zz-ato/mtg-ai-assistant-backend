/**
 * Layer 0: Deterministic / Mini-only gate.
 * Classifies each request as NO_LLM (deterministic), MINI_ONLY (cheap model), or FULL_LLM (existing behavior).
 * Feature flag: LLM_LAYER0=on enables this; routes call layer0Decide only when enabled.
 */

import { getFaqAnswer } from "./static-faq";
import { isLongAnswerRequest } from "./chat-generation-config";
import { DEFAULT_FALLBACK_MODEL } from "./default-models";
import { isDecklist } from "@/lib/chat/decklistDetector";

export type Layer0Decision =
  | {
      mode: "NO_LLM";
      reason: string;
      handler: "card_lookup" | "static_faq" | "need_more_info" | "off_topic" | "off_topic_ai_check";
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

export type ChatTurnIntent =
  | "deck_analysis"
  | "deck_edit_followup"
  | "decklist_paste"
  | "commander_confirmation"
  | "rules_question"
  | "legality_question"
  | "price_question"
  | "format_question"
  | "memory_recall"
  | "general_mtg"
  | "faq"
  | "off_topic"
  | "empty";

/**
 * Lightweight intent classification for routing and logging.
 * Prefer this before firing keyword shortcuts or MINI_ONLY on complex turns.
 */
export function classifyChatTurnIntent(
  text: string,
  opts: { hasDeckContext?: boolean; hasChatHistory?: boolean } = {},
): ChatTurnIntent {
  const q = String(text || "").trim();
  if (!q) return "empty";
  if (isDecklist(q)) return "decklist_paste";
  if (isDeckEditFollowup(q) && opts.hasChatHistory) return "deck_edit_followup";
  if (isDeckAnalysisRequest(q)) return "deck_analysis";
  if (isSimpleRulesOrTerm(q)) return "rules_question";
  if (/\b(legal|legality|banned|restricted|not legal)\b/i.test(q)) return "legality_question";
  if (/\b(price|worth|cost|market)\b/i.test(q)) return "price_question";
  if (isManaTapFaq(q)) return "faq";
  if (isClearlyNonMTG(q) && !opts.hasChatHistory) return "off_topic";
  return "general_mtg";
}

export type Layer0DecideArgs = {
  text: string;
  hasDeckContext: boolean;
  deckCardCount?: number | null;
  isAuthenticated: boolean;
  route: "chat" | "chat_stream" | "deck_analyze";
  /** When true, prefer MINI_ONLY unless request clearly needs FULL_LLM. Pro users are exempt. */
  nearBudgetCap?: boolean;
  /** When true, skip nearBudgetCap downgrade (Pro always gets FULL_LLM). */
  isPro?: boolean;
  /** When true, skip off-topic gate (short corrections like "no it's chatterfang" are MTG follow-ups). */
  hasChatHistory?: boolean;
  /** Recent messages used only by the low-cost OpenAI intent classifier. */
  chatHistory?: ChatHistoryEntry[];
};

const MINI_MODEL = (typeof process !== "undefined" && (process.env.MODEL_GUEST || "").trim()) || DEFAULT_FALLBACK_MODEL;
export const LOWEST_INTENT_MODEL = MINI_MODEL;
// No reply shortening: allow full-length responses for all tiers
const MINI_CEILING_TIGHT = 16384;
const MINI_CEILING_NORMAL = 16384;

/**
 * True if the user is asking for deck analysis/improvement/suggestions (needs deck context).
 */
export function isDeckAnalysisRequest(text: string): boolean {
  const q = (text || "").toLowerCase().trim();
  const patterns = [
    /\b(analy[sz]e|analysis|improve|upgrade|optimi[sz]e|review)\s+(my\s+|this\s+)?(deck|list)\b/i,
    /\b(analy[sz]e|analysis|improve|upgrade|optimi[sz]e|review)\s+(my\s+|this\s+)?(?:commander|standard|modern|pioneer|pauper|legacy|vintage|brawl|historic)\s+(deck|list)\b/i,
    /\b(analy[sz]e|review|rate|check)\s+(this|my|the)\s*[:\-]?\s*$/i,
    /\b(analy[sz]e|review|rate|check)\s+(this|my|the)\s*[:\-]?\s*\n/i,
    /\b(health check|quick take|rate this deck|deck look|weakness|weaknesses|biggest issue|missing)\b/i,
    /\b(roast)\s+(my\s+|this\s+)?(deck|list)\b/i,
    /\b(what'?s? wrong|what is wrong)\s+(with\s+)?(my\s+)?(deck|list)\b/i,
    /\bwhat\s+(?:is|are)\s+(this\s+)?(?:deck|list)\s+missing\b/i,
    /\bsuggest\s+(swap|card|upgrade)s?\b/i,
    /\bbudget\s+swap|swap\s+suggestions\b/i,
    /\bmana\s+curve\b/i,
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

/** MTG-related keywords; if the message has none of these, we treat as off-topic when combined with no FAQ match. */
const MTG_SCOPE_KEYWORDS = [
  'mtg', 'magic', 'commander', 'edh', 'deck', 'card', 'mana', 'planeswalker',
  'creature', 'sorcery', 'instant', 'artifact', 'enchantment', 'land',
  'standard', 'modern', 'pioneer', 'pauper', 'legacy', 'vintage', 'brawl', 'historic', 'arena',
  'alchemy', 'explorer', 'oathbreaker', 'cedh', 'pauper edh', 'pedh',
  'trample', 'flying', 'lifelink', 'vigilance', 'first strike', 'double strike', 'hexproof', 'ward', 'sol ring',
  'token', 'treasure', 'clue', 'food', 'replacement effect', 'triggered ability', 'activated ability', 'chatterfang', 'doubling season',
  'format', 'brew', 'list', 'add', 'remove', 'cut', 'replace', 'swap', 'apply', 'undo', 'cancel', 'ramp', 'draw', 'removal', 'combo', 'synergy', 'suggest', 'improve',
  'health check', 'quick take', 'missing', 'weakness', 'weaknesses', 'issue', 'roast', 'curve', 'sideboard',
  '[[', 'banned', 'legal', 'cedh', 'wotc', 'scryfall', 'tcg', 'edhrec',
];

export function isDeckEditFollowup(text: string): boolean {
  const q = (text || "").trim();
  return /^(?:please\s+)?(?:add|remove|cut|swap|replace)\b/i.test(q)
    || /^(?:apply|undo|cancel|make those changes|do it|yes apply)\b/i.test(q);
}

/**
 * True if the message contains no MTG-related keyword (conservative: used with FAQ check for off-topic).
 */
export function hasNoMTGKeyword(text: string): boolean {
  const q = (text || '').toLowerCase().trim();
  if (q.length < 12) return false; // avoid flagging "hi" / "thanks"
  return !MTG_SCOPE_KEYWORDS.some((kw) => q.includes(kw.toLowerCase()));
}

/**
 * True if the message is clearly off-topic (non-MTG). FAQ matches are not off-topic.
 */
export function isClearlyNonMTG(text: string): boolean {
  return getFaqAnswer(text) === null && hasNoMTGKeyword(text);
}

/**
 * True if the user is asking for something that requires a deck but hasDeckContext is false.
 */
export function needsDeckButMissing(text: string, hasDeckContext: boolean): boolean {
  if (hasDeckContext) return false;
  const q = (text || "").toLowerCase().trim();
  if (!isDeckAnalysisRequest(text)) return false;

  // Only short-circuit when the user points at a concrete missing object.
  // Broad strategy prompts ("weaknesses in Modern Burn", "Pioneer graveyard hate",
  // "precon upgrades") should go to the LLM so it can answer generally first,
  // then invite a list for exact ADD/CUT swaps.
  const concreteMissingObjectPatterns = [
    /\b(analy[sz]e|review|rate|check|improve|upgrade|optimi[sz]e)\s+(my|this|the)\s+(deck|list)\b/,
    /\bwhat'?s?\s+(?:wrong|missing)\s+(?:with\s+)?(?:my|this|the)\s+(deck|list)\b/,
    /\bwhy\s+does\s+(?:my|this|the)\s+(deck|list)\s+feel\b/,
    /\b(?:help\s+me\s+)?cut\s+\d+\s+cards?\s+from\s+(?:this|my|the)\s+(?:commander\s+)?(?:deck|list)\b/,
    /\bwhat'?s?\s+the\s+win\s+condition\s+of\s+(?:this|my|the)\s+(deck|list)\b/,
    /\bsummarize\s+(?:my|this|the)\s+(deck|list)['’]s?\s+gameplan\b/,
    /\bpower\s+level\s+of\s+(?:this|my|the)\s+(?:commander\s+)?(?:deck|list)\b/,
    /\bgive\s+me\s+a\s+\d+[- ]?step\s+upgrade\s+path\s+for\s+(?:this|my|the)\s+(deck|list)\b/,
    /\broast\s+(?:my|this|the)\s+(deck|list)\b/,
    /\bshould\s+i\s+mulligan\s+(?:this|my|the)\s+hand\b/,
    /\bturn\s+(?:this|my|the)\s+.+deck\s+into\s+.+fnm\b/,
    /\bwhat\s+cards?\s+should\s+i\s+remove\b.*\binfinite combos\b/,
  ];
  return concreteMissingObjectPatterns.some((re) => re.test(q));
}

/**
 * Layer 0 classification. Deterministic, explainable.
 */
export function layer0Decide(args: Layer0DecideArgs): Layer0Decision {
  const { text, hasDeckContext, isAuthenticated, route, nearBudgetCap, isPro, hasChatHistory } = args;
  const q = (text || "").trim();
  const qLower = q.toLowerCase();

  // 1. Empty / whitespace
  if (!q) {
    return { mode: "NO_LLM", reason: "empty_input", handler: "need_more_info" };
  }

  if (hasDeckContext && isDeckEditFollowup(q)) {
    return { mode: "FULL_LLM", reason: "deck_edit_or_deck_card_command" };
  }

  // 2. Needs deck but missing → ask for deck link or paste
  if (needsDeckButMissing(text, hasDeckContext)) {
    return { mode: "NO_LLM", reason: "needs_deck_no_context", handler: "need_more_info" };
  }

  // 3. ManaTap FAQ → static answer
  if (isManaTapFaq(text)) {
    return { mode: "NO_LLM", reason: "static_faq_match", handler: "static_faq" };
  }

  // 3.5. Clearly non-MTG (no FAQ match, no MTG keywords) → scope gate
  // No chat history: return off_topic. With history: use mini AI to decide (handlers off-topic vs MTG-related)
  if (isClearlyNonMTG(text)) {
    if (!hasChatHistory) {
      return { mode: "NO_LLM", reason: "off_topic", handler: "off_topic" };
    }
    return { mode: "NO_LLM", reason: "off_topic_ai_check", handler: "off_topic_ai_check" };
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

  // 5. Near budget cap → prefer MINI unless clearly FULL_LLM (deck + complex/long-answer). Pro exempt.
  if (nearBudgetCap && !isPro) {
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

  // 6. Deck analysis / pasted list / explicit analyse → FULL_LLM (never MINI or canned shortcuts)
  const intent = classifyChatTurnIntent(text, { hasDeckContext, hasChatHistory });
  if (
    intent === "deck_analysis" ||
    intent === "decklist_paste" ||
    (hasDeckContext && (isDeckAnalysisRequest(text) || isLongAnswerRequest(text)))
  ) {
    return { mode: "FULL_LLM", reason: intent === "decklist_paste" ? "decklist_paste" : "deck_context_complex_or_long" };
  }

  // 7. Simple one-liner, no deck (e.g. "best commander for zombies?") → MINI_ONLY (keep short so long queries get FULL_LLM)
  if (!hasDeckContext && q.length < 80 && !isDeckAnalysisRequest(text)) {
    const looksSimple = !/\b(analyze|improve|suggest|optimize|synergy|strategy|combo|engine|sideboard|graveyard|upgrade|staple|meme|build|budget replacement)\b/i.test(qLower);
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

/** Chat history entry for off-topic AI check */
export type ChatHistoryEntry = { role: string; content: string };

export type OpenAIIntentResult = {
  intent: ChatTurnIntent;
  confidence: number;
  needsDeckContext: boolean;
  shouldUseFullLlm: boolean;
  reason?: string;
};

const OPENAI_INTENTS: ReadonlySet<ChatTurnIntent> = new Set([
  "deck_analysis",
  "deck_edit_followup",
  "decklist_paste",
  "commander_confirmation",
  "rules_question",
  "legality_question",
  "price_question",
  "format_question",
  "memory_recall",
  "general_mtg",
  "faq",
  "off_topic",
  "empty",
]);

function clampConfidence(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function parseOpenAIIntentJson(text: string): OpenAIIntentResult | null {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const jsonText = raw.startsWith("{") ? raw : raw.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const intent = String(parsed.intent || "").trim() as ChatTurnIntent;
    if (!OPENAI_INTENTS.has(intent)) return null;
    return {
      intent,
      confidence: clampConfidence(parsed.confidence),
      needsDeckContext: parsed.needsDeckContext === true,
      shouldUseFullLlm: parsed.shouldUseFullLlm === true,
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 160) : undefined,
    };
  } catch {
    return null;
  }
}

function recentHistoryForIntent(history: ChatHistoryEntry[] | undefined): Array<{ role: string; content: string }> {
  return (history || [])
    .slice(-6)
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").slice(0, 700),
    }))
    .filter((m) => m.content.trim().length > 0);
}

export function shouldUseOpenAIIntentClassifier(args: Layer0DecideArgs, baseDecision: Layer0Decision): boolean {
  const q = String(args.text || "").trim();
  if (!q || q.length < 2) return false;
  if (isDecklist(q)) return false;

  const hasConversationContext = !!args.hasDeckContext || !!args.hasChatHistory || recentHistoryForIntent(args.chatHistory).length > 0;
  if (baseDecision.mode === "NO_LLM") {
    return baseDecision.handler === "off_topic_ai_check" && hasConversationContext;
  }

  if (hasConversationContext) return true;

  // No context: only ask the intent model for longer ambiguous general turns, not cheap rules/card one-liners.
  return baseDecision.mode === "FULL_LLM" && baseDecision.reason === "default";
}

export function applyOpenAIIntentDecision(
  baseDecision: Layer0Decision,
  aiIntent: OpenAIIntentResult | null,
  args: Layer0DecideArgs,
): Layer0Decision {
  if (!aiIntent || aiIntent.confidence < 0.62) return baseDecision;

  const hasConversationContext = !!args.hasDeckContext || !!args.hasChatHistory || recentHistoryForIntent(args.chatHistory).length > 0;
  const reason = `openai_intent_${aiIntent.intent}`;

  if (
    aiIntent.intent === "deck_analysis" ||
    aiIntent.intent === "deck_edit_followup" ||
    aiIntent.intent === "decklist_paste" ||
    aiIntent.intent === "memory_recall" ||
    aiIntent.intent === "commander_confirmation" ||
    aiIntent.shouldUseFullLlm
  ) {
    if (hasConversationContext || aiIntent.intent !== "commander_confirmation") {
      return { mode: "FULL_LLM", reason };
    }
  }

  if (
    !args.hasDeckContext &&
    (aiIntent.intent === "rules_question" ||
      aiIntent.intent === "legality_question" ||
      aiIntent.intent === "price_question" ||
      aiIntent.intent === "format_question") &&
    aiIntent.confidence >= 0.72
  ) {
    return {
      mode: "MINI_ONLY",
      reason,
      model: LOWEST_INTENT_MODEL,
      max_tokens: MINI_CEILING_NORMAL,
    };
  }

  if (!hasConversationContext && aiIntent.intent === "off_topic" && aiIntent.confidence >= 0.88) {
    return { mode: "NO_LLM", reason, handler: "off_topic" };
  }

  return baseDecision;
}

export async function classifyChatTurnIntentWithOpenAI(args: Layer0DecideArgs): Promise<OpenAIIntentResult | null> {
  const text = String(args.text || "").trim();
  if (!text) return null;

  const payload = {
    latestMessage: text.slice(0, 3000),
    hasDeckContext: !!args.hasDeckContext,
    deckCardCount: args.deckCardCount ?? null,
    hasChatHistory: !!args.hasChatHistory || recentHistoryForIntent(args.chatHistory).length > 0,
    route: args.route,
    recentHistory: recentHistoryForIntent(args.chatHistory),
  };

  const prompt = `You are ManaTap's cheap intent classifier for an MTG chat route.
Classify only the user's latest turn. Do not answer the user.

Intent labels:
- deck_analysis: user wants analysis, upgrades, cuts, mana base review, sideboard help, or strategy for a deck/list.
- deck_edit_followup: user asks to add, cut, replace, apply, undo, or revise deck changes.
- decklist_paste: latest message is mostly a pasted decklist.
- commander_confirmation: user confirms/corrects an inferred Commander commander.
- rules_question: MTG rules or keyword explanation.
- legality_question: format legality, banned/restricted, color identity, commander legality.
- price_question: card/deck price, worth, market cost.
- format_question: asks about Commander, Standard, Modern, Pioneer, Pauper, Legacy, Vintage, Brawl, Historic, Explorer, Alchemy, or other MTG format structure.
- memory_recall: asks what you remember or refers to prior saved/thread facts.
- general_mtg: MTG topic that does not fit the above.
- faq: asks how to use ManaTap itself.
- off_topic: unrelated to MTG or ManaTap.
- empty: no real user content.

Return JSON only:
{"intent":"deck_analysis","confidence":0.0,"needsDeckContext":false,"shouldUseFullLlm":false,"reason":"short reason"}

Routing rule: choose shouldUseFullLlm=true when the answer needs reasoning over deck context, chat history, memory, or ambiguous user intent. Choose false for simple standalone rules/format/price questions.`;

  try {
    const { callLLM } = await import("./unified-llm-client");
    const res = await callLLM(
      [
        { role: "system", content: prompt },
        { role: "user", content: JSON.stringify(payload) },
      ],
      {
        model: LOWEST_INTENT_MODEL,
        maxTokens: 180,
        route: "/api/chat/intent",
        feature: "chat_intent_classifier",
        apiType: "chat",
        userId: null,
        isPro: false,
        timeout: 10000,
        jsonResponse: true,
        skipRecordAiUsage: true,
      }
    );
    return parseOpenAIIntentJson(res.text);
  } catch {
    return null;
  }
}

export async function layer0DecideWithIntent(args: Layer0DecideArgs): Promise<Layer0Decision> {
  const baseDecision = layer0Decide(args);
  if (!shouldUseOpenAIIntentClassifier(args, baseDecision)) return baseDecision;
  const aiIntent = await classifyChatTurnIntentWithOpenAI(args);
  return applyOpenAIIntentDecision(baseDecision, aiIntent, args);
}

/**
 * Async mini-model check: given chat history and current message, is the user's message OFF_TOPIC or MTG_RELATED?
 * Returns true if off-topic (should gate), false if MTG-related (proceed to LLM).
 * On error, returns false (proceed) to avoid blocking valid corrections.
 */
export async function layer0OffTopicAICheck(
  text: string,
  chatHistory: ChatHistoryEntry[]
): Promise<boolean> {
  const recent = chatHistory.slice(-8);
  if (recent.length === 0) return true;

  const conv = recent
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${(m.content || "").slice(0, 300)}`)
    .join("\n");
  const prompt = `You are a classifier for an MTG deck-building chat. Given this conversation and the user's latest message, decide:
- OFF_TOPIC: The user's message is clearly unrelated to MTG, deckbuilding, or the ongoing deck discussion (e.g. weather, movies, general chat).
- MTG_RELATED: The message IS related—e.g. commander corrections ("no it's chatterfang"), confirmations ("yes", "correct"), card names, short follow-ups about the deck, or any MTG content.

Conversation:
${conv}

User's latest message: ${(text || "").trim()}

Reply with exactly one word: OFF_TOPIC or MTG_RELATED`;

  try {
    const { callLLM } = await import("./unified-llm-client");
    const res = await callLLM(
      [{ role: "user", content: prompt }],
      {
        model: MINI_MODEL,
        maxTokens: 16,
        route: "/api/chat/stream",
        feature: "layer0_off_topic_check",
        apiType: "chat",
        userId: null,
        isPro: false,
        skipRecordAiUsage: true,
      }
    );
    const out = (res.text || "").toUpperCase().trim();
    return out.includes("OFF_TOPIC") && !out.includes("MTG_RELATED");
  } catch {
    return false; // On error: proceed (don't gate)
  }
}
