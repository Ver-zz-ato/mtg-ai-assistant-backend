/** Result of commander inference with confidence. */
export type CommanderInference = {
  commanderName: string;
  confidence: number;
  reason: string;
  candidates: Array<{ name: string; confidence: number }>;
};

/** Confidence threshold below which we return null (avoid over-claiming). */
const COMMANDER_CONFIDENCE_THRESHOLD = 0.5;

function isObviousNonCommanderFirstCard(name: string): boolean {
  return /^(sol ring|command tower|arcane signet|fellwar stone|mana crypt|forest|island|swamp|mountain|plains)$/i.test(
    name.trim(),
  );
}

/**
 * Shared utility for detecting decklists in text
 * Extracted from Chat.tsx for reuse in API routes
 */
export function isDecklist(text: string): boolean {
  if (!text) return false;
  const lines = text.replace(/\r/g, "").split("\n").map(l => l.trim()).filter(Boolean);
  let hits = 0;
  const rxQty = /^(?:SB:\s*)?\d+\s*[xX]?\s+.+$/;
  const rxDash = /^-\s+.+$/;
  for (const l of lines) {
    if (rxQty.test(l) || rxDash.test(l)) hits++;
  }
  if (lines.length >= 6 && hits >= Math.max(6, Math.floor(lines.length * 0.45))) return true;

  const compact = text.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  if (compact.length < 80) return false;

  const sectionMatches = compact.match(
    /\b(?:Commander|Mainboard|Sideboard|Creatures?|Artifacts?|Enchantments?|Instants?|Sorcer(?:y|ies)|Lands?|Planeswalkers?)\s*(?:\(\d+\)|:)?\b/gi,
  ) ?? [];
  const uniqueSections = new Set(sectionMatches.map((s) => s.toLowerCase().replace(/\s*\(\d+\)|:|\s+/g, "")));
  const hasDeckAsk = /\b(analy[sz]e|review|improve|missing|deck)\b/i.test(compact);
  const basicLandCounts = compact.match(/\b\d+\s+(?:Plains|Island|Swamp|Mountain|Forest)\b/gi) ?? [];
  const hasCommanderDeclaration = /\bCommander\s+[^.!?\n]{3,90}?\s+(?:Creatures?|Artifacts?|Enchantments?|Instants?|Sorcer(?:y|ies)|Lands?)\s*\(\d+\)/i.test(compact);

  return (
    (hasDeckAsk && uniqueSections.size >= 3) ||
    (hasCommanderDeclaration && uniqueSections.size >= 2) ||
    (uniqueSections.size >= 4 && basicLandCounts.length >= 2)
  );
}

