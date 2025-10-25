export function costUSD(model: string, inputTokens: number, outputTokens: number): number {
  const key = (model || "").toLowerCase();
  // Default rough prices per 1K tokens if model is unknown
  let inPerK = 0.5;   // $0.50 / 1k input
  let outPerK = 1.5;  // $1.50 / 1k output

  // Example entries; adjust to your actual plan
  const table: Record<string, { inPerK: number; outPerK: number }> = {
    "gpt-5": { inPerK: 0.5, outPerK: 1.5 },
    "gpt-5-mini": { inPerK: 0.15, outPerK: 0.6 },
  };
  for (const k of Object.keys(table)) {
    if (key.includes(k)) { inPerK = table[k].inPerK; outPerK = table[k].outPerK; break; }
  }

  const cost = (inputTokens / 1000) * inPerK + (outputTokens / 1000) * outPerK;
  return Math.round(cost * 1000000) / 1000000; // 6 dp
}
