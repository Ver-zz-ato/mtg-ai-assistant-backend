/**
 * Static FAQ for Layer 0 NO_LLM responses.
 * Pattern → answer map for common ManaTap app questions. Kept small and consistent.
 */

export type FaqEntry = { patterns: RegExp[]; answer: string };

const FAQ: FaqEntry[] = [
  {
    patterns: [
      /how\s+do\s+i\s+link\s+(a\s+)?deck\s+to\s+chat/i,
      /link\s+(a\s+)?deck\s+to\s+chat/i,
      /how\s+to\s+link\s+deck/i,
      /link\s+.*\bdeck\b.*chat/i, // permissive: "link ... deck ... chat"
    ],
    answer:
      "To link a deck to chat: open your deck, then start or open a chat. Use the deck selector or 'Link deck' in the chat header to attach the current deck. The AI will use that deck for analysis and suggestions.",
  },
  {
    patterns: [
      /how\s+do\s+i\s+paste\s+(a\s+)?decklist/i,
      /paste\s+(a\s+)?decklist/i,
      /how\s+to\s+paste\s+deck/i,
    ],
    answer:
      "Paste your decklist directly into the chat (one line per card, e.g. '1 Sol Ring'). The AI will detect it and use it for that conversation. You can paste from Arena, Moxfield, or any list.",
  },
  {
    patterns: [
      /what\s+does\s+['\"]?budget\s+swap/i,
      /what\s+is\s+budget\s+swap/i,
      /budget\s+swap\s+do\s+what/i,
    ],
    answer:
      "Budget Swaps suggests cheaper alternatives for cards in your deck. It uses your deck context and any budget preference you set to recommend lower-cost options.",
  },
  {
    patterns: [
      /why\s+does\s+(the\s+)?(ai|assistant)\s+refuse\s+when\s+budget\s+cap/i,
      /budget\s+(cap|limit)\s+hit/i,
      /ai\s+budget\s+limit\s+reached/i,
    ],
    answer:
      "When the AI budget cap is reached, the app stops new AI requests to control costs. Cached answers and deterministic responses still work. An admin can adjust or disable the cap in app_config (llm_budget).",
  },
  {
    patterns: [
      /what\s+is\s+deck\s*context\s*summary/i,
      /what\s+is\s+deckcontextsummary/i,
    ],
    answer:
      "DeckContextSummary is a compact summary of your deck (curve, ramp, removal, card names, etc.) that the AI uses instead of the full list. It saves tokens and keeps answers focused.",
  },
  {
    patterns: [
      /how\s+do\s+i\s+(use\s+)?(the\s+)?chat/i,
      /how\s+does\s+chat\s+work/i,
    ],
    answer:
      "Type your question or paste a decklist. You can ask about cards, rules, or link a deck for analysis and suggestions. Use the deck selector to attach a saved deck.",
  },
  {
    patterns: [
      /what\s+does\s+this\s+button\s+do/i,
      /what\s+do\s+these\s+buttons\s+do/i,
    ],
    answer:
      "Buttons in chat usually let you link a deck, change format, or run quick actions (e.g. Budget Swaps). Hover or tap for tooltips. The deck selector attaches a saved deck to the conversation.",
  },
  {
    patterns: [
      /how\s+do\s+i\s+analyze\s+(my\s+)?deck/i,
      /how\s+to\s+get\s+deck\s+analysis/i,
    ],
    answer:
      "Link a deck to chat or paste your list, then ask things like 'analyze my deck', 'what's wrong with this list', or 'suggest improvements'. The AI uses your deck context to give tailored advice.",
  },
  {
    patterns: [
      /where\s+(do\s+i\s+)?(paste|put)\s+(my\s+)?deck/i,
      /where\s+to\s+paste\s+decklist/i,
    ],
    answer:
      "Paste your decklist directly into the chat message box. One card per line (e.g. '1 Sol Ring'). The AI will detect it and use it for that thread.",
  },
  {
    patterns: [
      /what\s+formats?\s+(do\s+you\s+)?support/i,
      /supported\s+formats?/i,
    ],
    answer:
      "ManaTap supports Commander, Modern, and Pioneer. Set your format in chat preferences or link a deck; the AI will respect that format for legality and suggestions.",
  },
];

/**
 * Return the FAQ answer for a query if any pattern matches, else null.
 */
export function getFaqAnswer(text: string): string | null {
  const t = (text || "").trim();
  for (const entry of FAQ) {
    if (entry.patterns.some((re) => re.test(t))) return entry.answer;
  }
  return null;
}

/**
 * Return all FAQ patterns (for tests or debugging).
 */
export function getFaqPatterns(): FaqEntry[] {
  return FAQ;
}
