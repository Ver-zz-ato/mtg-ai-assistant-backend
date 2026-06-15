export type SwapSuggestionsEmptyReason =
  | "no_cheaper_on_plan_swaps"
  | "no_curated_sources_in_deck"
  | "ai_call_failed"
  | "ai_invalid_response"
  | "ai_no_suggestions"
  | "ai_filtered_out";

export type AiRunMetrics = {
  outcome: "ok" | "empty" | "invalid_response" | "call_failed" | "not_run";
  rawCount: number;
  validatedCount: number;
};

export function resolveSwapSuggestionsEmptyReason(input: {
  useAI: boolean;
  curatedSourcesInDeck: number;
  finalCount: number;
  aiRun: AiRunMetrics;
}): SwapSuggestionsEmptyReason {
  if (input.useAI) {
    if (input.aiRun.outcome === "call_failed") return "ai_call_failed";
    if (input.aiRun.outcome === "invalid_response") return "ai_invalid_response";
    if (input.aiRun.rawCount === 0) return "ai_no_suggestions";
    if (input.aiRun.validatedCount > 0 && input.finalCount === 0) return "ai_filtered_out";
    if (input.aiRun.rawCount > 0 && input.aiRun.validatedCount === 0) return "ai_filtered_out";
    return "ai_no_suggestions";
  }

  if (input.curatedSourcesInDeck === 0) return "no_curated_sources_in_deck";
  return "no_cheaper_on_plan_swaps";
}
