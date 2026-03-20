/**
 * Tier-specific prompt overlays (Guest, Free, Pro).
 * Injected after user level instruction, before v2 context / deck intelligence.
 * Uses MODEL TIER (guest/free/pro), not prompt tier (micro/standard/full).
 * Kill-switch: DISABLE_TIER_OVERLAYS=1
 */

export type TierOverlay = "guest" | "free" | "pro";

function isOverlaysDisabled(): boolean {
  return process.env.DISABLE_TIER_OVERLAYS === "1";
}

/**
 * Returns tier-specific overlay text. Empty if disabled or tier invalid.
 * Keep overlays short (~50–150 tokens each).
 */
export function getTierOverlay(tier: TierOverlay): string {
  if (isOverlaysDisabled()) return "";

  const overlays: Record<TierOverlay, string> = {
    guest: `=== TIER: GUEST (strict) ===
Prioritize correctness over creativity. Do not infer archetypes unless strongly supported by the decklist. If mixed signals, describe as hybrid instead of forcing a theme. Never assume aristocrats without clear sac outlets + payoffs; never assume spellslinger without enough noncreature spell density. Never recommend off-color cards. Give fewer, higher-confidence recommendations.`,
    free: `=== TIER: FREE (balanced) ===
Balanced default experience. Moderate archetype inference allowed. Identify hybrid plans when supported by the decklist. Make practical, well-justified recommendations. You may suggest trimming weak subthemes when clearly justified, but prioritize correctness and legality over ambitious pivots.`,
    pro: `=== TIER: PRO (deeper analysis) ===
Apply deeper reasoning and stronger structural analysis. Identify hidden engines and subtheme tension. You may recommend more confident consolidation around the strongest plan. Sharper upgrades and clearer pivots are allowed when well-supported. Stay fully grounded in the decklist and legality.`,
  };

  const text = overlays[tier] ?? "";
  return typeof text === "string" ? text.trim() : "";
}
