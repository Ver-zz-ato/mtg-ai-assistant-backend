// frontend/lib/chat/commandParser.ts
// Parse simple deck editing commands from user input

export type DeckCommand = 
  | { type: 'add'; cards: Array<{ name: string; qty: number }> }
  | { type: 'remove'; cards: Array<{ name: string; qty: number }> }
  | { type: 'swap'; remove: string; add: string }
  | null;

/**
 * Parse user input for direct deck editing commands
 * Examples:
 * - "add Sol Ring"
 * - "add 2 Sol Ring"
 * - "remove Cultivate"
 * - "swap Cultivate for Kodama's Reach"
 * - "replace Cultivate with Kodama's Reach"
 */
export function parseDeckCommand(text: string): DeckCommand {
  const normalized = text.trim().toLowerCase();
  
  // ADD command: "add [qty] <card name>"
  const addMatch = normalized.match(/^add\s+(?:(\d+)\s+)?(.+)$/i);
  if (addMatch) {
    const qty = addMatch[1] ? parseInt(addMatch[1], 10) : 1;
    const cardName = addMatch[2].trim();
    if (cardName.length > 2 && cardName.length < 100) {
      return {
        type: 'add',
        cards: [{ name: cardName, qty }]
      };
    }
  }
  
  // REMOVE command: "remove [qty] <card name>"
  const removeMatch = normalized.match(/^remove\s+(?:(\d+)\s+)?(.+)$/i);
  if (removeMatch) {
    const qty = removeMatch[1] ? parseInt(removeMatch[1], 10) : 1;
    const cardName = removeMatch[2].trim();
    if (cardName.length > 2 && cardName.length < 100) {
      return {
        type: 'remove',
        cards: [{ name: cardName, qty }]
      };
    }
  }
  
  // SWAP command: "swap <card1> for <card2>" or "replace <card1> with <card2>"
  const swapMatch = normalized.match(/^(?:swap|replace)\s+(.+?)\s+(?:for|with)\s+(.+)$/i);
  if (swapMatch) {
    const card1 = swapMatch[1].trim();
    const card2 = swapMatch[2].trim();
    if (card1.length > 2 && card1.length < 100 && card2.length > 2 && card2.length < 100) {
      return {
        type: 'swap',
        remove: card1,
        add: card2
      };
    }
  }
  
  return null;
}

