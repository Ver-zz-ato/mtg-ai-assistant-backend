/**
 * Conversation summary generation for multi-turn memory
 */

export interface ConversationSummary {
  format?: string;
  budget?: string;
  colors?: string[];
  playstyle?: string;
  deckGoals?: string[];
  archetype?: string;
}

/**
 * Generate a summary prompt for the LLM
 */
export function buildSummaryPrompt(messages: Array<{ role: string; content: string }>): string {
  const recentMessages = messages.slice(-20).map(m => `${m.role}: ${m.content}`).join('\n');
  
  return `Extract key facts from this conversation and return a concise summary in JSON format:
{
  "format": "Commander/Modern/Standard/etc or null",
  "budget": "budget/cheap/expensive/etc or null",
  "colors": ["W", "U", "B", "R", "G"] or [],
  "playstyle": "casual/competitive/optimized/etc or null",
  "deckGoals": ["goal1", "goal2"] or [],
  "archetype": "tokens/aristocrats/control/etc or null"
}

Conversation:
${recentMessages}

Return only valid JSON, no other text.`;
}

/**
 * Parse summary from LLM response
 */
export function parseSummary(response: string): ConversationSummary | null {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(response);
  } catch {
    return null;
  }
}

/**
 * Format summary for injection into system prompt
 */
export function formatSummaryForPrompt(summary: ConversationSummary): string {
  const parts: string[] = [];
  
  if (summary.format) parts.push(`Format: ${summary.format}`);
  if (summary.budget) parts.push(`Budget: ${summary.budget}`);
  if (summary.colors && summary.colors.length > 0) parts.push(`Colors: ${summary.colors.join(', ')}`);
  if (summary.playstyle) parts.push(`Playstyle: ${summary.playstyle}`);
  if (summary.archetype) parts.push(`Archetype: ${summary.archetype}`);
  if (summary.deckGoals && summary.deckGoals.length > 0) parts.push(`Goals: ${summary.deckGoals.join(', ')}`);
  
  if (parts.length === 0) return '';
  return `\n\nConversation context: ${parts.join(' | ')}`;
}

