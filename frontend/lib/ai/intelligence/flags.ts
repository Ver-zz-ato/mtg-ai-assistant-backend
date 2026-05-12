export type AiIntelligenceFlag =
  | "AI_INTELLIGENCE_PACKET"
  | "AI_TOOL_REGISTRY_V2"
  | "AI_COMBO_GROUNDING"
  | "AI_COLLECTION_AWARE_RECS"
  | "AI_CONFIRMED_MEMORY"
  | "AI_STRICT_RECOMMENDATION_VALIDATOR";

const DEFAULT_ENABLED: Record<AiIntelligenceFlag, boolean> = {
  AI_INTELLIGENCE_PACKET: true,
  AI_TOOL_REGISTRY_V2: true,
  AI_COMBO_GROUNDING: true,
  AI_COLLECTION_AWARE_RECS: true,
  AI_CONFIRMED_MEMORY: true,
  AI_STRICT_RECOMMENDATION_VALIDATOR: true,
};

export function isAiIntelligenceFlagEnabled(flag: AiIntelligenceFlag): boolean {
  const raw = process.env[flag];
  if (raw == null || raw === "") return DEFAULT_ENABLED[flag];
  return !/^(0|false|off|no)$/i.test(raw.trim());
}

export function enabledAiIntelligenceFlags(): AiIntelligenceFlag[] {
  return (Object.keys(DEFAULT_ENABLED) as AiIntelligenceFlag[]).filter(isAiIntelligenceFlagEnabled);
}
