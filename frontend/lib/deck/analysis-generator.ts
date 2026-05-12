// lib/deck/analysis-generator.ts
// Generates full deck analysis text with JSON output mode.
// One `callLLM` for the main analysis output. Key-card selection may run an optional prepass LLM (selector only; fail-open).

import { getModelForTier } from "@/lib/ai/model-by-tier";
import { getPreferredApiSurface } from "@/lib/ai/modelCapabilities";
import { callLLM } from "@/lib/ai/unified-llm-client";
import { MAX_DECK_ANALYZE_OUTPUT_TOKENS, MAX_DECK_ANALYZE_DECK_TEXT_CHARS } from "@/lib/feature-limits";
import { formatCommanderGroundingForPrompt } from "@/lib/deck/commander-grounding";
import { parseDeckText } from "@/lib/deck/parseDeckText";
import { selectKeyCardsForGrounding } from "@/lib/deck/select-key-cards";
import {
  formatKeyCardsGroundingForPrompt,
  KEY_CARDS_GROUNDING_INSTRUCTION,
} from "@/lib/deck/key-card-grounding";
import type { InferredDeckContext } from "./inference";
import type { DeckAnalysisJSON } from "./analysis-validator";

export type AnalysisGenerationOptions = {
  systemPrompt: string;
  deckText: string;
  context: InferredDeckContext;
  userMessage?: string;
  commanderProfile?: any;
  maxTokens?: number;
  /** Optional: for rate limiting and model selection (guest/free/pro). */
  userId?: string | null;
  /** Optional: when true, uses Pro model for deck_analysis. */
  isPro?: boolean;
  /** Optional: when set, maxTokens is derived from this (small/medium/large deck). */
  deckSize?: number;
  /** Optional: for single-flight guard; only one LLM call per requestId. Do not reuse for slot-planning/candidate calls. */
  requestId?: string;
  /** Optional: where the analyze was triggered (e.g. deck_page_analyze, homepage, build_assistant) */
  sourcePage?: string;
  /** Optional: ai_test | manatap_app from resolveAiUsageSourceForRequest */
  usageSource?: string;
};

/**
 * Token limit by deck size (same logic as /api/deck/analyze).
 * Small <60: 800, 60-100: 1200, >100: 1500.
 */
function calculateDynamicTokens(deckSize: number): number {
  if (deckSize < 60) return 800;
  if (deckSize <= 100) return 1200;
  return 1500;
}

/** Single-flight per requestId: map of requestId -> timestamp (at). Pruned by TTL on each call. */
const analysisFlightByRequestId = new Map<string, number>();
const ANALYSIS_FLIGHT_TTL_MS = 5 * 60 * 1000;

function pruneAnalysisFlightMap(): void {
  const now = Date.now();
  for (const [id, at] of analysisFlightByRequestId.entries()) {
    if (now - at > ANALYSIS_FLIGHT_TTL_MS) analysisFlightByRequestId.delete(id);
  }
}

/**
 * Generates a full deck analysis with both text and JSON output
 */
