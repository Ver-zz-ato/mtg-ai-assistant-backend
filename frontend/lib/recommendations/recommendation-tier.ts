import { DEFAULT_FALLBACK_MODEL } from "@/lib/ai/default-models";
import { resolveManaTapTier, type ManaTapTier } from "@/lib/ai/tier-policy";

export type RecommendationTier = ManaTapTier;

export type RecommendationTierConfig = {
  tier: RecommendationTier;
  model: string;
  fallbackModel: string;
  candidateLimit: number;
  maxSelections: number;
  judgePasses: 1 | 2;
  useCriticPass: boolean;
  shortReasons: boolean;
  latencyBudgetMs: number;
};

function env(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env[name] : undefined;
}

export function resolveRecommendationTier(input: {
  isGuest?: boolean | null;
  isPro?: boolean | null;
  userId?: string | null;
}): RecommendationTier {
  return resolveManaTapTier(input);
}

export function getRecommendationTierConfig(tier: RecommendationTier): RecommendationTierConfig {
  if (tier === "pro") {
    return {
      tier,
      model: env("MODEL_RECOMMENDER_PRO") || env("MODEL_PRO_RECOMMENDER") || "gpt-5.5",
      fallbackModel: DEFAULT_FALLBACK_MODEL,
      candidateLimit: 40,
      maxSelections: 8,
      judgePasses: 2,
      useCriticPass: true,
      shortReasons: false,
      latencyBudgetMs: 30000,
    };
  }
  if (tier === "free") {
    return {
      tier,
      model: env("MODEL_RECOMMENDER_FREE") || env("MODEL_FREE_RECOMMENDER") || "gpt-5.4",
      fallbackModel: DEFAULT_FALLBACK_MODEL,
      candidateLimit: 28,
      maxSelections: 6,
      judgePasses: 2,
      useCriticPass: false,
      shortReasons: false,
      latencyBudgetMs: 14000,
    };
  }
  return {
    tier,
    model: env("MODEL_RECOMMENDER_GUEST") || env("MODEL_GUEST_RECOMMENDER") || "gpt-5.4-mini",
    fallbackModel: DEFAULT_FALLBACK_MODEL,
    candidateLimit: 16,
    maxSelections: 4,
    judgePasses: 1,
    useCriticPass: false,
    shortReasons: true,
    latencyBudgetMs: 9000,
  };
}
