// lib/deck/analysis-generator.ts
// Generates full deck analysis text with JSON output mode

import { callOpenAI } from "../ai/openai-client";
import type { InferredDeckContext } from "./inference";
import type { DeckAnalysisJSON } from "./analysis-validator";

export type AnalysisGenerationOptions = {
  systemPrompt: string;
  deckText: string;
  context: InferredDeckContext;
  userMessage?: string;
  commanderProfile?: any;
  temperature?: number;
  maxTokens?: number;
};

/**
 * Generates a full deck analysis with both text and JSON output
 */
export async function generateDeckAnalysis(
  options: AnalysisGenerationOptions
): Promise<{ text: string; json: DeckAnalysisJSON | null }> {
  const {
    systemPrompt,
    deckText,
    context,
    userMessage,
    commanderProfile,
    temperature = 0.35,
    maxTokens = 2000,
  } = options;

  // Build user prompt
  const format = context.format || "Commander";
  const colors = context.colors || [];
  const commander = context.commander || "";
  const archetype = context.archetype || "";
  const powerLevel = (context as any).powerLevel || "";

  const userPrompt = [
    `Format: ${format}`,
    `Deck colors: ${colors.join(", ") || "Colorless"}`,
    commander ? `Commander: ${commander}` : "",
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

  try {
    const response = await callOpenAI(systemPrompt, userPrompt, { temperature, maxTokens });
    
    // Extract JSON from response
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    let json: DeckAnalysisJSON | null = null;
    
    if (jsonMatch) {
      try {
        json = JSON.parse(jsonMatch[1]) as DeckAnalysisJSON;
      } catch (e) {
        console.warn("[generateDeckAnalysis] Failed to parse JSON:", e);
      }
    }

    // Extract text (everything after JSON block, or full response if no JSON)
    let text = response;
    if (jsonMatch) {
      const textStart = response.indexOf("```", jsonMatch.index! + jsonMatch[0].length);
      if (textStart !== -1) {
        text = response.substring(textStart + 3).trim();
      } else {
        // JSON at end, text is everything before
        text = response.substring(0, jsonMatch.index).trim();
      }
    }

    return { text, json };
  } catch (error) {
    console.error("[generateDeckAnalysis] Error:", error);
    throw error;
  }
}

