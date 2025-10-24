// lib/chat/cardImageDetector.ts
// Intelligently extract card names from AI responses for image display

export type ExtractedCard = {
  name: string;
  context: 'list' | 'suggestion' | 'comparison';
  lineNumber: number;
};

/**
 * Extract card names from AI response text
 * ONLY extracts from numbered/bulleted lists to avoid false positives
 */
export function extractCardsForImages(text: string): ExtractedCard[] {
  const cards: ExtractedCard[] = [];
  const lines = text.split(/\r?\n/);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // ONLY extract from numbered/bulleted lists with card descriptions
    // Pattern 1: Numbered lists - "1. **Cultivate** - Description" or "1. Cultivate - Description"
    const numberedMatch = line.match(/^(\d+)[\.\)]\s+(?:\*\*)?([A-Z][^*\-:\n]{2,45}?)(?:\*\*)?\s*[-:—]/);
    if (numberedMatch) {
      let cardName = numberedMatch[2].trim();
      cardName = stripMarkdown(cardName);
      if (isValidCardName(cardName) && !isCommonPhrase(cardName)) {
        cards.push({ name: cardName, context: 'list', lineNumber: i });
        continue;
      }
    }
    
    // Pattern 2: Bulleted lists - "- **Sol Ring** - Description" or "* Sol Ring - Description"
    const bulletMatch = line.match(/^[\-\*\•]\s+(?:\*\*)?([A-Z][^*\-:\n]{2,45}?)(?:\*\*)?\s*[-:—]/);
    if (bulletMatch) {
      let cardName = bulletMatch[1].trim();
      cardName = stripMarkdown(cardName);
      if (isValidCardName(cardName) && !isCommonPhrase(cardName)) {
        cards.push({ name: cardName, context: 'list', lineNumber: i });
        continue;
      }
    }
  }
  
  // Deduplicate by name (keep first occurrence)
  const seen = new Set<string>();
  const unique = cards.filter(card => {
    const normalized = card.name.toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
  
  // Limit to 10 cards per message
  return unique.slice(0, 10);
}

/**
 * Check if a string is a valid card name
 */
function isValidCardName(text: string): boolean {
  // Must start with a letter or number
  if (!/^[A-Za-z0-9]/.test(text)) return false;
  
  // Must be between 2 and 45 characters
  if (text.length < 2 || text.length > 45) return false;
  
  // Should not contain sentence-ending punctuation
  if (/[!?;]/.test(text)) return false;
  
  // Should not be all lowercase (card names are title case)
  if (text === text.toLowerCase()) return false;
  
  // Should not end with common sentence fragments
  if (/\b(and|or|the|to|for|with|from|in|on|at)$/i.test(text)) return false;
  
  return true;
}

/**
 * Strip markdown formatting from text
 */
function stripMarkdown(text: string): string {
  // Remove bold: **text** or __text__
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  
  // Remove italic: *text* or _text_
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/_([^_]+)_/g, '$1');
  
  // Remove inline code: `text`
  text = text.replace(/`([^`]+)`/g, '$1');
  
  // Remove strikethrough: ~~text~~
  text = text.replace(/~~([^~]+)~~/g, '$1');
  
  return text.trim();
}

/**
 * Filter out common phrases that aren't card names
 */
function isCommonPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  const commonPhrases = [
    'the deck', 'your deck', 'this deck', 'that deck',
    'the game', 'your game', 'this game',
    'the board', 'the stack', 'the graveyard',
    'mana base', 'card draw', 'card advantage',
    'early game', 'late game', 'mid game',
    'combat trick', 'removal spell',
    'the commander', 'your commander',
    'turn one', 'turn two', 'turn three',
    'each turn', 'each player', 'each opponent',
    'play it', 'use it', 'run it',
    'mana ramp', 'mana rock',
    'first turn', 'powerful spells'
  ];
  
  // Check if it's a common phrase
  if (commonPhrases.some(phrase => lower.includes(phrase))) return true;
  
  // Check if it's a full sentence (has many words)
  const wordCount = text.split(/\s+/).length;
  if (wordCount > 6) return true; // Card names are rarely more than 6 words
  
  return false;
}
