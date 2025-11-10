import { type SfCard } from "@/lib/deck/inference";

export type CardSuggestion = {
  name: string;
  reason?: string;
  source?: "gpt" | "retry";
  requestedType?: string;
};

const PERMANENT_TYPES = ["artifact", "creature", "enchantment", "planeswalker", "battle", "land"];

export function normalizeCardName(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;:'"!?()[\]{}]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

export function isWithinColorIdentity(card: SfCard, allowedColors: string[]): boolean {
  const colors = (card.color_identity || []).map((c) => c.toUpperCase());
  if (colors.length === 0) {
    // Colorless cards are always allowed
    return true;
  }
  if (allowedColors.length === 0) {
    return false;
  }
  const allowed = new Set(allowedColors.map((c) => c.toUpperCase()));
  return colors.every((c) => allowed.has(c));
}

export function matchesRequestedType(card: SfCard, requestedType?: string): boolean {
  if (!requestedType || requestedType.toLowerCase() === "any") return true;

  const lowered = requestedType.toLowerCase();
  const typeLine = (card.type_line || "").toLowerCase();

  if (!typeLine) return lowered === "unknown";

  const isPermanent = PERMANENT_TYPES.some((type) => typeLine.includes(type));
  switch (lowered) {
    case "permanent":
      return isPermanent;
    case "nonpermanent":
    case "spell":
      return !typeLine.includes("land");
    case "nonland":
      return !typeLine.includes("land");
    case "land":
      return typeLine.includes("land");
    case "creature":
      return typeLine.includes("creature");
    case "instant":
      return typeLine.includes("instant");
    case "sorcery":
      return typeLine.includes("sorcery");
    case "enchantment":
      return typeLine.includes("enchantment");
    case "artifact":
      return typeLine.includes("artifact");
    case "battle":
      return typeLine.includes("battle");
    case "planeswalker":
      return typeLine.includes("planeswalker");
    default:
      // Fall back to substring check so niche requested types (e.g., "vehicle") still work.
      return typeLine.includes(lowered);
  }
}

export function isLegalForFormat(card: SfCard, format: string): boolean {
  const legalities = card.legalities || {};
  const key = format.toLowerCase();

  if (key === "commander" || key === "edh") {
    const status = legalities["commander"];
    return status !== "banned";
  }

  const status = legalities[key];
  return status === "legal" || status === "restricted";
}

export function isDuplicate(cardName: string, deckNormalized: Set<string>): boolean {
  return deckNormalized.has(normalizeCardName(cardName));
}

