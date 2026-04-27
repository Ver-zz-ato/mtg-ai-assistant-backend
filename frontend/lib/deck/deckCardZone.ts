/**
 * Per-row zone for `deck_cards.zone` (Phase 1).
 * App-enforced; valid values: mainboard | sideboard | commander
 */

export type DeckCardZone = "mainboard" | "sideboard" | "commander";

const VALID = new Set<string>(["mainboard", "sideboard", "commander"]);

export function normalizeDeckCardZone(z: string | null | undefined): DeckCardZone {
  const s = String(z || "mainboard").trim().toLowerCase();
  if (s === "main") return "mainboard";
  if (s === "side" || s === "sb") return "sideboard";
  if (s === "cmd" || s === "command") return "commander";
  if (VALID.has(s)) return s as DeckCardZone;
  return "mainboard";
}
