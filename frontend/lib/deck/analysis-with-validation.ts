// lib/deck/analysis-with-validation.ts
// Wrapper that generates deck analysis with validation and retry logic

import { generateDeckAnalysis, type AnalysisGenerationOptions } from "./analysis-generator";
import { validateDeckAnalysis, type ValidationContext, type DeckAnalysisJSON } from "./analysis-validator";

export type ValidatedAnalysisResult = {
  text: string;
  json: DeckAnalysisJSON | null;
  validationErrors: string[];
  validationWarnings: string[];
  retryCount: number;
};

const MAX_RETRIES = 2;

/**
 * Generates deck analysis with validation and automatic retry on failure
 */
export async function generateValidatedDeckAnalysis(
  options: AnalysisGenerationOptions,
  context: ValidationContext
): Promise<ValidatedAnalysisResult> {
  let lastResult: { text: string; json: DeckAnalysisJSON | null } | null = null;
  let lastValidation: { valid: boolean; errors: string[]; warnings: string[] } | null = null;
  let retryCount = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Generate analysis
      const result = await generateDeckAnalysis(options);
      lastResult = result;

      // Validate
      const validation = await validateDeckAnalysis(result.text, result.json, context);
      lastValidation = validation;

      // If valid, return
      if (validation.valid) {
        return {
          text: result.text,
          json: result.json,
          validationErrors: [],
          validationWarnings: validation.warnings,
          retryCount: attempt,
        };
      }

      // If not valid and we have retries left, add validation feedback to prompt
      if (attempt < MAX_RETRIES) {
        const errorList = validation.errors.join("\n- ");
        const retryPrompt = `\n\n=== VALIDATION FAILED - REGENERATE ===\n\nYour previous answer failed validation for the following reasons:\n- ${errorList}\n\nRegenerate a corrected answer that satisfies all requirements:\n- Include all required JSON fields\n- Ensure all recommendations are legal, on-color, and not banned\n- Provide clear archetype identification\n- Include problems-first analysis\n- Explain at least one synergy chain\n- Provide at least 3 legal recommendations`;

        // Update system prompt with validation feedback
        options.systemPrompt = options.systemPrompt + retryPrompt;
        retryCount = attempt + 1;
      }
    } catch (error) {
      console.error(`[generateValidatedDeckAnalysis] Attempt ${attempt + 1} failed:`, error);
      if (attempt === MAX_RETRIES) {
        // Final attempt failed, return what we have with errors
        return {
          text: lastResult?.text || "Deck analysis generation failed. Please try again.",
          json: lastResult?.json || null,
          validationErrors: lastValidation?.errors || [String(error)],
          validationWarnings: lastValidation?.warnings || [],
          retryCount: attempt + 1,
        };
      }
    }
  }

  // If we get here, all retries exhausted
  return {
    text: lastResult?.text || "Deck analysis failed validation after multiple attempts. Please try again.",
    json: lastResult?.json || null,
    validationErrors: lastValidation?.errors || ["Validation failed after all retries"],
    validationWarnings: lastValidation?.warnings || [],
    retryCount: MAX_RETRIES + 1,
  };
}

