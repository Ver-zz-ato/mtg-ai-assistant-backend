/** Date-based version; bump when the pricing table changes so historical ai_usage rows stay interpretable. */
export const PRICING_VERSION = "2026-02-14";

/** Per-1K-token pricing (OpenAI 2025). $2.50/1M = $0.0025/1K, etc. */
export function costUSD(model: string, inputTokens: number, outputTokens: number): number {
  const key = (model || "").toLowerCase();
  // Default rough prices per 1K tokens if model is unknown
  let inPerK = 0.005;   // $5/1M input
  let outPerK = 0.015;  // $15/1M output

  // Pricing per 1K tokens (OpenAI pricing: $X/1M = $X/1000 per 1K)
  const table: Record<string, { inPerK: number; outPerK: number }> = {
    "gpt-5.2-codex": { inPerK: 0.0025, outPerK: 0.01 },
    "gpt-5": { inPerK: 0.0025, outPerK: 0.01 },
    "gpt-4o-mini": { inPerK: 0.00015, outPerK: 0.0006 },  // $0.15/1M in, $0.60/1M out
    "gpt-4o": { inPerK: 0.0025, outPerK: 0.01 },          // $2.50/1M in, $10/1M out
  };
  for (const k of Object.keys(table)) {
    if (key.includes(k)) { inPerK = table[k].inPerK; outPerK = table[k].outPerK; break; }
  }

  const cost = (inputTokens / 1000) * inPerK + (outputTokens / 1000) * outPerK;
  return Math.round(cost * 1000000) / 1000000; // 6 dp
}
