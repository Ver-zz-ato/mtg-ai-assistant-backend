import { containsProfanity } from "@/lib/profanity";
import { getFormatComplianceMessage, mainDeckTextCardCount } from "@/lib/deck/formatCompliance";

type PublicDeckValidationInput = {
  title: string | null | undefined;
  format: string | null | undefined;
  deckText: string | null | undefined;
  deckAim?: string | null | undefined;
};

/**
 * Central publish guard for decks.
 * A deck can only be public when the title is clean and the main deck size is exact for the format.
 */
export function getPublicDeckValidationError(input: PublicDeckValidationInput): string | null {
  const title = String(input.title ?? "").trim();
  if (title && containsProfanity(title)) {
    return "Please remove offensive language before making this public.";
  }

  const deckAim = String(input.deckAim ?? "").trim();
  if (!deckAim) {
    return "Add a deck aim / strategy before making this public.";
  }
  if (containsProfanity(deckAim)) {
    return "Please remove offensive language before making this public.";
  }

  const cardCount = mainDeckTextCardCount(String(input.deckText ?? ""), input.format);
  return getFormatComplianceMessage(input.format, cardCount);
}
