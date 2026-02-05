/**
 * Shared feature daily limits by tier (deck/tools, not chat).
 * Used by API routes for rate limiting. Pro limits are server-only; do not display Pro numbers in user-facing copy.
 */

/** Guest cap for AI features that allow unauthenticated use (swap-suggestions, swap-why, reprint-risk). */
export const GUEST_DAILY_FEATURE_LIMIT = 5;

/** AI Health Scan (deck): free 10/day, Pro 50/day. Route requires auth. */
export const HEALTH_SCAN_FREE = 10;
export const HEALTH_SCAN_PRO = 50;

/** Deck Analyze: guest 5/day, free 20/day, Pro 200/day. */
export const DECK_ANALYZE_GUEST = 5;
export const DECK_ANALYZE_FREE = 20;
export const DECK_ANALYZE_PRO = 200;

/** Budget Swap (AI): free 5/day, Pro 50/day; guests capped by GUEST_DAILY_FEATURE_LIMIT. */
export const SWAP_SUGGESTIONS_FREE = 5;
export const SWAP_SUGGESTIONS_PRO = 50;

/** Swap Why (explain swap): free 10/day, Pro 100/day; guests capped by GUEST_DAILY_FEATURE_LIMIT. */
export const SWAP_WHY_FREE = 10;
export const SWAP_WHY_PRO = 100;

/** Reprint Risk: free 10/day, Pro 100/day; guests capped by GUEST_DAILY_FEATURE_LIMIT. */
export const REPRINT_RISK_FREE = 10;
export const REPRINT_RISK_PRO = 100;

/** Suggestion why (explain recommended card): rate-limit as if public. Free 20/day, Pro 100/day, unauthenticated 10/day. */
export const SUGGESTION_WHY_GUEST = 10;
export const SUGGESTION_WHY_FREE = 20;
export const SUGGESTION_WHY_PRO = 100;

/** Deck Compare AI: Pro-only, 20/day. */
export const DECK_COMPARE_PRO = 20;

/** Deck analyze: max output tokens (ceiling regardless of deck size). */
export const MAX_DECK_ANALYZE_OUTPUT_TOKENS = 1500;

/** Deck analyze: hard cap on deck list character length; over this we truncate and add a note. */
export const MAX_DECK_ANALYZE_DECK_TEXT_CHARS = 30_000;

/** Mulligan Simulator: free 5/day, Pro 50/day. */
export const MULLIGAN_FREE = 5;
export const MULLIGAN_PRO = 50;

/** Probability Tool: free 5/day, Pro 50/day. */
export const PROBABILITY_FREE = 5;
export const PROBABILITY_PRO = 50;

/** Cost to Finish: free 5/day, Pro 50/day. */
export const COST_TO_FINISH_FREE = 5;
export const COST_TO_FINISH_PRO = 50;

/** Price Tracker (deck-series + movers): free 5/day, Pro 50/day. */
export const PRICE_TRACKER_FREE = 5;
export const PRICE_TRACKER_PRO = 50;
