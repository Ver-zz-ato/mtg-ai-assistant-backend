/**
 * Format-specific knowledge injection
 */

import commanderKnowledge from './commander.json';
import modernKnowledge from './modern.json';
import standardKnowledge from './standard.json';

export type FormatKnowledge = {
  format: string;
  description: string;
  popularArchetypes: string[];
  staples: string[];
  banList: string[];
  metaTrends: string[];
};

const formatKnowledgeMap: Record<string, FormatKnowledge> = {
  commander: commanderKnowledge as FormatKnowledge,
  modern: modernKnowledge as FormatKnowledge,
  standard: standardKnowledge as FormatKnowledge,
};

/**
 * Get format knowledge for injection into prompts
 */
export function getFormatKnowledge(format?: string): FormatKnowledge | null {
  if (!format) return null;
  
  const normalized = format.toLowerCase();
  return formatKnowledgeMap[normalized] || null;
}

/**
 * Format knowledge for prompt injection
 */
export function formatKnowledgeForPrompt(knowledge: FormatKnowledge): string {
  const parts: string[] = [];
  
  parts.push(`Format: ${knowledge.format}`);
  parts.push(`Description: ${knowledge.description}`);
  
  if (knowledge.popularArchetypes.length > 0) {
    parts.push(`Popular archetypes: ${knowledge.popularArchetypes.join(', ')}`);
  }
  
  if (knowledge.staples.length > 0 && knowledge.staples[0] !== 'Varied by set rotation') {
    parts.push(`Common staples: ${knowledge.staples.slice(0, 5).join(', ')}`);
  }
  
  if (knowledge.metaTrends.length > 0) {
    parts.push(`Meta trends: ${knowledge.metaTrends.join('; ')}`);
  }
  
  return `\n\nFormat-specific context:\n${parts.join('\n')}`;
}

