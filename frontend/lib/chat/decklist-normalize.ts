/**
 * Decklist normalization, hashing, and structured parsing.
 * Used for "did deck change?" checks and cache keys.
 */

import { parseDeckText } from "@/lib/deck/parseDeckText";
import { normalizeCardName } from "@/lib/deck/mtgValidators";
import { hashStringSync } from "@/lib/guest-tracking";

/**
 * Normalize raw decklist text: trim, normalize line endings, strip comments/blanks,
 * standardize quantity lines (e.g. "3x Card" → "3 Card").
 */
export function normalizeDecklistText(raw: string): string {
  if (!raw?.trim()) return "";
  const lines = raw.replace(/\r\n|\r/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("#") || t.startsWith("//")) continue;
    const m = t.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    if (m) {
      out.push(`${m[1]} ${m[2].trim()}`);
    } else {
      out.push(t);
    }
  }
  return out.join("\n");
}

/**
 * Stable hash of normalized decklist. Same cards (any order) => same hash.
 * Parses → canonicalizes names → sorts → hashes.
 */
export function hashDecklist(normalized: string): string {
  const entries = parseDeckText(normalized);
  if (entries.length === 0) return hashStringSync("empty");
  const byNorm = new Map<string, { qty: number }>();
  for (const { name, qty } of entries) {
    const norm = normalizeCardName(name);
    if (!norm) continue;
    const existing = byNorm.get(norm);
    if (existing) existing.qty += qty;
    else byNorm.set(norm, { qty });
  }
  const sorted = Array.from(byNorm.entries()).sort(([a], [b]) => a.localeCompare(b));
  const canonical = sorted.map(([n, v]) => `${v.qty} ${n}`).join("\n");
  return hashStringSync(canonical || "empty");
}

export type ParsedDecklist = {
  mainboardCards: Array<{ name: string; qty: number }>;
  commanderCandidates: string[];
  totalCards: number;
};

/**
 * Parse normalized decklist into mainboard, commander candidates, and total count.
 * Commander candidates: 1-ofs from explicit Commander section, or single 1-of when deck is commander-sized.
 */
export function parseDecklistToStructuredCards(normalized: string): ParsedDecklist {
  const mainboardCards: Array<{ name: string; qty: number }> = [];
  const commanderCandidates: string[] = [];
  let totalCards = 0;

  if (!normalized?.trim()) {
    return { mainboardCards, commanderCandidates, totalCards };
  }

  const lines = normalized.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  let inCommanderSection = false;

  for (const line of lines) {
    if (/^Commander\s*:?\s*$/i.test(line)) {
      inCommanderSection = true;
      continue;
    }
    if (/^(Deck|Mainboard|Main|Sideboard|Companion)\s*:?\s*$/i.test(line)) {
      inCommanderSection = false;
      continue;
    }
    const m = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    const qty = m ? Math.max(1, parseInt(m[1], 10) || 1) : 1;
    const name = (m ? m[2] : line).trim();
    if (!name) continue;

    totalCards += qty;
    if (inCommanderSection && qty === 1) {
      commanderCandidates.push(name);
    } else {
      mainboardCards.push({ name, qty });
    }
  }

  if (commanderCandidates.length === 0 && totalCards >= 95) {
    const oneOfs = mainboardCards.filter((c) => c.qty === 1);
    if (oneOfs.length > 0) {
      const last = oneOfs[oneOfs.length - 1];
      commanderCandidates.push(last.name);
    }
  }

  return { mainboardCards, commanderCandidates, totalCards };
}
