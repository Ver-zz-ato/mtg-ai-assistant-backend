/**
 * Maps AI route/feature names to where they're used on the website.
 * Used for admin usage dashboard to show "Called from: X" context.
 */
export const ROUTE_TO_PAGE: Record<string, { page: string; description: string; apiPath?: string }> = {
  chat_stream: { page: "Chat (streaming)", description: "ManaTap AI chat in deck builder, deck page, or homepage", apiPath: "/api/chat/stream" },
  chat: { page: "Chat (non-stream)", description: "Legacy chat or batch requests", apiPath: "/api/chat" },
  deck_analyze: { page: "Deck Analyze", description: "Full deck analysis (suggestions, whats good, quick fixes)", apiPath: "/api/deck/analyze" },
  deck_analyze_slot_planning: { page: "Deck Analyze (slot planning)", description: "Two-stage: slot planning phase", apiPath: "/api/deck/analyze" },
  deck_analyze_slot_candidates: { page: "Deck Analyze (slot candidates)", description: "Two-stage: slot candidates phase", apiPath: "/api/deck/analyze" },
  swap_why: { page: "Budget Swap Why", description: "Why a specific swap was suggested", apiPath: "/api/deck/swap-why" },
  swap_suggestions: { page: "Budget Swaps", description: "Cost to finish / budget swap suggestions", apiPath: "/api/deck/swap-suggestions" },
  suggestion_why: { page: "Suggestion Why", description: "Why a card was suggested", apiPath: "/api/deck/suggestion-why" },
  health_suggestions: { page: "Deck Health", description: "Deck health suggestions", apiPath: "/api/deck/health-suggestions" },
  deck_scan: { page: "Deck Health / Scan", description: "Deck health suggestions (AI deck scan)", apiPath: "/api/deck/health-suggestions" },
  deck_compare: { page: "Deck Compare", description: "Compare two decks", apiPath: "/api/deck/compare-ai" },
  reprint_risk: { page: "Reprint Risk", description: "Card reprint risk analysis", apiPath: "/api/cards/reprint-risk" },
  debug_ping: { page: "Admin AI Health", description: "Admin probe/ping", apiPath: "/api/admin/ai/health" },
  "/api/chat/stream": { page: "Chat", description: "Streaming chat API", apiPath: "/api/chat/stream" },
  "/api/chat": { page: "Chat", description: "Non-streaming chat API", apiPath: "/api/chat" },
  "/api/deck/analyze": { page: "Deck Analyze", description: "Deck analysis API", apiPath: "/api/deck/analyze" },
  "/api/deck/swap-suggestions": { page: "Budget Swaps", description: "Swap suggestions API", apiPath: "/api/deck/swap-suggestions" },
  "/api/deck/swap-why": { page: "Swap Why", description: "Swap explanation API", apiPath: "/api/deck/swap-why" },
  "/api/deck/suggestion-why": { page: "Suggestion Why", description: "Suggestion explanation API", apiPath: "/api/deck/suggestion-why" },
  "/api/deck/health-suggestions": { page: "Deck Health", description: "Health suggestions API", apiPath: "/api/deck/health-suggestions" },
  "/api/deck/compare-ai": { page: "Deck Compare", description: "Deck compare API", apiPath: "/api/deck/compare-ai" },
  "/api/cards/reprint-risk": { page: "Reprint Risk", description: "Reprint risk API", apiPath: "/api/cards/reprint-risk" },
  "/api/admin/ai/health": { page: "Admin Health", description: "Admin AI health probe", apiPath: "/api/admin/ai/health" },
};

export function getRouteContext(route: string | null | undefined): { page: string; description: string } | null {
  if (!route) return null;
  const r = route.trim();
  const info = ROUTE_TO_PAGE[r];
  if (info) return { page: info.page, description: info.description };
  return { page: r, description: `API route or feature: ${r}` };
}
