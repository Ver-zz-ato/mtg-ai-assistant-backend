/**
 * Few-shot learning utilities
 */

export interface UserExample {
  id: string;
  query: string;
  response: string;
  feedback: 'positive' | 'negative' | 'neutral';
  category?: string;
  tags?: string[];
}

/**
 * Find similar examples for few-shot injection
 */
export async function findSimilarExamples(
  query: string,
  category?: string,
  tags?: string[],
  limit: number = 3
): Promise<UserExample[]> {
  try {
    const response = await fetch('/api/ai/examples/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, category, tags, limit }),
    });
    
    const data = await response.json();
    return data.examples || [];
  } catch {
    return [];
  }
}

/**
 * Format examples for prompt injection
 */
export function formatExamplesForPrompt(examples: UserExample[]): string {
  if (examples.length === 0) return '';
  
  const formatted = examples.map((ex, i) => 
    `Example ${i + 1}:
User: ${ex.query}
Assistant: ${ex.response}`
  ).join('\n\n');
  
  return `\n\nHere are some successful examples of similar interactions:\n${formatted}\n\nUse these as reference for tone and approach.`;
}

