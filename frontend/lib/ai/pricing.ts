/** Date-based version; bump when the pricing table changes so historical ai_usage rows stay interpretable. */
export const PRICING_VERSION = "2026-05-12";

type ModelPricing = {
  inPerK: number;
  cachedInPerK: number;
  outPerK: number;
};

const DEFAULT_PRICING: ModelPricing = {
  inPerK: 0.005,
  cachedInPerK: 0.0005,
  outPerK: 0.015,
};

/** Per-1K-token pricing (OpenAI 2025-2026). $2.50/1M = $0.0025/1K, etc. */
const MODEL_PRICING_TABLE: Record<string, ModelPricing> = {
  "gpt-5.5": { inPerK: 0.005, cachedInPerK: 0.0005, outPerK: 0.03 },
  "gpt-5.4-mini": { inPerK: 0.00075, cachedInPerK: 0.000075, outPerK: 0.0045 },
  "gpt-5.4-nano": { inPerK: 0.00015, cachedInPerK: 0.000015, outPerK: 0.00075 },
  "gpt-5.4": { inPerK: 0.0025, cachedInPerK: 0.00025, outPerK: 0.015 },
  "gpt-5-nano": { inPerK: 0.0001, cachedInPerK: 0.00001, outPerK: 0.0004 },
  "gpt-5-mini": { inPerK: 0.0004, cachedInPerK: 0.00004, outPerK: 0.0016 },
  "gpt-5.2-codex": { inPerK: 0.0025, cachedInPerK: 0.00025, outPerK: 0.01 },
  "gpt-5": { inPerK: 0.0025, cachedInPerK: 0.00025, outPerK: 0.01 },
  "gpt-4o-mini": { inPerK: 0.00015, cachedInPerK: 0.000075, outPerK: 0.0006 },
  "gpt-4o": { inPerK: 0.0025, cachedInPerK: 0.00125, outPerK: 0.01 },
};

export function getModelPricing(model: string): ModelPricing {
  const normalized = getPricingModelKey(model);
  if (normalized) return MODEL_PRICING_TABLE[normalized];
  return DEFAULT_PRICING;
}

export function getPricingModelKey(model: string): string | null {
  const key = (model || "").toLowerCase();
  for (const tableKey of Object.keys(MODEL_PRICING_TABLE)) {
    if (key.includes(tableKey)) return tableKey;
  }
  return null;
}

function roundCost(cost: number): number {
  return Math.round(cost * 1000000) / 1000000;
}

export function costUSD(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = getModelPricing(model);
  const cost = (inputTokens / 1000) * pricing.inPerK + (outputTokens / 1000) * pricing.outPerK;
  return roundCost(cost);
}

export function costUSDWithCachedInput(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens: number,
): number {
  const pricing = getModelPricing(model);
  const input = Number(inputTokens) || 0;
  const output = Number(outputTokens) || 0;
  const cached = Math.max(0, Math.min(input, Number(cachedInputTokens) || 0));
  const uncached = Math.max(0, input - cached);
  const cost =
    (uncached / 1000) * pricing.inPerK +
    (cached / 1000) * pricing.cachedInPerK +
    (output / 1000) * pricing.outPerK;
  return roundCost(cost);
}
