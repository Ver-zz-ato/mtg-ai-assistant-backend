import { parseDeckText } from "@/lib/deck/parseDeckText";
import { cleanCardName, sanitizedNameForDeckPersistence } from "@/lib/deck/cleanCardName";

export type ImportedCardEntry = { name: string; qty: number };

export type ImportUnrecognizedCard = {
  originalName: string;
  qty: number;
  suggestions: string[];
};

export function sanitizeImportedCardEntries(entries: ImportedCardEntry[]): {
  cards: ImportedCardEntry[];
  invalid: ImportUnrecognizedCard[];
} {
  const byKey = new Map<string, ImportedCardEntry>();
  const invalid: ImportUnrecognizedCard[] = [];

  for (const entry of entries) {
    const rawName = String(entry.name || "").trim();
    const qty = Math.max(0, Number(entry.qty || 0));
    if (!rawName || qty <= 0) continue;

    const sanitized = sanitizedNameForDeckPersistence(rawName);
    if (!sanitized) {
      invalid.push({ originalName: rawName, qty, suggestions: [] });
      continue;
    }

    const key = sanitized.toLowerCase();
    const existing = byKey.get(key);
    if (existing) existing.qty += qty;
    else byKey.set(key, { name: sanitized, qty });
  }

  return { cards: [...byKey.values()], invalid };
}

function parseLeadingCardName(line: string): string {
  const commanderMatch = line.match(/^(\d+)\s+(.+)$/);
  return (commanderMatch ? commanderMatch[2] : line).trim();
}

export function parseCommanderDecklistForImport(
  decklistText: string,
  explicitCommander?: string,
): { commander: string; cards: ImportedCardEntry[]; totalCards: number } {
  const lines = String(decklistText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("//"));

  if (lines.length === 0) return { commander: "", cards: [], totalCards: 0 };

  const explicit = sanitizedNameForDeckPersistence(String(explicitCommander || "").trim())
    || cleanCardName(String(explicitCommander || "").trim());

  if (explicit) {
    const firstLineName = sanitizedNameForDeckPersistence(parseLeadingCardName(lines[0]))
      || cleanCardName(parseLeadingCardName(lines[0]));
    const bodyStart = firstLineName && firstLineName.toLowerCase() === explicit.toLowerCase() ? 1 : 0;
    const cards = parseDeckText(lines.slice(bodyStart).join("\n"));
    return {
      commander: explicit,
      cards,
      totalCards: 1 + cards.reduce((sum, card) => sum + card.qty, 0),
    };
  }

  const rawCommander = parseLeadingCardName(lines[0]);
  const commander = sanitizedNameForDeckPersistence(rawCommander) || cleanCardName(rawCommander) || rawCommander;
  const cards = parseDeckText(lines.slice(1).join("\n"));
  return {
    commander,
    cards,
    totalCards: 1 + cards.reduce((sum, card) => sum + card.qty, 0),
  };
}

export function describeUnrecognizedCards(cards: ImportUnrecognizedCard[], limit = 3): string {
  const names = cards
    .map((card) => String(card.originalName || "").trim())
    .filter(Boolean)
    .slice(0, limit);
  if (!names.length) return "Unrecognized card names";
  if (cards.length > limit) return `Unrecognized card names: ${names.join(", ")} (+${cards.length - limit} more)`;
  return `Unrecognized card names: ${names.join(", ")}`;
}
