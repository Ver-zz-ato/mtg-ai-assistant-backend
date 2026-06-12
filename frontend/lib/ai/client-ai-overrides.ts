/**
 * Server-side enforcement for client-supplied AI tier/model overrides.
 * Public routes must derive tier/model from entitlements; overrides are admin-only.
 */

import { DEFAULT_ADMIN_DEEP_MODEL, DEFAULT_FALLBACK_MODEL } from "./default-models";
import { getModelForTier, type ModelForTierResult } from "./model-by-tier";
import { isChatCompletionsModel } from "./modelCapabilities";
import { resolveManaTapTier, type ManaTapTier } from "./tier-policy";

export type AiRoutingUseCase = "chat" | "deck_analysis";

const GUEST_FREE_MODEL_ALLOWLIST = new Set([
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-4o-mini",
  DEFAULT_FALLBACK_MODEL.toLowerCase(),
]);

const PRO_MODEL_ALLOWLIST = new Set([
  ...GUEST_FREE_MODEL_ALLOWLIST,
  "gpt-5.4",
  "gpt-5",
  "gpt-4o",
  "gpt-4-turbo",
]);

const ADMIN_MODEL_ALLOWLIST = new Set([
  ...PRO_MODEL_ALLOWLIST,
  "gpt-5.5",
  DEFAULT_ADMIN_DEEP_MODEL.toLowerCase(),
  "gpt-5.2-codex",
]);

function normalizeModelId(model: string): string {
  return String(model || "").trim().toLowerCase();
}

function matchesAllowlist(model: string, allowlist: Set<string>): boolean {
  const id = normalizeModelId(model);
  if (!id) return false;
  if (allowlist.has(id)) return true;
  for (const allowed of allowlist) {
    if (id.includes(allowed)) return true;
  }
  return false;
}

function allowlistForTier(tier: ManaTapTier, isAdmin: boolean): Set<string> {
  if (isAdmin) return ADMIN_MODEL_ALLOWLIST;
  if (tier === "pro") return PRO_MODEL_ALLOWLIST;
  return GUEST_FREE_MODEL_ALLOWLIST;
}

/** True when the caller may honor client forceModel / forceTier (admin tooling only). */
export function canUseClientAiOverrides(isAdmin: boolean): boolean {
  return isAdmin;
}

export function parseForceTier(value: unknown): ManaTapTier | null {
  if (typeof value !== "string") return null;
  const tier = value.trim().toLowerCase();
  if (tier === "guest" || tier === "free" || tier === "pro") return tier;
  return null;
}

/**
 * Overlay tier for prompt instructions. Non-admins always get entitled tier.
 */
export function resolveOverlayTier(input: {
  isGuest: boolean;
  userId: string | null;
  isPro: boolean;
  clientForceTier?: unknown;
  allowClientOverrides: boolean;
}): ManaTapTier {
  const entitled = resolveManaTapTier({
    isGuest: input.isGuest,
    userId: input.userId,
    isPro: input.isPro,
  });
  if (!input.allowClientOverrides) return entitled;
  return parseForceTier(input.clientForceTier) ?? entitled;
}

/** Inputs for getModelForTier when admin simulates another subscription tier. */
export function modelTierInputsForRouting(input: {
  isGuest: boolean;
  userId: string | null;
  isPro: boolean;
  overlayTier: ManaTapTier;
  allowClientOverrides: boolean;
  useCase?: AiRoutingUseCase;
}): {
  isGuest: boolean;
  userId: string | null;
  isPro: boolean;
  useCase?: "chat" | "deck_analysis";
} {
  const entitled = resolveManaTapTier({
    isGuest: input.isGuest,
    userId: input.userId,
    isPro: input.isPro,
  });
  const useCase = input.useCase;
  if (!input.allowClientOverrides || input.overlayTier === entitled) {
    return {
      isGuest: input.isGuest,
      userId: input.userId,
      isPro: input.isPro,
      useCase,
    };
  }
  return {
    isGuest: input.overlayTier === "guest",
    userId: input.overlayTier === "guest" ? null : input.userId ?? "admin-tier-sim",
    isPro: input.overlayTier === "pro",
    useCase,
  };
}

