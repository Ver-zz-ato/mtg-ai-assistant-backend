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
  
  // PRIORITY 1: Extract cards marked by AI using [[Card Name]] format
  // This is the most reliable method since the AI explicitly marks them
  const markedCardPattern = /\[\[([^\]]+)\]\]/g;
  let markedMatch;
  while ((markedMatch = markedCardPattern.exec(text)) !== null) {
    const cardName = markedMatch[1].trim();
    // Basic validation - card names should be reasonable length and not empty
    if (cardName.length >= 2 && cardName.length <= 50 && !/^[\d\s\-\(\)]+$/.test(cardName)) {
      cards.push({ name: cardName, context: 'list', lineNumber: 0 });
    }
  }
  
  // If we found marked cards, return them (AI marking takes priority)
  if (cards.length > 0) {
    // Deduplicate
    const seen = new Set<string>();
    const unique = cards.filter(card => {
      const normalized = card.name.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
    return unique.slice(0, 10);
  }
  
  // PRIORITY 2: Fall back to regex pattern detection (for backward compatibility)
  const lines = text.split(/\r?\n/);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Check if current line is a numbered list item with card name
    // Handle multi-line format where description might be on next line
    
    // Pattern 1: Numbered lists with card names - "1.Lightning Bolt" or "1. **Shock** - Description"
    // Handles both "1.Lightning Bolt" (no space) and "1. Shock - Description" (with space)
    // Also handles "1.Lightning Bolt" followed by description on next line
    // Skip section headers like "1.Add Creatures:" or "1.Incorporate Sorceries:"
    // Use greedy match to capture full card name (e.g., "Lightning Bolt" not just "Lightning")
    // Card names can include: apostrophes (Narset's), commas (Torbran, Thane), hyphens, colons
    const numberedMatch = line.match(/^(\d+)[\.\)]\s*(?:\*\*)?([A-Z][A-Za-z0-9\s,:'\-]{2,50})(?:\*\*)?(?:\s*[-:—]|$)/);
    if (numberedMatch) {
      let cardName = numberedMatch[2].trim();
      cardName = stripMarkdown(cardName);
      
      // If description is on same line, extract just the card name part
      // Remove everything after dash/colon if present
      const descMatch = cardName.match(/^(.+?)\s*[-:—]/);
      if (descMatch) {
        cardName = descMatch[1].trim();
      }
      
      // Skip section headers - they start with verbs like "Add", "Include", "Incorporate", "Fill"
      const lower = cardName.toLowerCase();
      if (/^(add|include|incorporate|enhance|consider|fill|to|with|for|by)\s/.test(lower)) {
        continue;
      }
      
      // Skip if it's clearly a description/sentence (ends with common words)
      if (/\s(to|for|with|from|in|on|at|and|or|the|a|an)\s*$/.test(lower)) {
        continue;
      }
      
      if (isCommonPhrase(cardName)) {
        continue;
      }
      
      // Must be at least 2 words unless it's a long single word OR a common single-word card name
      const wordCount = cardName.split(/\s+/).length;
      if (wordCount < 2 && cardName.length < 8) {
        // Allow single short words only if they're very common card names
        // Expanded list based on common MTG single-word cards
        const commonSingleWords = [
          'shock', 'bolt', 'sword', 'shield', 'staff', 'whip', 'guide', 'chandra',
          'jace', 'liliana', 'garruk', 'ajani', 'nissa', 'sorin', 'gideon', 'karn',
          'teferi', 'kaya', 'dovin', 'domri', 'huatli', 'kiora', 'saheeli', 'samut',
          'angrath', 'vraska', 'ral', 'tibalt', 'tamiyo', 'ashiok', 'daretti',
          'freyalise', 'nahiri', 'ob', 'ugin', 'estrid', 'will', 'kenrith'
        ];
        if (!commonSingleWords.includes(lower)) {
          continue;
        }
      }
      
      if (isValidCardName(cardName)) {
        cards.push({ name: cardName, context: 'list', lineNumber: i });
        continue;
      }
    }
    
    // Pattern 2a: Multiple cards separated by dash on bulleted line - "- Expressive Iteration - Faithless Looting"
    // This MUST come BEFORE Pattern 2 to catch multi-card lines first
    // Also handles "e.g., Card1, Card2" format
    const multiCardLine = line.match(/^[\-\*\•]\s+(?:\*\*)?([A-Z][A-Za-z0-9\s,:'\-]{2,35}?)(?:\*\*)?\s*[-:—]\s+(?:\*\*)?([A-Z][A-Za-z0-9\s,:'\-]{2,35}?)(?:\*\*)?(?:\s|$)/);
    if (multiCardLine) {
      const card1 = stripMarkdown(multiCardLine[1].trim());
      const card2 = stripMarkdown(multiCardLine[2].trim());
      
      if (isValidCardName(card1) && !isCommonPhrase(card1) && card1.split(/\s+/).length <= 5) {
        cards.push({ name: card1, context: 'list', lineNumber: i });
      }
      if (isValidCardName(card2) && !isCommonPhrase(card2) && card2.split(/\s+/).length <= 5) {
        cards.push({ name: card2, context: 'list', lineNumber: i });
      }
      continue; // Skip other patterns for this line
    }
    
    // Pattern 1b: "e.g., Card Name" or "e.g. Card Name" format
    const egMatch = line.match(/\be\.g\.?[,:]?\s+(?:\*\*)?([A-Z][A-Za-z0-9\s,:'\-]{2,50}?)(?:\*\*)?/i);
    if (egMatch) {
      let cardName = stripMarkdown(egMatch[1].trim());
      // Remove trailing period if present
      cardName = cardName.replace(/\.$/, '').trim();
      
      // Handle comma-separated lists like "e.g., Card1, Card2"
      const commaSplit = cardName.split(',').map(s => s.trim()).filter(Boolean);
      for (const namePart of commaSplit) {
        if (isValidCardName(namePart) && !isCommonPhrase(namePart) && namePart.split(/\s+/).length <= 5) {
          cards.push({ name: namePart, context: 'list', lineNumber: i });
        }
      }
      if (commaSplit.length > 0) continue;
    }
    
    // Pattern 1c: Parenthetical card mentions like "Consider (Card Name)" or "Add (Card Name)"
    const parenMatch = line.match(/\((?:\*\*)?([A-Z][A-Za-z0-9\s,:'\-]{2,50}?)(?:\*\*)?\)/);
    if (parenMatch) {
      const cardName = stripMarkdown(parenMatch[1].trim());
      // Skip if it's a section header like "(3–5 Cards)"
      if (!/^\d+/.test(cardName) && !isCommonPhrase(cardName) && isValidCardName(cardName) && cardName.split(/\s+/).length <= 5) {
        cards.push({ name: cardName, context: 'list', lineNumber: i });
        continue;
      }
    }
    
    // Pattern 2: Bulleted lists with dash/colon - "- **Sol Ring** - Description" or "* Sol Ring: Description"
    // Matches formats like "- Card Name: Description" or "- Card Name - Description"
    // Card names can have: apostrophes (Narset's), commas (Torbran, Thane), "The" prefix
    const bulletMatch = line.match(/^[\-\*\•]\s+(?:\*\*)?([A-Z][A-Za-z0-9\s,:'\-]{2,50}?)(?:\*\*)?\s*[-:—]\s+(.+)$/);
    if (bulletMatch) {
      let cardName = bulletMatch[1].trim();
      cardName = stripMarkdown(cardName);
      
      // Skip section headers and descriptions
      const lower = cardName.toLowerCase();
      if (/^(add|include|incorporate|enhance|consider|fill|to|with|for|by|good|great|powerful|strong|versatile|useful|excellent|solid)\s/.test(lower)) {
        continue;
      }
      
      // Only accept if it's clearly a card name (not a section header, not a single descriptive word)
      // Must be at least 2 words unless it's a long single word (8+ chars) OR common single-word card
      const wordCount = cardName.split(/\s+/).length;
      if (wordCount < 2 && cardName.length < 8) {
        // Allow common single-word cards
        const commonSingleWords = ['shock', 'bolt', 'sword', 'shield', 'staff', 'whip', 'guide', 'chandra', 'jace', 'liliana'];
        if (!commonSingleWords.includes(lower)) {
          continue;
        }
      }
      
      if (isValidCardName(cardName) && !isCommonPhrase(cardName)) {
        cards.push({ name: cardName, context: 'list', lineNumber: i });
        continue;
      }
    }
    
    // Pattern 3: Bulleted lists with just card name (no description) - "- Improbable Alliance" or "- **Aetherling**"
    // This must come AFTER Pattern 2 to avoid conflicts
    // Only match if it looks like a real card name (2+ words OR long single word with proper capitalization)
    const bulletCardOnlyMatch = line.match(/^[\-\*\•]\s+(?:\*\*)?([A-Z][A-Za-z0-9\s,:'\-]{2,50}?)(?:\*\*)?\s*$/);
    if (bulletCardOnlyMatch) {
      let cardName = bulletCardOnlyMatch[1].trim();
      cardName = stripMarkdown(cardName);
      const lower = cardName.toLowerCase();
      const wordCount = cardName.split(/\s+/).length;
      
      // Skip section headers and common phrases
      if (/^(add|include|incorporate|enhance|consider|fill|to|with|for|by)\s/.test(lower)) {
        continue;
      }
      
      // Must be at least 2 words (most card names are multi-word), OR a single long word (8+ chars)
      // This filters out single descriptive words like "Good", "Great", etc.
      if (wordCount < 2 && cardName.length < 8) {
        // Allow common single-word cards
        const commonSingleWords = ['shock', 'bolt', 'sword', 'shield', 'staff', 'whip', 'guide', 'chandra', 'jace', 'liliana'];
        if (!commonSingleWords.includes(lower)) {
          continue; // Skip single short words
        }
      }
      
      // Check if it's a valid card name (not a full sentence, max 5 words)
      if (isValidCardName(cardName) && !isCommonPhrase(cardName) && wordCount <= 5) {
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
 * Handles common MTG card name patterns:
 * - Apostrophes: "Narset's Reversal", "Karn's Sylex"
 * - Commas: "Torbran, Thane of Red Fell", "Yawgmoth, Thran Physician"
 * - Hyphens: "Jace, Vryn's Prodigy" (though hyphens in names are rare)
 * - "The" prefix: "The Scarab God", "The Gitrog Monster"
 * - Planeswalker names: "Chandra, Torch of Defiance"
 */
function isValidCardName(text: string): boolean {
  // Must start with a letter or number (or "The")
  if (!/^[A-Za-z0-9]/.test(text) && !text.startsWith('The ')) return false;
  
  // Must be between 2 and 50 characters (longer for complex names)
  if (text.length < 2 || text.length > 50) return false;
  
  // Should not contain sentence-ending punctuation
  if (/[!?;]/.test(text)) return false;
  
  // Should not be all lowercase (card names are title case, except "the" prefix)
  const withoutThe = text.replace(/^The\s+/i, '');
  if (withoutThe === withoutThe.toLowerCase() && withoutThe.length > 0) return false;
  
  // Should not end with common sentence fragments
  if (/\b(and|or|the|to|for|with|from|in|on|at|it|this|that|them|you|your|my|their|our)$/i.test(text)) return false;
  
  // Should not contain multiple consecutive spaces (likely a sentence)
  if (/\s{2,}/.test(text)) return false;
  
  // Card names typically have at least one capital letter (except "the" prefix)
  if (!/[A-Z]/.test(text.replace(/^The\s+/i, ''))) return false;
  
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
    'first turn', 'powerful spells',
    // Common descriptive words
    'good', 'great', 'powerful', 'strong', 'weak',
    'best', 'worst', 'better', 'worse',
    'a powerful', 'a great', 'a good', 'a strong',
    'recursion', 'evasion', 'synergy', 'versatile',
    'include', 'add', 'consider', 'helps', 'fetch',
    // Section headers
    'add creatures', 'include more', 'add basic', 'consider utility',
    'incorporate sorceries', 'fill with fun', 'enhance mana',
    'cards', 'card', 'spells', 'spell', 'lands', 'land'
  ];
  
  // Check if it's a common phrase
  if (commonPhrases.some(phrase => lower.includes(phrase))) return true;
  
  // Check if it starts with common verbs/articles (likely a description or section header)
  if (/^(add|include|incorporate|enhance|consider|fill|to|with|for|by|helps|fetch|retrieve|get|use|play|run|cast|a|an|the|good|great|powerful|strong|best|worst|better|worse|recursion|evasion|synergy|versatile|card|spell|land|excellent|solid|useful|versatile|effective|efficient)\b/i.test(text)) return true;
  
  // Check if it's a section header (contains parentheses with numbers)
  if (/\([^)]*\d+[^)]*\)/.test(text)) return true;
  
  // Check if it's a full sentence (has many words)
  const wordCount = text.split(/\s+/).length;
  if (wordCount > 6) return true; // Card names are rarely more than 6 words
  
  // Single words are usually not card names (except very specific ones)
  if (wordCount === 1 && text.length < 8) {
    // Allow some single-word card names if they're long enough
    if (text.length < 6) return true;
  }
  
  return false;
}
