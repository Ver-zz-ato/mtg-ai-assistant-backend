export type CardLine = { name: string; qty: number; colors?: string[] };

/**
 * Compute quantity-weighted color identity counts for a list of cards.
 * colors uses Magic color identity letters: W,U,B,R,G.
 */
export function computeColorIdentityCounts(cards: CardLine[]): Record<string, number> {
  const counts: Record<string, number> = { W:0, U:0, B:0, R:0, G:0 };
  for (const c of cards) {
    const qty = Math.max(0, Number(c.qty||0));
    const cols = Array.isArray(c.colors) ? c.colors : [];
    const uniq = Array.from(new Set(cols.filter(x => typeof x === 'string')));
    for (const k of uniq) {
      if (k in counts) counts[k] += qty;
    }
  }
  return counts;
}