export function isModelAllowedForContext(
  model: string,
  tier: ManaTapTier,
  isAdmin: boolean,
  useCase: AiRoutingUseCase
): boolean {
  const id = normalizeModelId(model);
  if (!id) return false;
  if (!matchesAllowlist(id, allowlistForTier(tier, isAdmin))) return false;
  if (useCase === "chat" && !isChatCompletionsModel(model)) return false;
  return true;
}

function clampToAllowlist(
  model: string,
  tier: ManaTapTier,
  isAdmin: boolean,
  useCase: AiRoutingUseCase
): string {
  if (isModelAllowedForContext(model, tier, isAdmin, useCase)) return model.trim();
  if (isModelAllowedForContext(DEFAULT_FALLBACK_MODEL, tier, isAdmin, useCase)) {
    return DEFAULT_FALLBACK_MODEL;
  }
  return DEFAULT_FALLBACK_MODEL;
}

/**
 * Resolve the model for an LLM call from entitlements, with optional admin override.
 */
export function resolveModelForRequest(input: {
  isGuest: boolean;
  userId: string | null;
  isPro: boolean;
  useCase: AiRoutingUseCase;
  /** Slot/candidate stages prefer mini unless admin overrides. */
  preferMini?: boolean;
  miniDefault?: string;
  clientModelOverride?: unknown;
  allowClientOverrides: boolean;
  /** When set, model routing follows simulated tier (admin tests). */
  overlayTier?: ManaTapTier;
}): { model: string; tierResult: ModelForTierResult } {
  const overlayTier =
    input.overlayTier ??
    resolveOverlayTier({
      isGuest: input.isGuest,
      userId: input.userId,
      isPro: input.isPro,
      allowClientOverrides: false,
    });

  const tierInputs = modelTierInputsForRouting({
    isGuest: input.isGuest,
    userId: input.userId,
    isPro: input.isPro,
    overlayTier,
    allowClientOverrides: input.allowClientOverrides,
    useCase: input.useCase,
  });

  const tierResult = getModelForTier({
    isGuest: tierInputs.isGuest,
    userId: tierInputs.userId,
    isPro: tierInputs.isPro,
    useCase: input.useCase === "deck_analysis" ? "deck_analysis" : "chat",
  });

  let model = input.preferMini
    ? (input.miniDefault ?? DEFAULT_FALLBACK_MODEL)
    : tierResult.model;

  model = clampToAllowlist(
    model,
    tierResult.tier,
    input.allowClientOverrides,
    input.useCase
  );

  const rawOverride =
    typeof input.clientModelOverride === "string" ? input.clientModelOverride.trim() : "";
  if (input.allowClientOverrides && rawOverride) {
    if (isModelAllowedForContext(rawOverride, tierResult.tier, true, input.useCase)) {
      model = rawOverride;
    }
  }

  return { model, tierResult };
}

/**
 * Chat route: pick primary vs fallback model, honoring admin override only.
 */
export function resolveChatModel(input: {
  isGuest: boolean;
  userId: string | null;
  isPro: boolean;
  useMidTier: boolean;
  clientModelOverride?: unknown;
  allowClientOverrides: boolean;
  overlayTier?: ManaTapTier;
}): { model: string; tierResult: ModelForTierResult } {
  const { tierResult } = resolveModelForRequest({
    isGuest: input.isGuest,
    userId: input.userId,
    isPro: input.isPro,
    useCase: "chat",
    preferMini: !input.useMidTier,
    clientModelOverride: input.clientModelOverride,
    allowClientOverrides: input.allowClientOverrides,
    overlayTier: input.overlayTier,
  });

  let model = input.useMidTier ? tierResult.model : tierResult.fallbackModel;
  model = clampToAllowlist(model, tierResult.tier, input.allowClientOverrides, "chat");

  const rawOverride =
    typeof input.clientModelOverride === "string" ? input.clientModelOverride.trim() : "";
  if (input.allowClientOverrides && rawOverride) {
    if (isModelAllowedForContext(rawOverride, tierResult.tier, true, "chat")) {
      model = rawOverride;
    }
  } else if (!isChatCompletionsModel(model)) {
    model = clampToAllowlist(tierResult.fallbackModel, tierResult.tier, false, "chat");
  }

  return { model, tierResult };
}
