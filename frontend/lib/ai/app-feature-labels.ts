/**
 * Human labels for stable app `source_page` keys (mobile). Only keys that match real app AI flows.
 * Unknown keys: show raw key in admin UI.
 */
export const APP_FEATURE_PAGE_LABELS: Record<string, string> = {
  app_chat_thread: "Main chat (full screen)",
  app_chat_guest: "Guest chat",
  app_deck_chat_modal: "Deck chat modal",
  app_home_chat: "Home chat",
  app_deck_analyze: "Analyze deck",
  app_compare_ai: "Deck compare (AI)",
  app_scan_ai_fallback: "Scan — AI image fallback",
  app_mulligan_advice: "Mulligan advice",
  app_budget_swaps: "Budget swaps",
  app_generate_from_collection: "Generate from collection",
  app_deck_roast: "Deck roast",
  app_swap_why: "Swap explanation",
  app_chat_voice: "Chat — voice",
};

export function getAppFeaturePageLabel(sourcePage: string | null | undefined): string {
  const k = sourcePage?.trim() ?? "";
  if (!k) return "—";
  return APP_FEATURE_PAGE_LABELS[k] ?? k;
}
