const WUBRG = ["W", "U", "B", "R", "G"] as const;

export type CollectionColorPip = (typeof WUBRG)[number];
export const COLLECTION_WUBRG = WUBRG;

function sortCi(ids: string[] | null | undefined): CollectionColorPip[] {
  if (!ids?.length) return [];
  const allowed = new Set(WUBRG);
  const upper = ids
    .map((c) => String(c).toUpperCase().trim())
    .filter((c): c is CollectionColorPip => allowed.has(c as CollectionColorPip));
  const uniq = [...new Set(upper)];
  return WUBRG.filter((c) => uniq.includes(c));
}

/** Card color identity must be a subset of the selected pips (mono-red = {R} only). */
export function cardMatchesColorFilter(
  colorIdentity: string[] | null | undefined,
  selected: CollectionColorPip[],
): boolean {
  if (selected.length === 0) return true;
  const cardColors = sortCi(colorIdentity);
  if (cardColors.length === 0) return false;
  const allowed = new Set(selected);
  return cardColors.every((c) => allowed.has(c));
}

export function toggleColorPip(
  selected: CollectionColorPip[],
  pip: CollectionColorPip,
): CollectionColorPip[] {
  if (selected.includes(pip)) return selected.filter((c) => c !== pip);
  return [...selected, pip].sort((a, b) => WUBRG.indexOf(a) - WUBRG.indexOf(b));
}
