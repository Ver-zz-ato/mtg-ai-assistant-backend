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

/** Known commander names to detect in pasted text (e.g. homepage chat) for module attachment */
const KNOWN_COMMANDER_SUBSTRINGS = [
  "Muldrotha, the Gravetide",
  "Meren of Clan Nel Toth",
  "Karador, Ghost Chieftain",
  "Sidisi, Brood Tyrant",
  "Chainer, Dementia Master",
  "Tasigur, the Golden Fang",
  "The Mimeoplasm",
  "The Scarab God",
  "Jarad, Golgari Lich Lord",
];

/**
 * Extract commander name from pasted decklist text (and optionally user message).
 * Used so detectModules can attach MODULE_GRAVEYARD_RECURSION etc. when user pastes a Muldrotha list on homepage.
 * - If text has a "Commander" section, the next non-empty line (or "1 CardName") is the commander.
 * - Else if text/message contains a known commander name (e.g. "Muldrotha, the Gravetide"), use that.
 */
export function extractCommanderFromDecklistText(decklistText: string, userMessage?: string): string | null {
  if (!decklistText?.trim()) return null;
  const lines = decklistText.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    if (/^Commander\s*$/i.test(lines[i])) {
      const next = lines[i + 1];
      if (!next) return null;
      const oneCard = next.match(/^1\s*[xX]?\s+(.+)$/);
      return oneCard ? oneCard[1].trim() : next;
    }
  }
  const toSearch = [decklistText, userMessage].filter(Boolean).join(" ");
  for (const name of KNOWN_COMMANDER_SUBSTRINGS) {
    if (toSearch.includes(name)) return name;
  }
  return null;
}

