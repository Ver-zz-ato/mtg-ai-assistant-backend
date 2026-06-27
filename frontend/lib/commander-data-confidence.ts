/**
 * Data confidence derived from ManaTap deck samples.
 * Used to avoid misleading stats when the internal sample is tiny.
 */

export type DataConfidence = "Early" | "Moderate" | "High";

/** 0-4 = Early, 5-24 = Moderate, 25+ = High */
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

/** Human-readable copy for sample confidence */
export function getDataConfidenceCopy(confidence: DataConfidence): string {
  switch (confidence) {
    case "Early":
      return "Data confidence: Early ManaTap sample. Use the global meta signal and external profile where available.";
    case "Moderate":
      return "Data confidence: Moderate, based on current ManaTap deck samples.";
    case "High":
      return "Data confidence: High, with strong trends from many ManaTap decks.";
    default:
      return "";
  }
}
