/**
 * Shared utility for detecting decklists in text
 * Extracted from Chat.tsx for reuse in API routes
 */
export function isDecklist(text: string): boolean {
  if (!text) return false;
  const lines = text.replace(/\r/g, "").split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 6) return false;
  let hits = 0;
  const rxQty = /^(?:SB:\s*)?\d+\s*[xX]?\s+.+$/;
  const rxDash = /^-\s+.+$/;
  for (const l of lines) {
    if (rxQty.test(l) || rxDash.test(l)) hits++;
  }
  return hits >= Math.max(6, Math.floor(lines.length * 0.5));
}

/**
 * Extract commander name from pasted decklist text (and optionally user message).
 * Used so detectModules can attach MODULE_GRAVEYARD_RECURSION etc. when user pastes a Muldrotha list on homepage.
 * 
 * Detection priority:
 * 1. "Commander" section header - next line is the commander
 * 2. User message explicitly states "my commander is X"
 * 3. First card in the list (common convention)
 * 
 * Returns the card name or null if no commander section found.
 */
export function extractCommanderFromDecklistText(decklistText: string, userMessage?: string): string | null {
  if (!decklistText?.trim()) return null;
  const lines = decklistText.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  
  // Priority 1: Explicit "Commander" section
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match "Commander", "Commander:", "COMMANDER", etc.
    if (/^Commander\s*:?\s*$/i.test(line)) {
      const next = lines[i + 1];
      if (!next) return null;
      const oneCard = next.match(/^1\s*[xX]?\s+(.+)$/);
      return oneCard ? oneCard[1].trim() : next;
    }
    // Also match "Commander: CardName" on same line
    const sameLineMatch = line.match(/^Commander\s*:\s*(.+)$/i);
    if (sameLineMatch) {
      const name = sameLineMatch[1].trim();
      // Strip quantity if present
      const qtyMatch = name.match(/^1\s*[xX]?\s+(.+)$/);
      return qtyMatch ? qtyMatch[1].trim() : name;
    }
  }
  
  // Priority 2: User message says "my commander is X"
  if (userMessage) {
    const commanderMatch = userMessage.match(/my commander (?:is|:)\s*([^.?!,\n]+)/i);
    if (commanderMatch) {
      return commanderMatch[1].trim();
    }
    // Also match "commander: X" or "using X as commander"
    const altMatch = userMessage.match(/(?:using|with)\s+(.+?)\s+as\s+(?:my\s+)?commander/i);
    if (altMatch) {
      return altMatch[1].trim();
    }
  }
  
  // Priority 3: First card in the list (common convention for Commander decks)
  // Only return this as a "candidate" - caller should verify it's legendary
  for (const line of lines) {
    // Skip section headers
    if (/^(Deck|Mainboard|Main|Sideboard|Companion|Commander)\s*:?\s*$/i.test(line)) continue;
    // Match "1 CardName" or "1x CardName"
    const qtyMatch = line.match(/^1\s*[xX]?\s+(.+)$/);
    if (qtyMatch) {
      return qtyMatch[1].trim();
    }
    // Match plain card name (first non-header line)
    if (line && !line.includes(':') && line.length > 2) {
      return line;
    }
  }
  
  return null;
}

/**
 * Parse all card entries from a decklist text.
 * Returns array of { name, qty } objects.
 */
export function parseCardEntries(decklistText: string): Array<{ name: string; qty: number }> {
  if (!decklistText?.trim()) return [];
  const lines = decklistText.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const entries: Array<{ name: string; qty: number }> = [];
  
  for (const line of lines) {
    // Skip section headers
    if (/^(Deck|Mainboard|Main|Sideboard|Companion|Commander)\s*:?\s*$/i.test(line)) continue;
    
    // Match "N CardName" or "Nx CardName"
    const qtyMatch = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    if (qtyMatch) {
      entries.push({ name: qtyMatch[2].trim(), qty: parseInt(qtyMatch[1], 10) });
      continue;
    }
    
    // Match "- CardName" (bullet list)
    const dashMatch = line.match(/^-\s+(.+)$/);
    if (dashMatch) {
      entries.push({ name: dashMatch[1].trim(), qty: 1 });
      continue;
    }
    
    // Plain card name
    if (line && !line.includes(':') && line.length > 2) {
      entries.push({ name: line, qty: 1 });
    }
  }
  
  return entries;
}

