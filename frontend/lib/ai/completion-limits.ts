/**
 * Centralized completion token limits for AI requests
 * All newer OpenAI models (GPT-4o, GPT-4.1, GPT-5, etc.) use max_completion_tokens
 * Legacy models (gpt-3.5, early gpt-4) are deprecated and should not be used
 */
export const COMPLETION_LIMITS = {
  scan: 2048,          // AI Deck Scan suggestions (increased for gpt-5 reasoning tokens)
  suggestions: 800,    // General card suggestions
  chat: 1200,          // Chat responses
  stream: 1000,        // Streaming chat responses
  analyze: 2000,       // Deck analysis
  compare: 1000,       // Deck comparison
  debug: 32,           // Debug/test calls
  admin: 3000,         // Admin AI tests
} as const;

/**
 * Check if a model supports max_completion_tokens
 * All current models (GPT-4o, GPT-4.1, GPT-5, etc.) use max_completion_tokens
 * O1/O3 models don't support any max token parameter
 */
export function shouldUseMaxCompletionTokens(model: string): boolean {
  const modelLower = model.toLowerCase();
  // O1/O3 models don't support max token parameters at all
  if (modelLower.includes('o1') || modelLower.includes('o3')) {
    return false; // Don't add any parameter
  }
  // All other current models use max_completion_tokens
  return true;
}

/**
 * Get the appropriate max token parameter for a model
 * Returns null for models that don't support it (o1/o3)
 */
export function getMaxTokenParam(model: string, limit: number): { max_completion_tokens?: number } | {} {
  if (!shouldUseMaxCompletionTokens(model)) {
    return {}; // O1/O3 models - don't add parameter
  }
  return { max_completion_tokens: limit };
}