function extractInlineCommanderFromCompressedText(text: string): string | null {
  const compact = text.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  const firstSection = compact.search(
    /(?:[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*)?(?:Creatures?|Artifacts?|Enchantments?|Instants?|Sorcer(?:y|ies)|Lands?|Planeswalkers?)\s*\(\d+\)/iu,
  );
  const prefix = firstSection >= 0 ? compact.slice(0, firstSection) : compact;
  const idx = prefix.toLowerCase().lastIndexOf("commander");
  if (idx < 0) return null;
  const after = prefix.slice(idx + "commander".length).replace(/^[:\s]+/, "").trim();
  const name = after
    .replace(/^1\s*[xX]?\s+/, "")
    .replace(/^[^\p{L}\p{N}'"]+/u, "")
    .replace(/[^\p{L}\p{N}'")]+$/u, "")
    .trim();
  if (!name || name.length < 2 || name.length > 90) return null;
  if (/^(deck|format|list)\b/i.test(name)) return null;
  return name;
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
  
  // Priority 1: Explicit "Commander" section or inline COMMANDER! marker
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
      const qtyMatch = name.match(/^1\s*[xX]?\s+(.+)$/);
      return qtyMatch ? qtyMatch[1].trim() : name;
    }
    // Inline "1 CardName COMMANDER!" (EDH export)
    const inlineMarker = line.match(/^1\s*[xX]?\s+(.+?)\s+COMMANDER!?\s*$/i);
    if (inlineMarker) {
      const name = inlineMarker[1].trim();
      if (name.length >= 2 && name.length <= 120) return name;
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

  const inlineCompressed = extractInlineCommanderFromCompressedText(decklistText);
  if (inlineCompressed) return inlineCompressed;
  
  // Priority 3: First "1 CardName" when Commander-sized and no explicit marker.
  // Many human pastes put the commander first; keep this tentative so the chat can confirm.
  const cardLines = lines.filter((l) => {
    if (/^(Deck|Mainboard|Main|Sideboard|Companion|Commander)\s*:?\s*$/i.test(l)) return false;
    if (l.includes(':') && !/^Commander\s*:\s*/i.test(l)) return false; // skip "analyse this:" etc.
    return /^\d+\s*[xX]?\s+.+$/.test(l);
  });
  const cardLineTotal = cardLines.reduce((sum, line) => {
    const m = line.match(/^(\d+)\s*[xX]?\s+.+$/);
    return sum + Math.max(1, parseInt(m?.[1] ?? "1", 10) || 1);
  }, 0);
  if (cardLineTotal >= 95) {
    const oneOfs = cardLines
      .map((line) => line.match(/^1\s*[xX]?\s+(.+)$/)?.[1]?.trim())
      .filter(Boolean) as string[];
    const first = oneOfs[0];
    if (first && !isObviousNonCommanderFirstCard(first)) return first;
    const last = oneOfs[oneOfs.length - 1];
    if (last) return last;
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

  // Priority 1: Explicit Commander section or inline marker — high confidence, treat as trusted (skip confirm)
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
    // Inline "1 CardName COMMANDER!" or "CardName COMMANDER" (EDH export convention)
    const inlineMarker = line.match(/^1\s*[xX]?\s+(.+?)\s+COMMANDER!?\s*$/i);
    if (inlineMarker) {
      const name = inlineMarker[1].trim();
      if (name.length >= 2 && name.length <= 120) {
        return { commanderName: name, confidence: 0.95, reason: "explicit_inline_marker", candidates: [{ name, confidence: 0.95 }] };
      }
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

  const inlineCompressed = extractInlineCommanderFromCompressedText(decklistText);
  if (inlineCompressed) {
    return {
      commanderName: inlineCompressed,
      confidence: 0.9,
      reason: "commander_section_same_line",
      candidates: [{ name: inlineCompressed, confidence: 0.9 }],
    };
  }

  // Priority 3: Linked deck metadata
  if (linkedDeckCommander?.trim()) {
    return { commanderName: linkedDeckCommander.trim(), confidence: 0.95, reason: "linked_deck", candidates: [{ name: linkedDeckCommander.trim(), confidence: 0.95 }] };
  }

  // Priority 4: First 1-of in commander-sized export (95+ lines), tentative.
  const cardLines = lines.filter((l) => {
    if (/^(Deck|Mainboard|Main|Sideboard|Companion|Commander)\s*:?\s*$/i.test(l)) return false;
    if (l.includes(":") && !/^Commander\s*:\s*/i.test(l)) return false;
    return /^\d+\s*[xX]?\s+.+$/.test(l);
  });
  const cardLineTotal = cardLines.reduce((sum, line) => {
    const m = line.match(/^(\d+)\s*[xX]?\s+.+$/);
    return sum + Math.max(1, parseInt(m?.[1] ?? "1", 10) || 1);
  }, 0);
  if (cardLineTotal >= 95) {
    const oneOfs = cardLines
      .map((line) => line.match(/^1\s*[xX]?\s+(.+)$/)?.[1]?.trim())
      .filter(Boolean) as string[];
    const first = oneOfs[0];
    const last = oneOfs[oneOfs.length - 1];
    const name = first && !isObviousNonCommanderFirstCard(first) ? first : last;
    if (name) {
      return { commanderName: name, confidence: 0.75, reason: first === name ? "commander_first_export" : "commander_last_export", candidates: [{ name, confidence: 0.75 }] };
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

