import type { AnalyzeFormat } from "@/lib/deck/formatRules";
import { extractCommanderFromDecklistText } from "@/lib/chat/decklistDetector";

export type DeckCheckerPrep = {
  cardCount: number;
  detectedFormat: AnalyzeFormat;
  commander: string | null;
  formatHint: string | null;
};

export function countMainboardCards(deckText: string): number {
  return deckText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line || line.startsWith("#") || line.startsWith("//")) return false;
      if (/^(commander|deck|sideboard|mainboard|main)$/i.test(line)) return false;
      return /^\d+\s*[xX]?\s+.+$/.test(line) || /^-\s+.+$/.test(line);
    })
    .reduce((sum, line) => {
      const qtyMatch = line.match(/^(\d+)/);
      return sum + (qtyMatch ? Number.parseInt(qtyMatch[1], 10) : 1);
    }, 0);
}

export function detectFormatFromDeckText(
  deckText: string,
  selectedFormat: AnalyzeFormat,
): AnalyzeFormat {
  const text = deckText.toLowerCase();
  if (/\b(commander|edh|cedh)\b/.test(text)) return "Commander";
  if (/\bmodern\b/.test(text)) return "Modern";
  if (/\bpioneer\b/.test(text)) return "Pioneer";
  if (/\b(standard|std)\b/.test(text)) return "Standard";
  if (/\bpauper\b/.test(text)) return "Pauper";

  const commander = extractCommanderFromDecklistText(deckText);
  const cardCount = countMainboardCards(deckText);

  if (commander) return "Commander";
  if (cardCount >= 95 && cardCount <= 105) return "Commander";
  if (cardCount >= 55 && cardCount <= 75) {
    return selectedFormat === "Commander" ? "Modern" : selectedFormat;
  }
  return selectedFormat;
}

export function prepareDeckCheckerRun(
  deckText: string,
  selectedFormat: AnalyzeFormat,
): DeckCheckerPrep {
  const commander = extractCommanderFromDecklistText(deckText);
  const cardCount = countMainboardCards(deckText);
  const detectedFormat = detectFormatFromDeckText(deckText, selectedFormat);
  let formatHint: string | null = null;
  if (detectedFormat !== selectedFormat && cardCount > 0) {
    formatHint = `Detected ${detectedFormat} (${cardCount} cards${commander ? ` · ${commander}` : ""}).`;
  } else if (cardCount > 0) {
    formatHint = `${cardCount} cards${commander ? ` · Commander: ${commander}` : ""}.`;
  }
  return { cardCount, detectedFormat, commander, formatHint };
}
