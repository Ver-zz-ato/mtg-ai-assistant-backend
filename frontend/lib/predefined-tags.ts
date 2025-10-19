/**
 * Predefined Deck Tags System
 * 
 * Tags are organized by category for easy filtering.
 * Users can select from this list or type custom text (with profanity filter).
 */

export interface TagDefinition {
  id: string;
  label: string;
  color: string; // Tailwind text color class
  bgColor: string; // Tailwind bg color class
  category: 'strategy' | 'budget' | 'power' | 'status' | 'format';
}

export const PREDEFINED_TAGS: TagDefinition[] = [
  // Strategy Tags
  { id: 'aggro', label: 'Aggro', color: 'text-red-200', bgColor: 'bg-red-900/30', category: 'strategy' },
  { id: 'control', label: 'Control', color: 'text-blue-200', bgColor: 'bg-blue-900/30', category: 'strategy' },
  { id: 'combo', label: 'Combo', color: 'text-purple-200', bgColor: 'bg-purple-900/30', category: 'strategy' },
  { id: 'midrange', label: 'Midrange', color: 'text-green-200', bgColor: 'bg-green-900/30', category: 'strategy' },
  { id: 'tempo', label: 'Tempo', color: 'text-cyan-200', bgColor: 'bg-cyan-900/30', category: 'strategy' },
  { id: 'ramp', label: 'Ramp', color: 'text-emerald-200', bgColor: 'bg-emerald-900/30', category: 'strategy' },
  { id: 'tribal', label: 'Tribal', color: 'text-amber-200', bgColor: 'bg-amber-900/30', category: 'strategy' },
  { id: 'tokens', label: 'Tokens', color: 'text-lime-200', bgColor: 'bg-lime-900/30', category: 'strategy' },
  { id: 'voltron', label: 'Voltron', color: 'text-yellow-200', bgColor: 'bg-yellow-900/30', category: 'strategy' },
  { id: 'stax', label: 'Stax', color: 'text-gray-200', bgColor: 'bg-gray-900/30', category: 'strategy' },
  
  // Budget Tags
  { id: 'budget', label: 'Budget', color: 'text-green-200', bgColor: 'bg-green-900/30', category: 'budget' },
  { id: 'expensive', label: 'High Budget', color: 'text-yellow-200', bgColor: 'bg-yellow-900/30', category: 'budget' },
  { id: 'no-proxies', label: 'No Proxies', color: 'text-teal-200', bgColor: 'bg-teal-900/30', category: 'budget' },
  
  // Power Level Tags
  { id: 'casual', label: 'Casual', color: 'text-green-200', bgColor: 'bg-green-900/30', category: 'power' },
  { id: 'focused', label: 'Focused', color: 'text-blue-200', bgColor: 'bg-blue-900/30', category: 'power' },
  { id: 'optimized', label: 'Optimized', color: 'text-purple-200', bgColor: 'bg-purple-900/30', category: 'power' },
  { id: 'competitive', label: 'cEDH', color: 'text-red-200', bgColor: 'bg-red-900/30', category: 'power' },
  
  // Status Tags
  { id: 'wip', label: 'Work in Progress', color: 'text-orange-200', bgColor: 'bg-orange-900/30', category: 'status' },
  { id: 'testing', label: 'Testing', color: 'text-yellow-200', bgColor: 'bg-yellow-900/30', category: 'status' },
  { id: 'complete', label: 'Complete', color: 'text-green-200', bgColor: 'bg-green-900/30', category: 'status' },
  { id: 'needs-cards', label: 'Needs Cards', color: 'text-red-200', bgColor: 'bg-red-900/30', category: 'status' },
  { id: 'tournament', label: 'Tournament Ready', color: 'text-purple-200', bgColor: 'bg-purple-900/30', category: 'status' },
  
  // Format Tags
  { id: 'commander', label: 'Commander', color: 'text-blue-200', bgColor: 'bg-blue-900/30', category: 'format' },
  { id: 'standard', label: 'Standard', color: 'text-green-200', bgColor: 'bg-green-900/30', category: 'format' },
  { id: 'modern', label: 'Modern', color: 'text-purple-200', bgColor: 'bg-purple-900/30', category: 'format' },
  { id: 'pauper', label: 'Pauper', color: 'text-gray-200', bgColor: 'bg-gray-900/30', category: 'format' },
  { id: 'legacy', label: 'Legacy', color: 'text-amber-200', bgColor: 'bg-amber-900/30', category: 'format' },
];

export const TAG_CATEGORIES = [
  { id: 'strategy', label: 'Strategy', emoji: '⚔️' },
  { id: 'budget', label: 'Budget', emoji: '💰' },
  { id: 'power', label: 'Power Level', emoji: '⚡' },
  { id: 'status', label: 'Status', emoji: '📊' },
  { id: 'format', label: 'Format', emoji: '🎮' },
] as const;

/**
 * Get tag definition by ID
 */
export function getTagDefinition(tagId: string): TagDefinition | undefined {
  return PREDEFINED_TAGS.find(t => t.id === tagId);
}

/**
 * Get tag definition by label (case-insensitive)
 */
export function getTagByLabel(label: string): TagDefinition | undefined {
  const normalized = label.toLowerCase().trim();
  return PREDEFINED_TAGS.find(t => t.label.toLowerCase() === normalized);
}

/**
 * Get tags by category
 */
export function getTagsByCategory(category: TagDefinition['category']): TagDefinition[] {
  return PREDEFINED_TAGS.filter(t => t.category === category);
}

/**
 * Simple profanity filter for custom tags
 * Returns true if text contains profanity
 */
const PROFANITY_LIST = [
  'fuck', 'shit', 'ass', 'bitch', 'damn', 'crap', 'piss', 'dick', 
  'cock', 'pussy', 'bastard', 'slut', 'whore', 'fag', 'nigger', 'cunt'
];

export function containsProfanity(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  return PROFANITY_LIST.some(word => normalized.includes(word));
}

/**
 * Validate and sanitize tag text
 */
export function validateTag(text: string): { valid: boolean; error?: string; sanitized?: string } {
  const trimmed = text.trim();
  
  if (!trimmed) {
    return { valid: false, error: 'Tag cannot be empty' };
  }
  
  if (trimmed.length > 30) {
    return { valid: false, error: 'Tag must be 30 characters or less' };
  }
  
  if (containsProfanity(trimmed)) {
    return { valid: false, error: 'Please keep tags appropriate' };
  }
  
  return { valid: true, sanitized: trimmed };
}