export async function generateDeckAnalysis(
  options: AnalysisGenerationOptions
): Promise<{ text: string; json: DeckAnalysisJSON | null }> {
  const {
    systemPrompt,
    deckText: rawDeckText,
    context,
    userMessage,
    commanderProfile,
    maxTokens: maxTokensOpt,
    userId,
    isPro,
    deckSize,
    requestId,
    sourcePage,
    usageSource,
  } = options;

  // Input trim: hard cap on deck list length; add note so model focuses on highest-signal info
  let deckText = rawDeckText;
  if (deckText.length > MAX_DECK_ANALYZE_DECK_TEXT_CHARS) {
    deckText = deckText.slice(0, MAX_DECK_ANALYZE_DECK_TEXT_CHARS) + "\n\n[Deck list truncated for length; focus on highest-signal info.]";
  }

  let maxTokens = deckSize !== undefined
    ? calculateDynamicTokens(deckSize)
    : (maxTokensOpt ?? 2000);
  maxTokens = Math.min(maxTokens, MAX_DECK_ANALYZE_OUTPUT_TOKENS);

  const tierRes = getModelForTier({
    isGuest: userId == null || userId === "",
    userId: userId ?? null,
    isPro: isPro ?? false,
    useCase: "deck_analysis",
  });
  const apiSurface = getPreferredApiSurface(tierRes.model);
  const apiType = apiSurface === "responses" ? "responses" : "chat";

  // Build user prompt
  const format = context.format || "Commander";
  const colors = context.colors || [];
  const commander = context.commander || "";
  const archetype = context.archetype || "";
  const powerLevel = (context as any).powerLevel || "";

  let commanderGrounding: string | null = null;
  if (commander) {
    try {
      commanderGrounding = await formatCommanderGroundingForPrompt(commander);
    } catch {
      commanderGrounding = null;
    }
  }

  let keyCardsGrounding: string | null = null;
  let keyCardsInstruction = "";
  let protectedRoleCardsPrompt = "";
  try {
    const parsedNames = parseDeckText(deckText).map((e) => e.name);
    if (parsedNames.length > 0) {
      const keyNames = await selectKeyCardsForGrounding({
        cardNames: parsedNames,
        commander: commander || null,
        v2Summary: null,
        fingerprintText: null,
        maxCards: 5,
      });
      keyCardsGrounding = await formatKeyCardsGroundingForPrompt(keyNames);
      if (keyCardsGrounding) keyCardsInstruction = KEY_CARDS_GROUNDING_INSTRUCTION;
    }
  } catch {
    keyCardsGrounding = null;
    keyCardsInstruction = "";
  }

  try {
    const { buildProtectedRoleCardsPrompt } = await import("@/lib/deck/protected-role-cards");
    protectedRoleCardsPrompt = await buildProtectedRoleCardsPrompt({
      deckText,
      commander: commander || null,
      limit: 14,
    });
  } catch {
    protectedRoleCardsPrompt = "";
  }

  const userPrompt = [
    `Format: ${format}`,
    `Deck colors: ${colors.join(", ") || "Colorless"}`,
    commander ? `Commander: ${commander}` : "",
    commanderGrounding || "",
    keyCardsInstruction || "",
    keyCardsGrounding || "",
    protectedRoleCardsPrompt || "",
    archetype ? `Detected archetype: ${archetype}` : "",
    powerLevel ? `Power level: ${powerLevel}` : "",
    commanderProfile?.plan ? `Commander plan: ${commanderProfile.plan}` : "",
    commanderProfile?.preferTags?.length ? `Prefer tags: ${commanderProfile.preferTags.join(", ")}` : "",
    commanderProfile?.avoid?.length ? `Avoid: ${commanderProfile.avoid.join(", ")}` : "",
    userMessage ? `User message: ${userMessage}` : "",
    "",
    "Decklist:",
    deckText,
    "",
    "=== INSTRUCTIONS ===",
    "Analyze this deck and provide:",
    "1. Clear archetype identification",
    "2. Restate the deck's game plan",
    "3. Problems-first analysis (list weaknesses, bottlenecks, missing categories)",
    "4. At least one synergy chain explanation",
    "5. At least 3 specific, legal card recommendations that respect color identity",
    "",
    "Your response must include BOTH:",
    "- Natural language analysis (shown to user)",
    "- JSON object with structured data (for validation)",
    "",
    "Format your response as:",
    "```json",
    "{",
    '  "commander_name": "...",',
    '  "archetype": "...",',
    '  "game_plan": "...",',
    '  "problems": ["problem 1", "problem 2", ...],',
    '  "synergy_chains": ["chain 1", "chain 2", ...],',
    '  "recommendations": [',
    '    {"card_name": "...", "reason": "..."},',
    '    ...',
    "  ]",
    "}",
    "```",
    "",
    "Follow the JSON with your natural language analysis.",
  ].filter(Boolean).join("\n");

  const messages =
    apiType === "responses"
      ? [
          { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
          { role: "user", content: [{ type: "input_text", text: userPrompt }] },
        ]
      : [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ];

  try {
    if (requestId) {
      pruneAnalysisFlightMap();
      if (analysisFlightByRequestId.has(requestId)) {
        throw new Error("[generateDeckAnalysis] Assertion: single LLM call per analysis; double-call detected.");
      }
      analysisFlightByRequestId.set(requestId, Date.now());
    }
    const response = await callLLM(messages as any, {
      route: "/api/deck/analyze",
      feature: "deck_analyze",
      model: tierRes.model,
      fallbackModel: tierRes.fallbackModel,
      timeout: 300000,
      maxTokens,
      apiType,
      userId: userId ?? undefined,
      isPro: isPro ?? false,
      promptPreview: (systemPrompt + "\n" + userPrompt).slice(0, 1000),
      responsePreview: null,
      deckSize: deckSize ?? undefined,
      source_page: sourcePage ?? null,
      source: usageSource ?? null,
    });

    const text = response.text;

    // Extract JSON from response
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    let json: DeckAnalysisJSON | null = null;

    if (jsonMatch) {
      try {
        json = JSON.parse(jsonMatch[1]) as DeckAnalysisJSON;
      } catch (e) {
        console.warn("[generateDeckAnalysis] Failed to parse JSON:", e);
      }
    }

    // Extract text (everything after JSON block, or full response if no JSON)
    let outText = text;
    if (jsonMatch) {
      const textStart = text.indexOf("```", jsonMatch.index! + jsonMatch[0].length);
      if (textStart !== -1) {
        outText = text.substring(textStart + 3).trim();
      } else {
        outText = text.substring(0, jsonMatch.index).trim();
      }
    }

    return { text: outText, json };
  } catch (error) {
    console.error("[generateDeckAnalysis] Error:", error);
    throw error;
  } finally {
    if (requestId) analysisFlightByRequestId.delete(requestId);
  }
}
