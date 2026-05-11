import type { Metadata } from "next";

export const SITE_URL = "https://www.manatap.ai";

export const HOME_DESCRIPTION =
  "Build better Magic: The Gathering decks with ManaTap AI. Analyze Commander decks, test mulligans, compare lists, track prices, and find upgrades.";

export const TOOL_DESCRIPTIONS = {
  mulligan:
    "Test MTG opening hands with ManaTap's mulligan tool. Simulate Commander and constructed draws, check land balance, and improve keep decisions.",
  probability:
    "Calculate MTG draw odds with ManaTap's probability tool. Model lands, ramp, colors, combo pieces, and opening hands with hypergeometric math.",
  budgetSwaps:
    "Find cheaper MTG card alternatives with ManaTap's budget swap tool. Paste a decklist, compare expensive cards, and keep your strategy intact.",
  costToFinish:
    "Estimate the cost to finish an MTG deck with ManaTap. Paste a list, subtract cards you own, compare prices, and plan budget-friendly upgrades.",
  priceTracker:
    "Track Magic: The Gathering card prices with ManaTap. Review price history, compare trends, watch deck value, and plan smarter card purchases.",
  compareDecks:
    "Compare Magic: The Gathering decks side by side with ManaTap. Review shared cards, unique upgrades, mana curves, colors, and deck value.",
} as const;

export const META_DESCRIPTIONS = {
  index:
    "Explore the Commander meta with ManaTap. See trending commanders, most-played cards, budget commanders, and daily public deck data.",
  "trending-commanders":
    "Discover trending Commander decks on ManaTap. See commanders gaining the most new public decks, updated daily from community data.",
  "most-played-commanders":
    "Browse the most-played Commander leaders on ManaTap. Compare public deck counts, popular choices, and links to deck-building tools.",
  "budget-commanders":
    "Find budget Commander options on ManaTap. Compare commanders by median deck cost and discover affordable MTG decks to build next.",
  "trending-cards":
    "Track trending Commander cards on ManaTap. See cards appearing in newly created public decks and spot rising MTG staples early.",
  "most-played-cards":
    "Browse the most-played Commander cards on ManaTap. Compare public deck counts, staple cards, prices, and deck-building context.",
} as const;

export function cleanDescription(value: string): string {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, (_, text = "") => String(text))
    .replace(/[#*_`>~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function descriptionFromText(value: string, fallback: string, maxLength = 160): string {
  const clean = cleanDescription(value);
  if (!clean) return fallback;
  if (clean.length <= maxLength) return clean;
  const slice = clean.slice(0, maxLength + 1);
  const lastSpace = slice.lastIndexOf(" ");
  const trimmed = (lastSpace > 120 ? slice.slice(0, lastSpace) : slice.slice(0, maxLength)).trim();
  return `${trimmed.replace(/[.,;:!?-]+$/, "")}.`;
}

export function buildCardDescription(cardName: string, typeLine?: string | null): string {
  const typeSnippet = cleanDescription(typeLine || "");
  const typeText = typeSnippet ? `, ${typeSnippet},` : "";
  return `View ${cardName}${typeText} for Magic: The Gathering with oracle text, pricing, deck-building context, and ManaTap AI card insights.`;
}

export function canonicalMeta(path: string, metadata: Metadata = {}): Metadata {
  return {
    ...metadata,
    alternates: {
      ...(metadata.alternates || {}),
      canonical: path.startsWith("http") ? path : `${SITE_URL}${path}`,
    },
  };
}
