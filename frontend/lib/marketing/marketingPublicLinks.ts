/** Canonical public URLs for audience-facing draft CTAs (website now; app via /get when ready). */
export const MARKETING_SITE_BASE =
  String(process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.manatap.ai").replace(
    /\/$/,
    ""
  );

export const MARKETING_PUBLIC_LINKS = {
  home: `${MARKETING_SITE_BASE}/`,
  pricing: `${MARKETING_SITE_BASE}/pricing`,
  getApp: `${MARKETING_SITE_BASE}/get`,
  buildDeck: `${MARKETING_SITE_BASE}/build-a-deck`,
  aiDeckBuilder: `${MARKETING_SITE_BASE}/mtg-ai-deck-builder`,
  budgetSwaps: `${MARKETING_SITE_BASE}/budget-swaps`,
  mulligan: `${MARKETING_SITE_BASE}/commander-mulligan-calculator`,
  deckChecker: `${MARKETING_SITE_BASE}/mtg-deck-checker`,
  analyzeDeck: `${MARKETING_SITE_BASE}/analyze`,
  compareDecks: `${MARKETING_SITE_BASE}/compare-decks`,
  collections: `${MARKETING_SITE_BASE}/collections`,
  meta: `${MARKETING_SITE_BASE}/meta`,
  commanders: `${MARKETING_SITE_BASE}/commanders`,
  blog: `${MARKETING_SITE_BASE}/blog`,
  tools: `${MARKETING_SITE_BASE}/tools`,
} as const;

export type MarketingLinkKey = keyof typeof MARKETING_PUBLIC_LINKS;

/** For LLM prompt — topic → best landing page. */
export function marketingLinkCatalogForPrompt(): Record<string, string> {
  return {
    general_brand: MARKETING_PUBLIC_LINKS.home,
    deck_building_ai: MARKETING_PUBLIC_LINKS.aiDeckBuilder,
    build_a_deck: MARKETING_PUBLIC_LINKS.buildDeck,
    budget_upgrades: MARKETING_PUBLIC_LINKS.budgetSwaps,
    mulligan: MARKETING_PUBLIC_LINKS.mulligan,
    deck_legality_check: MARKETING_PUBLIC_LINKS.deckChecker,
    analyze_deck: MARKETING_PUBLIC_LINKS.analyzeDeck,
    roast_deck: MARKETING_PUBLIC_LINKS.tools,
    compare_decks: MARKETING_PUBLIC_LINKS.compareDecks,
    collection_tracking: MARKETING_PUBLIC_LINKS.collections,
    meta_trends: MARKETING_PUBLIC_LINKS.meta,
    commander_pages: MARKETING_PUBLIC_LINKS.commanders,
    pricing_pro: MARKETING_PUBLIC_LINKS.pricing,
    mobile_app: MARKETING_PUBLIC_LINKS.getApp,
    long_form_blog: MARKETING_PUBLIC_LINKS.blog,
  };
}

export function hasManaTapPublicLink(content: string): boolean {
  const base = MARKETING_SITE_BASE.replace(/^https?:\/\//, "").toLowerCase();
  return content.toLowerCase().includes(base) || /manatap\.ai/i.test(content);
}
