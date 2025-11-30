/**
 * Confidence scoring utilities for AI responses
 */

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ConfidenceScore {
  level: ConfidenceLevel;
  score: number; // 0-100
  reasoning?: string;
}

/**
 * Evaluate confidence using self-evaluation prompt
 */
export function buildConfidencePrompt(response: string, userQuery: string): string {
  return `Rate your confidence in this response on a scale of 0-100, where:
- 90-100: High confidence (factual, well-established knowledge)
- 70-89: Medium confidence (generally true but context-dependent)
- 0-69: Low confidence (uncertain, speculative, or depends on meta)

User query: ${userQuery}

Your response: ${response}

Return JSON: {"score": 85, "level": "medium", "reasoning": "brief explanation"}`;
}

/**
 * Parse confidence from LLM response
 */
export function parseConfidence(response: string): ConfidenceScore | null {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    const data = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(response);
    const score = Math.max(0, Math.min(100, Number(data.score) || 50));
    
    let level: ConfidenceLevel = 'medium';
    if (score >= 90) level = 'high';
    else if (score < 70) level = 'low';
    
    return {
      level,
      score,
      reasoning: data.reasoning || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Add confidence disclaimers to response text
 */
export function addConfidenceDisclaimers(text: string, confidence: ConfidenceScore): string {
  if (confidence.level === 'high') {
    return text; // No disclaimers needed
  }
  
  if (confidence.level === 'low') {
    const disclaimer = "I'm not certain about this, but based on common practice";
    if (!text.toLowerCase().includes('not certain') && !text.toLowerCase().includes('depends')) {
      return `${disclaimer}, ${text.toLowerCase().startsWith('i') ? text.slice(1) : text}`;
    }
  }
  
  if (confidence.level === 'medium') {
    const disclaimer = "This depends on your meta, but generally";
    if (!text.toLowerCase().includes('depends') && !text.toLowerCase().includes('generally')) {
      return `${disclaimer}, ${text.toLowerCase().startsWith('i') ? text.slice(1) : text}`;
    }
  }
  
  return text;
}

