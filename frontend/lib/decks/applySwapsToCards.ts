export type DeckCardRow = { name: string; qty: number; zone?: string | null };

/** Apply budget swap suggestions to a deck card list (matches swap-suggestions UI semantics). */
export function applySwapsToCards(
  cards: DeckCardRow[],
  swaps: Array<{ from: string; to: string }>,
): DeckCardRow[] {
  let list = cards.map((c) => ({ ...c }));
  for (const swap of swaps) {
    const fromNorm = swap.from.toLowerCase().trim();
    if (!fromNorm || !swap.to?.trim()) continue;
    list = list.filter((c) => c.name.toLowerCase().trim() !== fromNorm);
    list.push({ name: swap.to.trim(), qty: 1, zone: 'mainboard' });
  }
  return list;
}
