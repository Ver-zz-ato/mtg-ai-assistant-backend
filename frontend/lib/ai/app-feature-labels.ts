/**
 * Human labels for stable app `source_page` keys (mobile). Only keys that match real app AI flows.
 * Unknown keys: show raw key in admin UI.
 */
export const APP_FEATURE_PAGE_LABELS: Record<string, string> = {
  app_chat_thread: "Main chat (full screen)",
  app_chat_guest: "Guest chat",
  app_deck_chat_modal: "Deck chat modal",
  app_home_chat: "Home chat",
  app_deck_analyze: "Check deck",
  app_compare_ai: "Deck compare (AI)",
  app_scan_ai_fallback: "Scan — AI image fallback",
  app_scan_ai_improve: "Scan - Improve with AI",
  app_mulligan_advice: "Mulligan advice",
  app_budget_swaps: "Budget swaps",
  app_generate_from_collection: "Generate from collection",
  app_deck_roast: "Deck roast",
  app_swap_why: "Swap explanation",
  app_chat_voice: "Chat — voice",
  app_card_explain: "Card explain",
  app_deck_health_scan: "AI deck scan",
  app_build_constructed_ai: "Build constructed (AI)",
  app_collection_constructed_ideas: "Collection constructed ideas",
  deck_analysis: "Deck check",
  deck_analyzer_suggestion: "Deck checker suggestion",
  chat_correction: "Chat correction",
  web_chat_thread: "Web chat",
};

export function getAppFeaturePageLabel(sourcePage: string | null | undefined): string {
  const k = sourcePage?.trim() ?? "";
  if (!k) return "—";
  return APP_FEATURE_PAGE_LABELS[k] ?? k;
}
