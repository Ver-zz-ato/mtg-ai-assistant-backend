/**
 * Tiered model routing: map user tier (guest / free / pro) to OpenAI model and metadata.
 * Chat routes must receive chat-completions-capable models only; Codex is responses-only.
 *
 * Env: MODEL_GUEST, MODEL_FREE, MODEL_PRO (generic), MODEL_PRO_CHAT, MODEL_PRO_DECK.
 * MODEL_PRO is backwards-compat; for chat we prefer MODEL_PRO_CHAT and never use a responses-only model.
 */

import { isChatCompletionsModel } from "./modelCapabilities";

export type ModelTier = "guest" | "free" | "pro";

export type ModelForTierResult = {
  model: string;
  fallbackModel: string;
  tier: ModelTier;
  tierLabel: string;
  upgradeMessage?: string;
};

const CHAT_PRO_DEFAULT = "gpt-4o";
const DECK_PRO_DEFAULT = "gpt-4o";
const GUEST_DEFAULT = "gpt-4o-mini";
const FREE_DEFAULT = "gpt-4o-mini";
const FALLBACK_DEFAULT = "gpt-4o-mini";

function env(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env[name] : undefined;
}

/**
 * Get OpenAI model and metadata for the given user tier.
 * For chat, Pro uses MODEL_PRO_CHAT ?? gpt-4o and never a responses-only model (e.g. Codex).
 * For deck_analysis, Pro uses MODEL_PRO_DECK ?? gpt-4o.
 */
export function getModelForTier(opts: {
  isGuest: boolean;
  userId: string | null;
  isPro: boolean;
  /** When 'deck_analysis', Pro uses MODEL_PRO_DECK; when 'chat' or unset, Pro uses MODEL_PRO_CHAT (chat-capable only). */
  useCase?: "chat" | "deck_analysis";
}): ModelForTierResult {
  const { isGuest, userId, isPro, useCase } = opts;

  if (isGuest || !userId) {
    return {
      model: env("MODEL_GUEST") || GUEST_DEFAULT,
      fallbackModel: FALLBACK_DEFAULT,
      tier: "guest",
      tierLabel: "Guest",
    };
  }

  if (isPro) {
    if (useCase === "deck_analysis") {
      const model = env("MODEL_PRO_DECK") || env("MODEL_DECK_ANALYSIS_PRO") || env("MODEL_FREE") || DECK_PRO_DEFAULT;
      return {
        model,
        fallbackModel: FALLBACK_DEFAULT,
        tier: "pro",
        tierLabel: "Pro",
      };
    }
    // Chat (or unset): must be chat-completions-capable
    const preferred = env("MODEL_PRO_CHAT") || env("MODEL_PRO") || env("OPENAI_MODEL") || CHAT_PRO_DEFAULT;
    const model = isChatCompletionsModel(preferred)
      ? preferred
      : (env("MODEL_PRO_CHAT") || CHAT_PRO_DEFAULT);
    return {
      model,
      fallbackModel: FALLBACK_DEFAULT,
      tier: "pro",
      tierLabel: "Pro",
    };
  }

  return {
    model: env("MODEL_FREE") || FREE_DEFAULT,
    fallbackModel: FALLBACK_DEFAULT,
    tier: "free",
    tierLabel: "Standard",
    upgradeMessage: "Upgrade to Pro for the best model.",
  };
}
