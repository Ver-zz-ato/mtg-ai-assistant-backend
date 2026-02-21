/**
 * Exact mapping of AI call origins: page, component, trigger, and analysis options.
 * Used by admin ai-usage dashboard for cost attribution and debugging.
 */

export type TriggerType = "auto" | "user_click";

export type CallOrigin = {
  /** Human-readable page/route (e.g. /my-decks/[id]) */
  page: string;
  /** Component file that triggers the call */
  component: string;
  /** How the call is triggered */
  trigger: TriggerType;
  /** Short description */
  description: string;
  /** Cost impact: high = expensive, consider gating or replacing */
  costImpact: "high" | "medium" | "low";
};

/** source_page -> exact origin. Used when source_page is set. */
export const SOURCE_PAGE_ORIGINS: Record<string, CallOrigin> = {
  deck_page_analyze: {
    page: "/my-decks/[id]",
    component: "DeckAnalyzerPanel.tsx",
    trigger: "user_click",
    description: "Deck Analyzer panel → Run button",
    costImpact: "high",
  },
  deck_page_health: {
    page: "/my-decks/[id]",
    component: "Deck page (AI health)",
    trigger: "user_click",
    description: "Deck health / AI scan",
    costImpact: "medium",
  },
  deck_page_legality: {
    page: "/my-decks/[id]",
    component: "LegalityTokensPanel.tsx | BuildAssistantSticky.tsx | LegalityMini.tsx",
    trigger: "user_click",
    description: "Legality & Tokens panel or Build assistant → Check Legality",
    costImpact: "medium",
  },
  deck_page_probability: {
    page: "/my-decks/[id]",
    component: "DeckProbabilityPanel.tsx",
    trigger: "user_click",
    description: "Probability Calculator → Set K from tag (lands/ramp/draw/removal)",
    costImpact: "low",
  },
  deck_analyzer_expandable: {
    page: "/",
    component: "DeckAnalyzerExpandable.tsx (RightSidebar)",
    trigger: "user_click",
    description: "Homepage sidebar → paste decklist + Run",
    costImpact: "high",
  },
  build_assistant: {
    page: "/my-decks/[id]",
    component: "BuildAssistantSticky.tsx",
    trigger: "user_click",
    description: "Build assistant sticky bar → AI action",
    costImpact: "medium",
  },
  profile: {
    page: "/profile",
    component: "Client.tsx (profile)",
    trigger: "auto",
    description: "Profile tab → extra badges (On-Curve 90, Mana Maestro, etc.)",
    costImpact: "medium",
  },
  my_decks_list: {
    page: "/my-decks",
    component: "MyDecksClient.tsx",
    trigger: "auto",
    description: "My Decks list → deck modal (deckId in URL) → health lights",
    costImpact: "medium",
  },
  admin_ai_test: {
    page: "/admin/ai-test",
    component: "Admin AI test suite",
    trigger: "user_click",
    description: "Admin batch/run-eval-set/consistency tests",
    costImpact: "low",
  },
  banned_cards_banner: {
    page: "/my-decks/[id]",
    component: "BannedCardsBanner.tsx",
    trigger: "auto",
    description: "Deck page → banned cards check (now uses non-LLM lookup)",
    costImpact: "low",
  },
  color_identity_banner: {
    page: "/my-decks/[id]",
    component: "ColorIdentityBanner.tsx",
    trigger: "auto",
    description: "Deck page → color identity check (now uses non-LLM batch-metadata)",
    costImpact: "low",
  },
};

/** route -> context when source_page is not set */
export const ROUTE_ORIGINS: Record<string, CallOrigin> = {
  deck_analyze: {
    page: "Various",
    component: "Deck analysis API",
    trigger: "user_click",
    description: "Full deck analysis (suggestions, whats good, quick fixes)",
    costImpact: "high",
  },
  deck_analyze_slot_planning: {
    page: "Internal (deck_analyze flow)",
    component: "app/api/deck/analyze/route.ts",
    trigger: "auto",
    description: "Two-stage: slot planning phase (gpt-4o-mini)",
    costImpact: "low",
  },
  deck_analyze_slot_candidates: {
    page: "Internal (deck_analyze flow)",
    component: "app/api/deck/analyze/route.ts",
    trigger: "auto",
    description: "Two-stage: slot candidates phase (gpt-4o-mini)",
    costImpact: "low",
  },
  chat_stream: {
    page: "Deck page, homepage, deck builder",
    component: "Chat components",
    trigger: "user_click",
    description: "ManaTap AI chat (streaming)",
    costImpact: "high",
  },
  chat: {
    page: "Various",
    component: "Chat (non-stream)",
    trigger: "user_click",
    description: "Legacy chat or batch",
    costImpact: "medium",
  },
  swap_why: {
    page: "/deck/swap-suggestions, etc.",
    component: "Swap flow",
    trigger: "user_click",
    description: "Why a specific swap was suggested",
    costImpact: "low",
  },
  swap_suggestions: {
    page: "/deck/swap-suggestions, etc.",
    component: "Swap flow",
    trigger: "user_click",
    description: "Budget swap suggestions",
    costImpact: "medium",
  },
  suggestion_why: {
    page: "/my-decks/[id]",
    component: "DeckAnalyzerPanel (Why? button)",
    trigger: "user_click",
    description: "Why a card was suggested",
    costImpact: "low",
  },
  health_suggestions: {
    page: "/my-decks/[id]",
    component: "Deck health",
    trigger: "user_click",
    description: "Deck health suggestions",
    costImpact: "medium",
  },
  deck_scan: {
    page: "/my-decks/[id]",
    component: "AIDeckScanModal",
    trigger: "user_click",
    description: "AI deck scan (Build assistant)",
    costImpact: "medium",
  },
  deck_compare: {
    page: "Deck compare",
    component: "Deck compare flow",
    trigger: "user_click",
    description: "Compare two decks",
    costImpact: "medium",
  },
  reprint_risk: {
    page: "Cards / collections",
    component: "Reprint risk flow",
    trigger: "user_click",
    description: "Card reprint risk analysis",
    costImpact: "low",
  },
  debug_ping: {
    page: "/admin",
    component: "Admin AI health",
    trigger: "user_click",
    description: "Admin probe/ping",
    costImpact: "low",
  },
};

export function getCallOrigin(
  route: string | null | undefined,
  sourcePage: string | null | undefined
): CallOrigin | null {
  const src = sourcePage?.trim();
  if (src && SOURCE_PAGE_ORIGINS[src]) {
    return SOURCE_PAGE_ORIGINS[src];
  }
  const r = route?.trim();
  if (r && ROUTE_ORIGINS[r]) {
    return ROUTE_ORIGINS[r];
  }
  return null;
}

/** Display string for admin: page · component when tracked, else "Not tracked" */
export function getCallOriginDisplay(
  route: string | null | undefined,
  sourcePage: string | null | undefined
): string {
  const src = sourcePage?.trim();
  if (src && SOURCE_PAGE_ORIGINS[src]) {
    const o = SOURCE_PAGE_ORIGINS[src];
    return `${o.page} · ${o.component}`;
  }
  if (src) return src; // Unknown source_page, show raw
  // Fall back to route-based origin when source_page is not set
  const r = route?.trim();
  if (r && ROUTE_ORIGINS[r]) {
    const o = ROUTE_ORIGINS[r];
    return `${o.page} · ${o.component}`;
  }
  return "—"; // Not tracked: add sourcePage to API caller
}
