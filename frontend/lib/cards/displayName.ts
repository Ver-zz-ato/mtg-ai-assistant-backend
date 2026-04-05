/**
 * Display-only card title: prefer Scryfall `printed_name` when it differs from oracle `name`.
 * Never use for identity, search keys, or persistence — oracle `name` remains canonical.
 */
export function getDisplayCardName(card: {
  name: string;
  printed_name?: string | null;
}): string {
  if (
    card.printed_name &&
    card.printed_name.trim().length > 0 &&
    card.printed_name.trim().toLowerCase() !== card.name.trim().toLowerCase()
  ) {
    return card.printed_name.trim();
  }
  return card.name;
}
