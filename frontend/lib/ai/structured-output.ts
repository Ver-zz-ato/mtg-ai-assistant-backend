/**
 * Structured output schemas for card suggestions
 */

export interface CardSuggestion {
  card_name: string;
  reason: string;
  synergy_with?: string[];
  price_usd?: number;
  format_legal: string[];
}

export interface StructuredCardSuggestions {
  suggestions: CardSuggestion[];
  summary?: string;
}

/**
 * JSON schema for OpenAI structured output
 */
export const cardSuggestionsSchema = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          card_name: { type: "string" },
          reason: { type: "string" },
          synergy_with: {
            type: "array",
            items: { type: "string" },
          },
          price_usd: { type: "number" },
          format_legal: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["card_name", "reason", "format_legal"],
      },
    },
    summary: { type: "string" },
  },
  required: ["suggestions"],
};

/**
 * Detect if response should use structured output
 */
export function shouldUseStructuredOutput(userQuery: string): boolean {
  const lower = userQuery.toLowerCase();
  return /suggest|recommend|add|card|deck|build/i.test(lower) && 
         !/how|why|what|explain|tell/i.test(lower);
}

/**
 * Parse structured output from LLM response
 */
export function parseStructuredOutput(response: string): StructuredCardSuggestions | null {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    const data = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(response);
    
    if (data.suggestions && Array.isArray(data.suggestions)) {
      return {
        suggestions: data.suggestions,
        summary: data.summary,
      };
    }
    return null;
  } catch {
    return null;
  }
}

