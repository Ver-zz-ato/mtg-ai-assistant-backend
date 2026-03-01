/**
 * Comprehensive card name cleaning for deck imports.
 * Handles various export formats from:
 * - Moxfield: "1 Sol Ring (C21) 263"
 * - Archidekt: "1x Sol Ring [C21]"
 * - TappedOut: "1x Sol Ring"
 * - MTGO: "1 Sol Ring"
 * - Arena: "1 Sol Ring (C21) 263"
 * - Deckstats: "1 Sol Ring #C21"
 * - Scryfall: "1 sol ring (c21) 263"
 * - TCGPlayer CSV exports
 * - And many more variations
 */

/**
 * Normalize special characters and unicode variations.
 * Handles accented characters, different apostrophe styles, etc.
 */
export function normalizeChars(s: string): string {
  return s
    // Normalize unicode (NFD decomposition, remove combining marks)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    // Normalize different apostrophe/quote styles to standard apostrophe
    .replace(/[''`´]/g, "'")
    .replace(/[""]/g, '"')
    // Normalize different dash styles
    .replace(/[–—−]/g, '-')
    // Remove zero-width characters
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clean a card name by removing set codes, collector numbers, and other metadata.
 * This is the main function to use for cleaning imported card names.
 */
export function cleanCardName(raw: string): string {
  let s = normalizeChars(raw);
  
  // Remove common line prefixes
  // SB: / Sideboard: prefix
  s = s.replace(/^(SB:|Sideboard:)\s*/i, '');
  // CMDR: / Commander: prefix
  s = s.replace(/^(CMDR:|Commander:)\s*/i, '');
  // Deck section headers
  s = s.replace(/^(LANDS?|CREATURES?|INSTANTS?|SORCERY|SORCERIES|ARTIFACTS?|ENCHANTMENTS?|PLANESWALKERS?|BATTLES?|MAYBEBOARD|CONSIDERING):\s*/i, '');
  
  // Remove quantity prefix if still present (shouldn't be, but safety)
  // "2x Card" or "2 x Card" or "x2 Card"
  s = s.replace(/^\s*\d+\s*[xX]?\s+/, '');
  s = s.replace(/^\s*[xX]\s*\d+\s+/, '');
  
  // Remove bullet points or list markers
  s = s.replace(/^[-•*]\s*/, '');
  
  // Strip set code patterns - handle many variations:
  // (ABC), (ABC123), [ABC], [ABC123], {ABC}, #ABC, <ABC>
  // With optional collector number after
  
  // Pattern: (SET) or [SET] or {SET} followed by optional collector number and foil/special indicators
  // Examples: "(C21) 263", "[2XM] 123 *F*", "(SLD) 2283 *FOIL*"
  s = s.replace(/\s*[\(\[\{<]([A-Z0-9]{2,8})[\)\]\}>]\s*#?\d*\s*(\*[A-Z]+\*|\(F(oil)?\)|\(E(tched)?\))?$/i, '');
  
  // Pattern: #SET or #SET-123 (Deckstats style)
  s = s.replace(/\s*#[A-Z0-9]{2,8}(-\d+)?$/i, '');
  
  // Pattern: SET:123 or SET-123 at end (some exports)
  s = s.replace(/\s+[A-Z]{2,5}[:\-]\d+$/i, '');
  
  // Strip standalone collector numbers (3+ digits, optionally with letter suffix)
  // Examples: "263", "2283", "123a", "45b"
  s = s.replace(/\s+\d{3,}[a-z]?$/i, '');
  // Also 2-digit numbers if preceded by space and followed by nothing (common collector numbers)
  s = s.replace(/\s+\d{1,2}$/i, '');
  
  // Strip foil/special indicators
  // *F*, *FOIL*, *E*, *ETCHED*, (F), (Foil), (Etched), etc.
  s = s.replace(/\s*\*[A-Z]+\*$/i, '');
  s = s.replace(/\s*\([A-Za-z]+\)$/i, '');
  
  // Strip showcase/borderless/extended art indicators
  s = s.replace(/\s*\((Showcase|Borderless|Extended Art|Full Art|Retro|Retro Frame|Alt Art)\)$/i, '');
  s = s.replace(/\s*-\s*(Showcase|Borderless|Extended|Retro)$/i, '');
  
  // Strip language indicators
  s = s.replace(/\s*\((JP|JPN|Japanese|DE|German|FR|French|IT|Italian|ES|Spanish|PT|Portuguese|KO|Korean|CN|Chinese|RU|Russian)\)$/i, '');
  
  // Strip promo/prerelease indicators
  s = s.replace(/\s*\((Promo|Prerelease|Buy-a-Box|Bundle|FNM|Game Day|Launch|Release)\)$/i, '');
  
  // Handle double-faced card separators - keep only front face
  // "Jace, Vryn's Prodigy // Jace, Telepath Unbound" -> "Jace, Vryn's Prodigy"
  // But preserve cards that naturally have // in name (very rare)
  if (s.includes('//')) {
    const parts = s.split('//').map(p => p.trim());
    // Only take front face if we have exactly 2 parts and they look like different names
    if (parts.length === 2 && parts[0] && parts[1]) {
      // Check if they're the same card (just repeated) or different faces
      const front = parts[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      const back = parts[1].toLowerCase().replace(/[^a-z0-9]/g, '');
      if (front !== back) {
        // Different faces - keep front only for matching purposes
        // (The DB might have full name or front-only, we'll match both)
        s = parts[0];
      }
    }
  }
  
  // Strip quantity suffix (rare format)
  // "Sol Ring x2" or "Sol Ring X 2"
  s = s.replace(/\s+[xX]\s*\d+$/, '');
  
  // Strip trailing CSV artifacts
  // "Card Name," or "Card Name, 2" 
  s = s.replace(/,\s*\d*$/, '');
  
  // Strip quotes that might wrap the name
  s = s.replace(/^["']|["']$/g, '');
  
  // Final cleanup
  s = s.replace(/\s+/g, ' ').trim();
  
  return s;
}

/**
 * Generate variations of a card name for matching.
 * Helps find cards even with slight differences.
 */
export function generateNameVariations(name: string): string[] {
  const variations: Set<string> = new Set();
  const cleaned = cleanCardName(name);
  
  variations.add(cleaned);
  
  // Add lowercase version
  variations.add(cleaned.toLowerCase());
  
  // If it has //, try with and without back face
  if (cleaned.includes('//')) {
    const frontOnly = cleaned.split('//')[0].trim();
    variations.add(frontOnly);
    variations.add(frontOnly.toLowerCase());
    
    // Also try with " // " normalized
    const normalized = cleaned.replace(/\s*\/\/\s*/g, ' // ');
    variations.add(normalized);
    variations.add(normalized.toLowerCase());
  }
  
  // Try without commas for "Name, the Title" style cards
  if (cleaned.includes(',')) {
    const noComma = cleaned.replace(/,/g, '');
    variations.add(noComma);
    variations.add(noComma.toLowerCase());
  }
  
  // Try with/without "The" prefix
  if (cleaned.toLowerCase().startsWith('the ')) {
    variations.add(cleaned.slice(4));
    variations.add(cleaned.slice(4).toLowerCase());
  } else {
    variations.add('The ' + cleaned);
    variations.add('the ' + cleaned.toLowerCase());
  }
  
  return Array.from(variations);
}

/**
 * Calculate similarity between two strings (for fuzzy matching).
 * Returns a score from 0 to 1, where 1 is exact match.
 */
export function stringSimilarity(a: string, b: string): number {
  const s1 = a.toLowerCase();
  const s2 = b.toLowerCase();
  
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  
  // Quick check: if one contains the other, high similarity
  if (s1.includes(s2) || s2.includes(s1)) {
    const shorter = Math.min(s1.length, s2.length);
    const longer = Math.max(s1.length, s2.length);
    return shorter / longer;
  }
  
  // Levenshtein distance based similarity
  const matrix: number[][] = [];
  
  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  const distance = matrix[s1.length][s2.length];
  const maxLen = Math.max(s1.length, s2.length);
  return 1 - distance / maxLen;
}

/**
 * Check if a string looks like a valid MTG card name.
 * Used to filter out garbage lines.
 */
export function looksLikeCardName(s: string): boolean {
  const cleaned = cleanCardName(s);
  
  // Too short
  if (cleaned.length < 2) return false;
  
  // Too long (longest MTG card name is ~45 chars)
  if (cleaned.length > 60) return false;
  
  // All numbers
  if (/^\d+$/.test(cleaned)) return false;
  
  // Contains weird characters that aren't in card names
  if (/[@#$%^&*+=|\\<>{}[\]~`]/.test(cleaned)) return false;
  
  // Looks like a URL
  if (/^https?:\/\//.test(cleaned)) return false;
  
  // Looks like a header/label
  if (/^(deck|sideboard|mainboard|maybeboard|commander|companion|total|count|price)$/i.test(cleaned)) return false;
  
  return true;
}
