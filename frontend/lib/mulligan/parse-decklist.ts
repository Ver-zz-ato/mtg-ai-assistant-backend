/**
 * Parse decklist text for mulligan playground.
 * Supports: "1 Sol Ring", "2x Island", "Sol Ring"
 * Strips set codes in parentheses or brackets (best effort).
 */

export type ParsedCard = { name: string; count: number };

const BASIC_LANDS = /^(island|mountain|forest|plains|swamp)$/i;
const LAND_KEYWORDS = /\bland\b|island|mountain|forest|plains|swamp|dual|fetch|shock|triome|pathway/i;

/** Strip set code from name: "Sol Ring (2ED)" or "Sol Ring [2ED]" -> "Sol Ring" */
function stripSetCode(name: string): string {
  return name
    .replace(/\s*\([a-z0-9]+\)\s*$/i, "")
    .replace(/\s*\[[a-z0-9]+\]\s*$/i, "")
    .trim();
}

export function parseDecklist(raw?: string): ParsedCard[] {
  if (!raw) return [];

  const out = new Map<string, number>();

  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("#") || t.startsWith("//")) continue;

    const match = t.match(/^\s*(\d+)x?\s+(.+?)\s*$/i);
    if (match) {
      const qty = Math.max(0, parseInt(match[1], 10) || 0);
      const name = stripSetCode(match[2].trim());
      if (qty > 0 && name) {
        out.set(name, (out.get(name) ?? 0) + qty);
      }
      continue;
    }

    out.set(stripSetCode(t), (out.get(stripSetCode(t)) ?? 0) + 1);
  }

  return Array.from(out.entries()).map(([name, count]) => ({ name, count }));
}

export function getTotalCards(cards: ParsedCard[]): number {
  return cards.reduce((s, c) => s + c.count, 0);
}

export function getUniqueCount(cards: ParsedCard[]): number {
  return cards.length;
}

export function isLand(name: string): boolean {
  const n = name.toLowerCase().trim();
  return BASIC_LANDS.test(n) || LAND_KEYWORDS.test(n);
}
