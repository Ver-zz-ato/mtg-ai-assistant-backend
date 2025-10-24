// lib/chat/cardImageDetector.ts
// Smart card name extraction for displaying card images in chat
// Only extracts cards that appear in meaningful contexts (suggestions, lists, comparisons)

export type ExtractedCard = {
  name: string;
  context: 'list' | 'suggestion' | 'comparison';
  lineNumber: number;
};

/**
 * Extract card names from AI responses, but only when they appear in meaningful contexts
 * 
 * Extracts from:
 * - Numbered/bulleted lists: "1. Sol Ring" or "- Sol Ring"
 * - Explicit suggestions: "Add: Sol Ring", "Consider Sol Ring", "Try Sol Ring"
 * - Comparisons: "Sol Ring vs Arcane Signet"
 * 
 * Ignores casual mentions: "Sol Ring is powerful" (no context markers)
 */
export function extractCardsForImages(text: string): ExtractedCard[] {
  const cards: ExtractedCard[] = [];
  const lines = text.split(/\r?\n/);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Pattern 1: Numbered lists - "1. Sol Ring" or "1) Sol Ring"
    const numberedMatch = line.match(/^(\d+)[\.\)]\s+([^-:\n]+?)(?:\s*[-:]|$)/);
    if (numberedMatch) {
      let cardName = numberedMatch[2].trim();
      // Strip markdown formatting (bold, italic, etc.)
      cardName = stripMarkdown(cardName);
      if (isValidCardName(cardName)) {
        cards.push({ name: cardName, context: 'list', lineNumber: i });
        continue;
      }
    }
    
    // Pattern 2: Bulleted lists - "- Sol Ring" or "* Sol Ring"
    const bulletMatch = line.match(/^[\-\*\•]\s+([^-:\n]+?)(?:\s*[-:]|$)/);
    if (bulletMatch) {
      let cardName = bulletMatch[1].trim();
      // Strip markdown formatting
      cardName = stripMarkdown(cardName);
      if (isValidCardName(cardName)) {
        cards.push({ name: cardName, context: 'list', lineNumber: i });
        continue;
      }
    }
    
    // Pattern 3: Explicit suggestions - "Add: Sol Ring", "Consider Sol Ring", "Try Sol Ring"
    const suggestionMatch = line.match(/(?:add|consider|try|include|run|play|use):\s*([^,\n]+)/i);
    if (suggestionMatch) {
      let cardName = suggestionMatch[1].trim();
      cardName = stripMarkdown(cardName);
      if (isValidCardName(cardName)) {
        cards.push({ name: cardName, context: 'suggestion', lineNumber: i });
        continue;
      }
    }
    
    // Pattern 4: Verb-driven suggestions - "Consider adding Sol Ring"
    const verbMatch = line.match(/(?:consider|try|add|include|run|play|use)\s+(?:adding|running|playing|using)?\s*([A-Z][^,.\n]{2,40}?)(?:\s+(?:to|for|in)|[,.]|$)/i);
    if (verbMatch) {
      let cardName = verbMatch[1].trim();
      cardName = stripMarkdown(cardName);
      if (isValidCardName(cardName) && !isCommonPhrase(cardName)) {
        cards.push({ name: cardName, context: 'suggestion', lineNumber: i });
        continue;
      }
    }
    
    // Pattern 5: Comparisons - "Sol Ring vs Arcane Signet" or "Sol Ring or Arcane Signet"
    const comparisonMatch = line.match(/([A-Z][^,\n]{2,40}?)\s+(?:vs\.?|versus|or|instead of)\s+([A-Z][^,\n]{2,40}?)(?:[,.\n]|$)/i);
    if (comparisonMatch) {
      let card1 = comparisonMatch[1].trim();
      let card2 = comparisonMatch[2].trim();
      card1 = stripMarkdown(card1);
      card2 = stripMarkdown(card2);
      if (isValidCardName(card1) && !isCommonPhrase(card1)) {
        cards.push({ name: card1, context: 'comparison', lineNumber: i });
      }
      if (isValidCardName(card2) && !isCommonPhrase(card2)) {
        cards.push({ name: card2, context: 'comparison', lineNumber: i });
      }
      continue;
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
  
  // Limit to 10 cards per message to avoid overwhelming the UI
  return unique.slice(0, 10);
}

/**
 * Check if a string is likely a valid card name
 */
function isValidCardName(name: string): boolean {
  if (!name) return false;
  
  // Must be between 2 and 50 characters
  if (name.length < 2 || name.length > 50) return false;
  
  // Should start with a capital letter or number
  if (!/^[A-Z0-9]/.test(name)) return false;
  
  // Should contain at least one letter
  if (!/[a-zA-Z]/.test(name)) return false;
  
  // Should not contain excessive punctuation
  const punctuationCount = (name.match(/[.,;:!?]/g) || []).length;
  if (punctuationCount > 2) return false;
  
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
    'each turn', 'each player', 'each opponent'
  ];
  
  return commonPhrases.some(phrase => lower.includes(phrase));
}

