/**
 * Display-only card title. ManaTap shows oracle English names as the user-facing identity;
 * `printed_name` may be localized or alternate-frame text and must not replace it.
 */
export function getDisplayCardName(card: {
  name: string;
  printed_name?: string | null;
}): string {
  return card.name;
}
