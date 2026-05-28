/**
 * Scanner AI model selection — uses the same tier routing as chat/deck (`getModelForTier`).
 * No per-route MODEL_SCAN_* env vars; upgrade defaults in `lib/ai/default-models.ts`
 * or tier envs (MODEL_GUEST, MODEL_FREE, MODEL_PRO_CHAT, MODEL_PRO_DECK).
 */

import { getModelForTier } from "@/lib/ai/model-by-tier";
import type { ScanAssistMode } from "@/lib/scanner/scan-ai-core";
import type { ScanAiUserTier } from "@/lib/scanner/scan-ai-route-auth";

export type ScannerModelPick = {
  model: string;
  fallbackModel: string;
  tier: ScanAiUserTier;
};

function tierOpts(auth: { userTier: ScanAiUserTier; realUserId: string | null; isPro: boolean }) {
  return {
    isGuest: auth.userTier === "guest",
    userId: auth.realUserId,
    isPro: auth.isPro,
  };
}

/** Phase A — text-only disambiguation (chat-completions JSON). */
export function getScannerDisambiguateModel(auth: {
  userTier: ScanAiUserTier;
  realUserId: string | null;
  isPro: boolean;
}): ScannerModelPick {
  const picked = getModelForTier({ ...tierOpts(auth), useCase: "chat" });
  return {
    model: picked.model,
    fallbackModel: picked.fallbackModel,
    tier: picked.tier,
  };
}

/** Phase B/C — vision (`recognize-image`). Improve uses deck-tier Pro model. */
export function getScannerVisionModel(
  auth: { userTier: ScanAiUserTier; realUserId: string | null; isPro: boolean },
  assistMode: ScanAssistMode
): ScannerModelPick {
  const useCase = assistMode === "improve" ? "deck_analysis" : "chat";
  const picked = getModelForTier({ ...tierOpts(auth), useCase });
  return {
    model: picked.model,
    fallbackModel: picked.fallbackModel,
    tier: picked.tier,
  };
}
