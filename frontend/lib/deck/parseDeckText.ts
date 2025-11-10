// @server-only

export type ParsedDeckEntry = {
  name: string;
  qty: number;
};

/**
 * Parse a raw decklist text block into {name, qty} entries.
 * Supports lines like:
 *   3 Sol Ring
 *   2x Lightning Bolt
 *   Lightning Bolt (defaults qty=1)
 * Ignores comments (# or //) and blank lines.
 */
export function parseDeckText(raw?: string): ParsedDeckEntry[] {
  if (!raw) return [];

  const out: Record<string, number> = {};

  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("#") || t.startsWith("//")) continue;

    // Formats:
    //  - "2 Arcane Signet"
    //  - "2x Arcane Signet"
    //  - "Arcane Signet"
    const match = t.match(/^\s*(\d+)x?\s+(.+?)\s*$/i);
    if (match) {
      const qty = Math.max(0, parseInt(match[1], 10) || 0);
      const name = match[2].trim();
      if (qty > 0 && name) {
        out[name] = (out[name] ?? 0) + qty;
      }
      continue;
    }

    // Fallback: treat entire line as name with qty 1
    out[t] = (out[t] ?? 0) + 1;
  }

  return Object.entries(out).map(([name, qty]) => ({ name, qty }));
}

