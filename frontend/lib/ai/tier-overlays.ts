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

/** Hardcoded defaults when no DB override is set. */
export const TIER_OVERLAY_DEFAULTS: Record<TierOverlay, string> = {
  guest: `=== TIER: GUEST (strict) ===
Prioritize correctness over creativity. Do not infer archetypes unless strongly supported by the decklist. If mixed signals, describe as hybrid instead of forcing a theme. Never assume aristocrats without clear sac outlets + payoffs; never assume spellslinger without enough noncreature spell density. Never recommend off-color cards. Give fewer, higher-confidence recommendations.`,
  free: `=== TIER: FREE (balanced) ===
Balanced default experience. Moderate archetype inference allowed. Identify hybrid plans when supported by the decklist. Make practical, well-justified recommendations. You may suggest trimming weak subthemes when clearly justified, but prioritize correctness and legality over ambitious pivots.`,
  pro: `=== TIER: PRO (deeper analysis) ===
Apply deeper reasoning and stronger structural analysis. Identify hidden engines and subtheme tension. You may recommend more confident consolidation around the strongest plan. Sharper upgrades and clearer pivots are allowed when well-supported. Stay fully grounded in the decklist and legality.`,
};

/**
 * Returns tier-specific overlay text (hardcoded defaults).
 * Empty if disabled or tier invalid.
 * Use getTierOverlayResolved when you have DB access to check app_config overrides.
 */
export function getTierOverlay(tier: TierOverlay): string {
  if (isOverlaysDisabled()) return "";
  const text = TIER_OVERLAY_DEFAULTS[tier] ?? "";
  return typeof text === "string" ? text.trim() : "";
}

/**
 * Returns overlay text, checking app_config first, then falling back to hardcoded default.
 * Call this from API routes that have supabase/admin access.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getTierOverlayResolved(db: any, tier: TierOverlay): Promise<string> {
  if (isOverlaysDisabled()) return "";
  try {
    const { data } = await db.from("app_config").select("value").eq("key", `tier_overlay_${tier}`).maybeSingle();
    const val = data as { value?: { body?: string } } | null;
    const body = val?.value?.body;
    if (typeof body === "string" && body.trim()) return body.trim();
  } catch (_) {}
  return getTierOverlay(tier);
}
