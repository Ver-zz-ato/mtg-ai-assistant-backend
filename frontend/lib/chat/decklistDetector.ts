/** Result of commander inference with confidence. */
export type CommanderInference = {
  commanderName: string;
  confidence: number;
  reason: string;
  candidates: Array<{ name: string; confidence: number }>;
};

/** Confidence threshold below which we return null (avoid over-claiming). */
const COMMANDER_CONFIDENCE_THRESHOLD = 0.5;

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
  
  // Priority 3: Last "1 CardName" when Commander-sized (Moxfield/Archidekt often put commander at end)
  const cardLines = lines.filter((l) => {
    if (/^(Deck|Mainboard|Main|Sideboard|Companion|Commander)\s*:?\s*$/i.test(l)) return false;
    if (l.includes(':') && !/^Commander\s*:\s*/i.test(l)) return false; // skip "analyse this:" etc.
    return /^\d+\s*[xX]?\s+.+$/.test(l);
  });
  if (cardLines.length >= 95) {
    // Commander-sized: last card is usually the commander
    for (let i = cardLines.length - 1; i >= 0; i--) {
      const m = cardLines[i].match(/^1\s*[xX]?\s+(.+)$/);
      if (m) return m[1].trim();
    }
  }

  // Priority 4: First card in the list (fallback convention)
  for (const line of lines) {
    if (/^(Deck|Mainboard|Main|Sideboard|Companion|Commander)\s*:?\s*$/i.test(line)) continue;
    if (line.includes(':') && !/^Commander\s*:\s*/i.test(line)) continue;
    const qtyMatch = line.match(/^1\s*[xX]?\s+(.+)$/);
    if (qtyMatch) return qtyMatch[1].trim();
    if (line && !line.includes(':') && line.length > 2) return line;
  }

  return null;
}

/**
 * Infer commander with confidence scoring.
 * First-card heuristic: very weak fallback only; never produces high-confidence alone (often Sol Ring).
 */
export function inferCommander(
  decklistText: string,
  userMessage?: string,
  linkedDeckCommander?: string | null
): CommanderInference | null {
  if (!decklistText?.trim()) return null;
  const lines = decklistText.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const candidates: Array<{ name: string; confidence: number }> = [];

  // Priority 1: Explicit Commander section — high confidence
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^Commander\s*:?\s*$/i.test(line)) {
      const next = lines[i + 1];
      if (next) {
        const oneCard = next.match(/^1\s*[xX]?\s+(.+)$/);
        const name = oneCard ? oneCard[1].trim() : next;
        return { commanderName: name, confidence: 0.95, reason: "commander_section", candidates: [{ name, confidence: 0.95 }] };
      }
    }
    const sameLineMatch = line.match(/^Commander\s*:\s*(.+)$/i);
    if (sameLineMatch) {
      let name = sameLineMatch[1].trim();
      const qtyMatch = name.match(/^1\s*[xX]?\s+(.+)$/);
      if (qtyMatch) name = qtyMatch[1].trim();
      return { commanderName: name, confidence: 0.95, reason: "commander_section_same_line", candidates: [{ name, confidence: 0.95 }] };
    }
  }

  // Priority 2: User message declares commander ("my commander is X", "X is the commander", "using X as commander")
  if (userMessage) {
    const m = userMessage.match(/my commander (?:is|:)\s*([^.?!,\n]+)/i);
    if (m) return { commanderName: m[1].trim(), confidence: 0.9, reason: "user_message", candidates: [{ name: m[1].trim(), confidence: 0.9 }] };
    const decl = userMessage.match(/^(.+?)\s+is\s+(?:my\s+)?(?:the\s+)?commander\s*\.?$/im);
    if (decl) {
      const name = decl[1].trim();
      if (name.length >= 2 && name.length <= 80) return { commanderName: name, confidence: 0.9, reason: "user_message", candidates: [{ name, confidence: 0.9 }] };
    }
    const alt = userMessage.match(/(?:using|with)\s+(.+?)\s+as\s+(?:my\s+)?commander/i);
    if (alt) return { commanderName: alt[1].trim(), confidence: 0.9, reason: "user_message", candidates: [{ name: alt[1].trim(), confidence: 0.9 }] };
  }

  // Priority 3: Linked deck metadata
  if (linkedDeckCommander?.trim()) {
    return { commanderName: linkedDeckCommander.trim(), confidence: 0.95, reason: "linked_deck", candidates: [{ name: linkedDeckCommander.trim(), confidence: 0.95 }] };
  }

  // Priority 4: Last 1-of in commander-sized export (95+ lines)
  const cardLines = lines.filter((l) => {
    if (/^(Deck|Mainboard|Main|Sideboard|Companion|Commander)\s*:?\s*$/i.test(l)) return false;
    if (l.includes(":") && !/^Commander\s*:\s*/i.test(l)) return false;
    return /^\d+\s*[xX]?\s+.+$/.test(l);
  });
  if (cardLines.length >= 95) {
    for (let i = cardLines.length - 1; i >= 0; i--) {
      const m = cardLines[i].match(/^1\s*[xX]?\s+(.+)$/);
      if (m) {
        const name = m[1].trim();
        return { commanderName: name, confidence: 0.75, reason: "commander_last_export", candidates: [{ name, confidence: 0.75 }] };
      }
    }
  }

  // Priority 5: First card — VERY WEAK; never high-confidence (often Sol Ring)
  for (const line of lines) {
    if (/^(Deck|Mainboard|Main|Sideboard|Companion|Commander)\s*:?\s*$/i.test(line)) continue;
    if (line.includes(":") && !/^Commander\s*:\s*/i.test(line)) continue;
    const qtyMatch = line.match(/^1\s*[xX]?\s+(.+)$/);
    if (qtyMatch) {
      const name = qtyMatch[1].trim();
      const conf = 0.35;
      if (conf >= COMMANDER_CONFIDENCE_THRESHOLD) {
        return { commanderName: name, confidence: conf, reason: "first_card_weak", candidates: [{ name, confidence: conf }] };
      }
      return null;
    }
    if (line && !line.includes(":") && line.length > 2) {
      const conf = 0.3;
      if (conf >= COMMANDER_CONFIDENCE_THRESHOLD) {
        return { commanderName: line, confidence: conf, reason: "first_card_weak", candidates: [{ name: line, confidence: conf }] };
      }
      return null;
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

