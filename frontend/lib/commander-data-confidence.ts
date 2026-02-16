/**
 * Data confidence derived from decks_tracked.
 * Used to avoid misleading stats (e.g. "100% everywhere") when sample is tiny.
 */

export type DataConfidence = "Early" | "Moderate" | "High";

/** 0–4 = Early, 5–24 = Moderate, 25+ = High */
export function getDataConfidence(decksTracked: number): DataConfidence {
  if (decksTracked < 5) return "Early";
  if (decksTracked < 25) return "Moderate";
  return "High";
}

/** Whether to show percentages in Core Staples (avoid "100% everywhere" when tiny sample) */
export const CORE_STAPLES_PERCENT_THRESHOLD = 10;

export function shouldShowPercentInCoreStaples(decksTracked: number): boolean {
  return decksTracked >= CORE_STAPLES_PERCENT_THRESHOLD;
}

/** Human-readable copy for low sample (do NOT say "not enough data") */
export function getDataConfidenceCopy(confidence: DataConfidence): string {
  switch (confidence) {
    case "Early":
      return "Data confidence: Early sample — trends will sharpen as more decks are tracked.";
    case "Moderate":
      return "Data confidence: Moderate — based on current tracked decks.";
    case "High":
      return "Data confidence: High — strong trends from many decks.";
    default:
      return "";
  }
}
