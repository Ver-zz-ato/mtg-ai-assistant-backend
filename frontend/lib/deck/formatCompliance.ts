/**
 * Format compliance for deck card counts.
 * Commander: 100 cards
 * Standard/Modern/Pioneer/Pauper: 60 cards
 * Other formats: no strict requirement
 */
const FORMAT_EXPECTED: Record<string, number> = {
  commander: 100,
  standard: 60,
  modern: 60,
  pioneer: 60,
  pauper: 60,
};

export function getExpectedCount(format: string | null | undefined): number | null {
  const key = String(format || "").toLowerCase().trim();
  return FORMAT_EXPECTED[key] ?? null;
}

export function isFormatCompliant(
  format: string | null | undefined,
  cardCount: number
): boolean {
  const expected = getExpectedCount(format);
  if (expected == null) return true; // unknown format, allow
  return cardCount === expected;
}

export function getFormatComplianceMessage(
  format: string | null | undefined,
  cardCount: number
): string | null {
  const expected = getExpectedCount(format);
  if (expected == null) return null;
  if (cardCount === expected) return null;
  const formatName = String(format || "this format").charAt(0).toUpperCase() + String(format || "").slice(1).toLowerCase();
  const diff = Math.abs(cardCount - expected);
  if (cardCount < expected) {
    return `Please complete your deck before making it public. This ${formatName} deck needs ${expected} cards (you have ${cardCount} — add ${diff} more).`;
  }
  return `Please complete your deck before making it public. This ${formatName} deck needs exactly ${expected} cards (you have ${cardCount} — remove ${diff}).`;
}
