/**
 * Format compliance for main deck card counts (publish + banners).
 * Uses lib/deck/formatRules.ts as source of truth.
 */

import {
  getFormatRules,
  normalizeDeckFormat,
  isCommanderFormatString,
  type AnalyzeFormat,
} from "@/lib/deck/formatRules";
import { parseDeckTextWithZones } from "@/lib/deck/parseDeckText";

export function getExpectedCount(format: string | null | undefined): number | null {
  const n = normalizeDeckFormat(format);
  if (!n) return null;
  return getFormatRules(n).mainDeckTarget;
}

export function isFormatCompliant(
  format: string | null | undefined,
  mainDeckCardCount: number
): boolean {
  const expected = getExpectedCount(format);
  if (expected == null) return true;
  return mainDeckCardCount === expected;
}

/**
 * Public browse listing (/api/decks/browse): tolerate real catalog data where
 * `deck_cards` may include SB rows in "mainboard", generator overshoot, etc.
 * Publishing / editor still use {@link isFormatCompliant} (exact Commander 100 /
 * constructed 60 main).
 */
export function isPublicBrowseDeckCompliant(
  format: string | null | undefined,
  mainDeckCardCount: number
): boolean {
  const expected = getExpectedCount(format);
  if (expected == null) return true;
  if (expected === 100) return isFormatCompliant(format, mainDeckCardCount);
  if (expected === 60) {
    return mainDeckCardCount >= 55 && mainDeckCardCount <= 95;
  }
  return isFormatCompliant(format, mainDeckCardCount);
}

export function getFormatComplianceMessage(
  format: string | null | undefined,
  mainDeckCardCount: number
): string | null {
  const expected = getExpectedCount(format);
  if (expected == null) return null;
  if (mainDeckCardCount === expected) return null;
  const n = normalizeDeckFormat(format);
  const label = n ? getFormatRules(n).analyzeAs : "This format";
  const diff = Math.abs(mainDeckCardCount - expected);
  if (mainDeckCardCount < expected) {
    return `Please complete your deck before making it public. This ${label} main deck needs ${expected} cards (you have ${mainDeckCardCount} — add ${diff} more).`;
  }
  return `Please complete your deck before making it public. This ${label} main deck needs exactly ${expected} cards (you have ${mainDeckCardCount} — remove ${diff}).`;
}

/** Re-export for routes that have full rows (with optional zone). */
export { getMainboardCardCount } from "@/lib/deck/formatRules";

/**
 * Count mainboard cards from raw deck list text.
 * Commander and constructed: use zoned parse and exclude sideboard rows (do not merge sideboard into main).
 */
export function mainDeckTextCardCount(deckText: string, format: string | null | undefined): number {
  if (isCommanderFormatString(format)) {
    return parseDeckTextWithZones(deckText)
      .filter((r) => r.zone !== "sideboard")
      .reduce((s, c) => s + c.qty, 0);
  }
  return parseDeckTextWithZones(deckText, { isCommanderFormat: false })
    .filter((r) => r.zone !== "sideboard")
    .reduce((s, c) => s + c.qty, 0);
}

/**
 * Build deck list text for analysis: mainboard (+ commander zone) only for constructed
 * so sideboard does not inflate 60-card heuristics. Commander: all non-sideboard rows
 * (legacy rows have no zone → mainboard).
 */
export function rowsToDeckTextForAnalysis(
  rows: Array<{ name: string; qty: number; zone?: string | null }>,
  format: string | null | undefined
): string {
  if (isCommanderFormatString(format)) {
    return rows
      .filter((r) => String(r.zone || "mainboard").toLowerCase() !== "sideboard")
      .map((c) => `${c.qty} ${c.name}`)
      .join("\n");
  }
  return rows
    .filter((r) => String(r.zone || "mainboard").toLowerCase() !== "sideboard")
    .map((c) => `${c.qty} ${c.name}`)
    .join("\n");
}

/**
 * Parsed entries for analysis/heuristics: mainboard only (excludes sideboard) for Commander and 60-card formats.
 */
export function parseMainboardEntriesForAnalysis(
  deckText: string,
  format: AnalyzeFormat
): Array<{ name: string; count: number }> {
  if (format === "Commander") {
    return parseDeckTextWithZones(deckText)
      .filter((r) => r.zone !== "sideboard")
      .map(({ name, qty }) => ({ name, count: qty }));
  }
  return parseDeckTextWithZones(deckText, { isCommanderFormat: false })
    .filter((r) => r.zone !== "sideboard")
    .map(({ name, qty }) => ({ name, count: qty }));
}
