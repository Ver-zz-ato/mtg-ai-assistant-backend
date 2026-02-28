import { type SfCard } from "@/lib/deck/inference";

export type CardSuggestion = {
  card: string;
  reason?: string;
  source?: "gpt" | "retry";
  requestedType?: string;
  needs_review?: boolean;
  reviewNotes?: string[];
  slotRole?: string;
  category?: string;
};

const PERMANENT_TYPES = ["artifact", "creature", "enchantment", "planeswalker", "battle", "land"];

export function normalizeCardName(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;:'"!?()[\]{}]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

export function isWithinColorIdentity(card: SfCard, allowedColors: string[]): boolean {
  const colors = (card.color_identity || []).map((c) => c.toUpperCase());
  if (colors.length === 0) {
    // Colorless cards are always allowed
    return true;
  }
  if (allowedColors.length === 0) {
    return false;
  }
  const allowed = new Set(allowedColors.map((c) => c.toUpperCase()));
  return colors.every((c) => allowed.has(c));
}

export function matchesRequestedType(card: SfCard, requestedType?: string): boolean {
  if (!requestedType || requestedType.toLowerCase() === "any") return true;

  const lowered = requestedType.toLowerCase();
  const typeLine = (card.type_line || "").toLowerCase();

  if (!typeLine) return lowered === "unknown";

  const isPermanent = PERMANENT_TYPES.some((type) => typeLine.includes(type));
  switch (lowered) {
    case "permanent":
      return isPermanent;
    case "nonpermanent":
    case "spell":
      return !typeLine.includes("land");
    case "nonland":
      return !typeLine.includes("land");
    case "land":
      return typeLine.includes("land");
    case "creature":
      return typeLine.includes("creature");
    case "instant":
      return typeLine.includes("instant");
    case "sorcery":
      return typeLine.includes("sorcery");
    case "enchantment":
      return typeLine.includes("enchantment");
    case "artifact":
      return typeLine.includes("artifact");
    case "battle":
      return typeLine.includes("battle");
    case "planeswalker":
      return typeLine.includes("planeswalker");
    default:
      // Fall back to substring check so niche requested types (e.g., "vehicle") still work.
      return typeLine.includes(lowered);
  }
}

export function isLegalForFormat(card: SfCard, format: string): boolean {
  const legalities = card.legalities || {};
  const key = format.toLowerCase();

  if (key === "commander" || key === "edh") {
    const status = legalities["commander"];
    return status !== "banned";
  }

  const status = legalities[key];
  return status === "legal" || status === "restricted";
}

/**
 * Check if a card is Standard-legal based on its set.
 * This is a synchronous helper that checks if the card's set code
 * is in the provided list of Standard-legal sets.
 */
export function isCardInStandardSet(card: SfCard, standardSetCodes: string[]): boolean {
  const cardSet = (card.set || '').toLowerCase();
  if (!cardSet) return false;
  return standardSetCodes.includes(cardSet);
}

/**
 * Get the rotation status description for UI display.
 */
export function getFormatRotationWarning(format: string): string | null {
  const key = format.toLowerCase();
  if (key === 'standard') {
    return 'Standard rotates annually in the fall. Some sets may rotate out soon.';
  }
  if (key === 'pioneer') {
    return 'Pioneer is non-rotating and includes all Standard sets from Return to Ravnica forward.';
  }
  if (key === 'modern') {
    return 'Modern is non-rotating and includes all Standard sets from Eighth Edition forward.';
  }
  return null;
}

export function isDuplicate(cardName: string, deckNormalized: Set<string>): boolean {
  return deckNormalized.has(normalizeCardName(cardName));
}

/**
 * Companion restriction validation.
 * Each companion has a unique deck-building restriction that must be met.
 */
export type CompanionValidationResult = {
  valid: boolean;
  violations: string[];
  companionName: string;
};

// Creature types allowed by Kaheera
const KAHEERA_TYPES = new Set(['cat', 'elemental', 'nightmare', 'dinosaur', 'beast']);

/**
 * Validate that a deck meets a companion's restriction.
 * @param companionName The name of the companion creature
 * @param deckCards Array of card details (with cmc, type_line, oracle_text, mana_cost)
 * @returns Validation result with any violations
 */
export function validateCompanionRestriction(
  companionName: string,
  deckCards: SfCard[]
): CompanionValidationResult {
  const name = companionName.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim();
  const violations: string[] = [];
  
  // Filter out lands for CMC checks (most companion restrictions exempt lands)
  const nonlandCards = deckCards.filter(c => {
    const typeLine = (c.type_line || '').toLowerCase();
    return !typeLine.includes('land');
  });
  
  // Get all permanents for permanent-specific checks
  const permanents = deckCards.filter(c => {
    const typeLine = (c.type_line || '').toLowerCase();
    return typeLine.includes('creature') || 
           typeLine.includes('artifact') || 
           typeLine.includes('enchantment') ||
           typeLine.includes('planeswalker');
  });
  
  switch (true) {
    // Lurrus of the Dream-Den: Each permanent card in your starting deck has mana value 2 or less
    case name.includes('lurrus'):
      for (const card of permanents) {
        const cmc = card.cmc || 0;
        if (cmc > 2) {
          violations.push(`${card.name} (CMC ${cmc}) - Lurrus requires all permanents CMC ≤ 2`);
        }
      }
      break;
      
    // Gyruda, Doom of Depths: Each nonland card in your starting deck has an even mana value
    case name.includes('gyruda'):
      for (const card of nonlandCards) {
        const cmc = card.cmc || 0;
        if (cmc % 2 !== 0) {
          violations.push(`${card.name} (CMC ${cmc}) - Gyruda requires all nonland cards to have even CMC`);
        }
      }
      break;
      
    // Obosh, the Preypiercer: Each nonland card in your starting deck has an odd mana value
    case name.includes('obosh'):
      for (const card of nonlandCards) {
        const cmc = card.cmc || 0;
        if (cmc % 2 === 0) {
          violations.push(`${card.name} (CMC ${cmc}) - Obosh requires all nonland cards to have odd CMC`);
        }
      }
      break;
      
    // Kaheera, the Orphanguard: Each creature card in your starting deck is a Cat, Elemental, Nightmare, Dinosaur, or Beast
    case name.includes('kaheera'):
      const creatures = deckCards.filter(c => (c.type_line || '').toLowerCase().includes('creature'));
      for (const card of creatures) {
        const typeLine = (card.type_line || '').toLowerCase();
        const hasAllowedType = [...KAHEERA_TYPES].some(type => typeLine.includes(type));
        if (!hasAllowedType) {
          violations.push(`${card.name} - Kaheera requires all creatures to be Cat, Elemental, Nightmare, Dinosaur, or Beast`);
        }
      }
      break;
      
    // Umori, the Collector: Each nonland card in your starting deck shares a card type
    case name.includes('umori'):
      const typeCategories = ['creature', 'artifact', 'enchantment', 'instant', 'sorcery', 'planeswalker'];
      const typeCounts: Record<string, number> = {};
      for (const card of nonlandCards) {
        const typeLine = (card.type_line || '').toLowerCase();
        for (const type of typeCategories) {
          if (typeLine.includes(type)) {
            typeCounts[type] = (typeCounts[type] || 0) + 1;
          }
        }
      }
      // Check if there's a type that all cards share
      const nonlandCount = nonlandCards.length;
      const sharedType = Object.entries(typeCounts).find(([_, count]) => count === nonlandCount);
      if (!sharedType && nonlandCount > 0) {
        violations.push(`Umori requires all nonland cards to share a card type - no single type is present on all ${nonlandCount} nonland cards`);
      }
      break;
      
    // Yorion, Sky Nomad: Your starting deck contains at least 80 cards (60-card formats) or 120 cards (Commander)
    case name.includes('yorion'):
      const totalCards = deckCards.length;
      // Note: In Commander, Yorion is banned anyway, but for 60-card formats:
      if (totalCards < 80) {
        violations.push(`Deck has ${totalCards} cards - Yorion requires at least 80 cards (or 120 in Commander formats)`);
      }
      break;
      
    // Zirda, the Dawnwaker: Each permanent card in your starting deck has an activated ability
    case name.includes('zirda'):
      for (const card of permanents) {
        const oracleText = (card.oracle_text || '').toLowerCase();
        // Check for activated ability pattern: cost : effect
        // Mana abilities ({T}: Add ...) count, as do other activated abilities
        const hasActivated = /[{}\w]+\s*:\s*[^/]/i.test(oracleText) || 
                            /\{t\}:\s/i.test(oracleText) ||
                            oracleText.includes(': add');
        if (!hasActivated) {
          violations.push(`${card.name} - Zirda requires all permanents to have activated abilities`);
        }
      }
      break;
      
    // Keruga, the Macrosage: Each nonland card in your starting deck has mana value 3 or greater
    case name.includes('keruga'):
      for (const card of nonlandCards) {
        const cmc = card.cmc || 0;
        if (cmc < 3) {
          violations.push(`${card.name} (CMC ${cmc}) - Keruga requires all nonland cards CMC ≥ 3`);
        }
      }
      break;
      
    // Jegantha, the Wellspring: No card in your starting deck has more than one of the same mana symbol in its mana cost
    case name.includes('jegantha'):
      for (const card of deckCards) {
        const manaCost = card.mana_cost || '';
        // Count each mana symbol
        const symbolCounts: Record<string, number> = {};
        const symbols = manaCost.match(/\{[^}]+\}/g) || [];
        for (const sym of symbols) {
          // Only check colored/colorless pips, not hybrid or generic
          if (/^\{[WUBRGC]\}$/i.test(sym)) {
            symbolCounts[sym.toLowerCase()] = (symbolCounts[sym.toLowerCase()] || 0) + 1;
          }
        }
        const hasRepeat = Object.values(symbolCounts).some(count => count > 1);
        if (hasRepeat) {
          violations.push(`${card.name} (${manaCost}) - Jegantha forbids repeated mana symbols in costs`);
        }
      }
      break;
      
    // Lutri, the Spellchaser: Each nonland card in your starting deck has a different name
    // (This is effectively singleton - illegal in Commander anyway)
    case name.includes('lutri'):
      const nameCounts: Record<string, number> = {};
      for (const card of nonlandCards) {
        const cardName = (card.name || '').toLowerCase();
        nameCounts[cardName] = (nameCounts[cardName] || 0) + 1;
      }
      for (const [cardName, count] of Object.entries(nameCounts)) {
        if (count > 1) {
          violations.push(`${cardName} appears ${count} times - Lutri requires singleton (each nonland card different name)`);
        }
      }
      break;
      
    default:
      // Unknown companion - no validation possible
      break;
  }
  
  return {
    valid: violations.length === 0,
    violations,
    companionName,
  };
}

/**
 * Check if a card name is a known companion.
 */
export function isCompanion(cardName: string): boolean {
  const name = cardName.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim();
  const companions = [
    'lurrus', 'gyruda', 'obosh', 'kaheera', 'umori', 
    'yorion', 'zirda', 'keruga', 'jegantha', 'lutri'
  ];
  return companions.some(c => name.includes(c));
}

