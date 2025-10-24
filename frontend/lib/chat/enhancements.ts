// lib/chat/enhancements.ts
// Shared chat enhancement utilities for deck-aware context and source attribution

export type DeckProblemSpot = {
  type: 'curve_hole' | 'removal_gap' | 'ctf_hotspot' | 'mana_base' | 'draw_engine';
  severity: 'high' | 'medium' | 'low';
  description: string;
  suggestion?: string;
  cards?: string[];
  cost?: number;
};

export type ChatSource = {
  type: 'scryfall' | 'price_snapshot' | 'commander_spellbook' | 'user_deck' | 'collection';
  name: string;
  date?: string;
  url?: string;
  icon?: string;
};

export type ActionChip = {
  id: string;
  label: string;
  action: 'add_to_deck' | 'budget_swaps' | 'view_scryfall' | 'run_probability' | 'open_ctf' | 'add_to_watchlist' | 'add_to_wishlist' | 'check_collection' | 'view_price' | 'test_hand';
  data?: any;
  prefill?: any;
  icon?: string;
};

/**
 * Analyze deck for problem spots to inject into AI context
 * Uses your existing deck analysis endpoints
 */
export async function analyzeDeckProblems(deckId: string): Promise<DeckProblemSpot[]> {
  try {
    // Try your existing deck analysis endpoint first
    const response = await fetch(`/api/decks/get?id=${encodeURIComponent(deckId)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch deck data');
    }
    
    const data = await response.json();
    const deck = data.deck;
    
    if (!deck) {
      return [];
    }

    // Generate problem spots based on deck structure
    const problems: DeckProblemSpot[] = [];
    
    // Analyze cards for common issues
    const cards = deck.cards || [];
    const totalCards = cards.reduce((sum: number, c: any) => sum + (c.qty || 0), 0);
    
    // Check deck size issues
    if (totalCards < 98) {
      problems.push({
        type: 'curve_hole',
        severity: 'high',
        description: `Deck has ${totalCards} cards (need ~100 for Commander)`,
        suggestion: 'Add more cards to reach optimal deck size'
      });
    }
    
    // Check for basic land ratio
    const lands = cards.filter((c: any) => 
      (c.type_line || '').toLowerCase().includes('land')
    ).length;
    const landRatio = lands / totalCards;
    
    if (landRatio < 0.35) {
      problems.push({
        type: 'mana_base',
        severity: 'medium',
        description: `Only ${Math.round(landRatio * 100)}% lands (recommend 35-40%)`,
        suggestion: 'Consider adding more lands or mana rocks'
      });
    }
    
    // Check for removal spells
    const removal = cards.filter((c: any) => {
      const text = (c.oracle_text || '').toLowerCase();
      return text.includes('destroy') || text.includes('exile') || text.includes('counter');
    }).length;
    
    if (removal < 8) {
      problems.push({
        type: 'removal_gap',
        severity: 'medium', 
        description: `Only ${removal} removal spells (recommend 8-12)`,
        suggestion: 'Add more targeted removal and board wipes'
      });
    }
    
    return problems.slice(0, 5); // Top 5 issues
  } catch (error) {
    console.error('Failed to analyze deck problems:', error);
    return [];
  }
}

/**
 * Generate deck-aware system context for AI
 */
export function generateDeckContext(problems: DeckProblemSpot[], deckTitle?: string): string {
  if (problems.length === 0) return '';

  const contextLines = [
    `== DECK CONTEXT: "${deckTitle || 'Current Deck'}" ==`,
    'Key problem areas to address:',
  ];

  problems.slice(0, 10).forEach((problem, index) => {
    const severity = problem.severity === 'high' ? '🔴' : problem.severity === 'medium' ? '🟡' : '🟢';
    contextLines.push(`${index + 1}. ${severity} ${problem.description}`);
    if (problem.suggestion) {
      contextLines.push(`   Suggestion: ${problem.suggestion}`);
    }
    if (problem.cards && problem.cards.length > 0) {
      contextLines.push(`   Related cards: ${problem.cards.join(', ')}`);
    }
  });

  contextLines.push('');
  contextLines.push('When answering, reference these specific issues and provide targeted advice.');
  contextLines.push('== END DECK CONTEXT ==');

  return contextLines.join('\n');
}

/**
 * Extract card names from AI response
 * Enhanced for MTG-specific patterns and your existing card detection
 */
export function extractCardNames(text: string): string[] {
  const cardNames: string[] = [];
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);
  
  // Use similar patterns to your existing CardChips logic
  for (const line of lines) {
    // Decklist-like: "1 Sol Ring" or "Sol Ring x1"
    const decklistMatch = line.match(/^(?:SB:\s*)?(\d+)\s*[xX]?\s+(.+)$/) || line.match(/^(.+?)\s+[xX]\s*(\d+)$/);
    if (decklistMatch) {
      const name = (decklistMatch[2] || decklistMatch[1] || '').trim();
      if (name && !cardNames.includes(name)) cardNames.push(name);
      continue;
    }
    
    // "Card:" or "Add:" hints  
    const cardMatch = line.match(/^Card:\s*(.+)$/i);
    if (cardMatch) {
      const name = cardMatch[1].trim();
      if (name && !cardNames.includes(name)) cardNames.push(name);
      continue;
    }
    
    const addMatch = line.match(/^Add:\s*(?:\d+\s*[xX]?\s+)?(.+)$/i);
    if (addMatch) {
      const name = addMatch[1].trim();
      if (name && !cardNames.includes(name)) cardNames.push(name);
      continue;
    }
  }
  
  // Also check for bracketed card names and quoted names
  const patterns = [
    /\[\[([^\]]+)\]\]/g, // [[Card Name]]
    /"([^"]+)"/g, // "Card Name"
  ];

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const cardName = match[1].trim();
      if (cardName.length > 2 && cardName.length < 50 && !cardNames.includes(cardName)) {
        // Filter out common non-card phrases
        if (!/^(the|and|or|of|in|at|to|for|with|by|from|build|deck|commander)$/i.test(cardName)) {
          cardNames.push(cardName);
        }
      }
    }
  });

  return cardNames.slice(0, 10); // Limit to first 10 cards
}

/**
 * Generate action chips for AI response
 */
export function generateActionChips(
  responseText: string, 
  linkedDeckId?: string | null,
  context?: { format?: string; colors?: string[]; checkCollections?: boolean }
): ActionChip[] {
  const chips: ActionChip[] = [];
  const cardNames = extractCardNames(responseText);

  // Add to Deck (if deck is linked and cards were mentioned)
  if (linkedDeckId && cardNames.length > 0) {
    chips.push({
      id: 'add_to_deck',
      label: `Add to Deck`,
      action: 'add_to_deck',
      icon: '➕',
      data: { deckId: linkedDeckId, cards: cardNames.slice(0, 3) }
    });
  }

  // Budget Swaps (if deck context)
  if (linkedDeckId && responseText.toLowerCase().includes('swap')) {
    chips.push({
      id: 'budget_swaps',
      label: 'Budget Swaps',
      action: 'budget_swaps',
      icon: '💰',
      prefill: { deckId: linkedDeckId }
    });
  }

  // View on Scryfall (first mentioned card)
  if (cardNames.length > 0) {
    chips.push({
      id: 'view_scryfall',
      label: `View ${cardNames[0]}`,
      action: 'view_scryfall',
      icon: '🔍',
      data: { cardName: cardNames[0] }
    });
  }

  // Run Probability (if hand/probability mentioned)
  if (linkedDeckId && /\b(probability|chance|likelihood|draw|hand|mulligan)\b/i.test(responseText)) {
    chips.push({
      id: 'run_probability',
      label: 'Probability Helper',
      action: 'run_probability',
      icon: '🎲',
      prefill: { deckId: linkedDeckId }
    });
  }

  // Cost to Finish (if price/budget mentioned)
  if (linkedDeckId && /\b(cost|price|budget|expensive|cheap)\b/i.test(responseText)) {
    chips.push({
      id: 'open_ctf',
      label: 'Cost to Finish',
      action: 'open_ctf',
      icon: '📊',
      prefill: { deckId: linkedDeckId }
    });
  }
  
  // Track Price (watchlist) - if discussing prices
  if (/\b(price|cost|expensive|cheap|budget|track|worth)\b/i.test(responseText) && cardNames.length > 0) {
    chips.push({
      id: 'add_to_watchlist',
      label: 'Track Price',
      action: 'add_to_watchlist',
      icon: '📊',
      data: { cards: cardNames.slice(0, 3) }
    });
  }
  
  // Add to Wishlist - if suggesting cards or discussing wants
  if (/\b(want|need|wishlist|acquire|buy|purchase)\b/i.test(responseText) && cardNames.length > 0) {
    chips.push({
      id: 'add_to_wishlist',
      label: 'Add to Wishlist',
      action: 'add_to_wishlist',
      icon: '⭐',
      data: { cards: cardNames.slice(0, 3) }
    });
  }
  
  // Check Collection - if suggesting cards and context allows
  if (cardNames.length > 0 && context?.checkCollections) {
    chips.push({
      id: 'check_collection',
      label: 'Check Ownership',
      action: 'check_collection',
      icon: '🗂️',
      data: { cards: cardNames.slice(0, 5) }
    });
  }
  
  // View Price - if mentioning specific card prices
  if (/\$|£|€/.test(responseText) && cardNames.length > 0) {
    chips.push({
      id: 'view_price',
      label: `Price: ${cardNames[0]}`,
      action: 'view_price',
      icon: '💰',
      data: { cardName: cardNames[0] }
    });
  }
  
  // Test Hand (mulligan tool) - if discussing opening hands
  if (linkedDeckId && /\b(hand|mulligan|opening|keep|starting)\b/i.test(responseText)) {
    chips.push({
      id: 'test_hand',
      label: 'Test Hands',
      action: 'test_hand',
      icon: '🎲',
      prefill: { deckId: linkedDeckId }
    });
  }

  return chips.slice(0, 5); // Limit to 5 chips max
}

/**
 * Generate source attribution for AI response
 */
export function generateSourceAttribution(
  responseText: string,
  context?: { deckId?: string; priceDate?: string }
): ChatSource[] {
  const sources: ChatSource[] = [];

  // Scryfall (if card names mentioned)
  const cardNames = extractCardNames(responseText);
  if (cardNames.length > 0) {
    sources.push({
      type: 'scryfall',
      name: 'Scryfall',
      url: 'https://scryfall.com',
      icon: '🔍'
    });
  }

  // Price data (if prices/costs mentioned)
  if (/\$|£|€|\bcost|\bprice|\bbudget/i.test(responseText)) {
    sources.push({
      type: 'price_snapshot',
      name: 'Price Snapshot',
      date: context?.priceDate || new Date().toISOString().split('T')[0],
      icon: '💰'
    });
  }

  // Commander Spellbook (if combos mentioned)
  if (/\bcombo|\binteraction|\bsynergy/i.test(responseText)) {
    sources.push({
      type: 'commander_spellbook',
      name: 'Commander Spellbook',
      url: 'https://commanderspellbook.com',
      icon: '📚'
    });
  }

  // User deck (if deck context)
  if (context?.deckId) {
    sources.push({
      type: 'user_deck',
      name: 'Your Deck',
      icon: '🎴'
    });
  }

  return sources;
}

/**
 * Format sources for display
 */
export function formatSourcesText(sources: ChatSource[]): string {
  return sources.map(source => {
    let text = `${source.icon || ''} ${source.name}`;
    if (source.date) {
      text += ` (${source.date})`;
    }
    return text;
  }).join(' • ');
}