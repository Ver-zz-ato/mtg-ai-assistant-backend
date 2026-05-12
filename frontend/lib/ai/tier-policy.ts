export type ManaTapTier = "guest" | "free" | "pro";

export type AiTierCapabilities = {
  tier: ManaTapTier;
  persistMemory: boolean;
  deckMutations: boolean;
  maxToolResults: number;
  maxProtectedCards: number;
  maxCombos: number;
  includeCollectionFit: "none" | "basic" | "full";
  includePowerProfile: boolean;
  includeDurableMemories: boolean;
  includeRulesGrounding: "basic" | "full";
  includePriceHistory: boolean;
  includeProbability: boolean;
  recommendationStrictness: "basic" | "guarded" | "strict";
};

export function resolveManaTapTier(input: {
  isGuest?: boolean | null;
  isPro?: boolean | null;
  userId?: string | null;
}): ManaTapTier {
  if (input.isGuest || !input.userId) return "guest";
  return input.isPro ? "pro" : "free";
}

export function getAiTierCapabilities(tier: ManaTapTier): AiTierCapabilities {
  if (tier === "pro") {
    return {
      tier,
      persistMemory: true,
      deckMutations: true,
      maxToolResults: 9,
      maxProtectedCards: 18,
      maxCombos: 8,
      includeCollectionFit: "full",
      includePowerProfile: true,
      includeDurableMemories: true,
      includeRulesGrounding: "full",
      includePriceHistory: true,
      includeProbability: true,
      recommendationStrictness: "strict",
    };
  }
  if (tier === "free") {
    return {
      tier,
      persistMemory: false,
      deckMutations: true,
      maxToolResults: 5,
      maxProtectedCards: 10,
      maxCombos: 3,
      includeCollectionFit: "basic",
      includePowerProfile: true,
      includeDurableMemories: false,
      includeRulesGrounding: "basic",
      includePriceHistory: false,
      includeProbability: false,
      recommendationStrictness: "guarded",
    };
  }
  return {
    tier,
    persistMemory: false,
    deckMutations: false,
    maxToolResults: 3,
    maxProtectedCards: 6,
    maxCombos: 1,
    includeCollectionFit: "none",
    includePowerProfile: false,
    includeDurableMemories: false,
    includeRulesGrounding: "basic",
    includePriceHistory: false,
    includeProbability: false,
    recommendationStrictness: "basic",
  };
}

export function formatTierCapabilityPrompt(capabilities: AiTierCapabilities): string {
  const lines = [
    `AI TIER: ${capabilities.tier.toUpperCase()}`,
    capabilities.tier === "guest"
      ? "- Guest mode: keep help useful but ephemeral. Do not claim saved memory, saved collection access, or deck edits."
      : capabilities.tier === "free"
        ? "- Free mode: provide grounded deck help with basic collection hints. Do not claim durable AI memory."
        : "- Pro mode: use the full ManaTap intelligence packet, confirmed memories, collection-aware reasoning, and strict recommendation checks.",
    `- Recommendation strictness: ${capabilities.recommendationStrictness}.`,
  ];
  if (capabilities.includeCollectionFit === "basic") {
    lines.push("- Collection context, when present, is basic: owned/missing and simple owned alternatives.");
  } else if (capabilities.includeCollectionFit === "full") {
    lines.push("- Collection context, when present, is full: owned upgrades, substitutes, purchases, and buildability.");
  }
  if (capabilities.includeRulesGrounding === "full") {
    lines.push("- Use full rules/rulings grounding for card questions when available.");
  }
  if (capabilities.includeProbability) {
    lines.push("- Probability and mulligan reasoning may use deeper tool grounding when the user asks.");
  }
  return lines.join("\n");
}
