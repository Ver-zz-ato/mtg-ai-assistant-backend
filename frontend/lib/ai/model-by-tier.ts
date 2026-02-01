/**
 * Tiered model routing: map user tier (guest / free / pro) to OpenAI model and metadata.
 * Used by chat stream, chat, deck analyze, and other AI routes.
 */

export type ModelTier = 'guest' | 'free' | 'pro';

export type ModelForTierResult = {
  model: string;
  fallbackModel: string;
  tier: ModelTier;
  tierLabel: string;
  upgradeMessage?: string;
};

/**
 * Get OpenAI model and metadata for the given user tier.
 * Env overrides: MODEL_GUEST, MODEL_FREE, MODEL_PRO (OPENAI_MODEL used for Pro when MODEL_PRO unset).
 * For deck_analysis, Pro uses MODEL_DECK_ANALYSIS_PRO or gpt-4o (not Codex) for better rules/long-form reasoning.
 */
export function getModelForTier(opts: {
  isGuest: boolean;
  userId: string | null;
  isPro: boolean;
  /** When 'deck_analysis', Pro uses a general-purpose model (gpt-4o) instead of Codex. */
  useCase?: 'chat' | 'deck_analysis';
}): ModelForTierResult {
  const { isGuest, userId, isPro, useCase } = opts;

  if (isGuest || !userId) {
    return {
      model: (typeof process !== 'undefined' && process.env?.MODEL_GUEST) || 'gpt-4o-mini',
      fallbackModel: 'gpt-4o-mini',
      tier: 'guest',
      tierLabel: 'Guest',
    };
  }

  if (isPro) {
    const proModel =
      useCase === 'deck_analysis'
        ? (typeof process !== 'undefined' && (process.env?.MODEL_DECK_ANALYSIS_PRO || process.env?.MODEL_FREE)) || 'gpt-4o'
        : (typeof process !== 'undefined' && (process.env?.MODEL_PRO || process.env?.OPENAI_MODEL)) || 'gpt-5.2-codex';
    return {
      model: proModel,
      fallbackModel: 'gpt-4o-mini',
      tier: 'pro',
      tierLabel: 'Pro',
    };
  }

  return {
    model: (typeof process !== 'undefined' && process.env?.MODEL_FREE) || 'gpt-4o',
    fallbackModel: 'gpt-4o-mini',
    tier: 'free',
    tierLabel: 'Standard',
    upgradeMessage: 'Upgrade to Pro for the best model.',
  };
}
