/**
 * Canonical deck format keys for ManaTap APIs (Commander + 60-card constructed).
 * Keep in sync with mobile `normalizeDeckFormat` / `DECK_FORMATS`.
 */

export const MANATAP_DECK_FORMAT_KEYS = ["commander", "modern", "pioneer", "standard", "pauper"] as const;
export type ManatapDeckFormatKey = (typeof MANATAP_DECK_FORMAT_KEYS)[number];

/** Default `commander` when missing or unknown — preserves website + mobile compatibility. */
export function normalizeManatapDeckFormatKey(raw: unknown): ManatapDeckFormatKey {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!s) return "commander";
  if (s === "edh" || s === "cedh") return "commander";
  if ((MANATAP_DECK_FORMAT_KEYS as readonly string[]).includes(s)) return s as ManatapDeckFormatKey;
  return "commander";
}

export function isCommanderFormatKey(k: ManatapDeckFormatKey): boolean {
  return k === "commander";
}

/** Title-case label for prompts (Commander, Modern, …). */
export function formatKeyToDisplayTitle(k: ManatapDeckFormatKey): string {
  return k.charAt(0).toUpperCase() + k.slice(1);
}
