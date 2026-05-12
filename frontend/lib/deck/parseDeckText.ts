// @server-only

import { cleanCardName, looksLikeCardName, normalizeChars } from './cleanCardName';
import { parseDeckOrCollectionCSV } from "../csv/parse";
import type { DeckCardZone } from "./deckCardZone";

export type ParsedDeckEntry = {
  name: string;
  qty: number;
};

export type ParsedDeckEntryWithZone = ParsedDeckEntry & { zone: DeckCardZone };

function normalizeForKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cleanParsedCardName(raw: string): string {
  const normalized = normalizeChars(raw);
  if (!normalized.includes("//")) return cleanCardName(normalized);
  const parts = normalized.split("//").map((part) => cleanCardName(part).trim()).filter(Boolean);
  if (parts.length !== 2) return cleanCardName(normalized);
  if (normalizeForKey(parts[0]) === normalizeForKey(parts[1])) return parts[0];
  return `${parts[0]} // ${parts[1]}`;
}

function parseDelimitedCardImport(raw?: string): ParsedDeckEntry[] | null {
  if (!raw) return null;

  const firstLine = raw
    .split(/\r?\n/)
    .map((line) => normalizeChars(line).trim())
    .find((line) => line && !line.startsWith("#") && !line.startsWith("//"));
  if (!firstLine || !/[,;&\t|]/.test(firstLine)) return null;

  const normalizedHeader = firstLine.toLowerCase().replace(/[^a-z0-9]/g, "");
  const hasHeader =
    /(name|card|productname)/.test(normalizedHeader) &&
    /(qty|quantity|quantityx|count|owned|amount|number)/.test(normalizedHeader);
  const hasDelimitedQtyRows = raw
    .split(/\r?\n/)
    .some((line) => /^\s*(?:x\s*)?\d+\s*x?\s*[,;&\t|]/i.test(line));

  if (!hasHeader && !hasDelimitedQtyRows) return null;

  const byName = new Map<string, ParsedDeckEntry>();
  for (const item of parseDeckOrCollectionCSV(raw)) {
    const name = cleanParsedCardName(item.name);
    if (!name || !looksLikeCardName(name)) continue;
    const key = name.toLowerCase();
    const existing = byName.get(key);
    if (existing) existing.qty += item.qty;
    else byName.set(key, { name, qty: item.qty });
  }

  return byName.size ? Array.from(byName.values()) : null;
}

const PROSE_SECTION_RE =
  /\b(Mainboard|Sideboard|Creatures?|Artifacts?|Enchantments?|Instants?|Sorcer(?:y|ies)|Lands?|Planeswalkers?|Battles?)\s*(?:\((\d+)\))/gi;

function stripDecorativePrefix(s: string): string {
  return normalizeChars(s)
    .replace(/^[^\p{L}\p{N}'"]+/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseQuantityRuns(content: string): ParsedDeckEntry[] {
  const entries: ParsedDeckEntry[] = [];
  const normalized = stripDecorativePrefix(content);
  const rx = /\b(\d+)\s+([^0-9]+?)(?=\s+\d+\s+[^0-9]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(normalized))) {
    const qty = Math.max(1, parseInt(m[1], 10) || 1);
    const name = cleanParsedCardName(m[2].trim());
    if (name && looksLikeCardName(name)) entries.push({ name, qty });
  }
  return entries;
}

function segmentPenalty(words: string[]): number {
  if (words.length === 0 || words.length > 6) return 999;
  const raw = words.join(" ").trim();
  const cleaned = cleanParsedCardName(raw);
  if (!cleaned || !looksLikeCardName(cleaned)) return 80;
  let score = 0;
  const len = words.length;
  score += len === 1 ? 1.6 : len === 2 ? 0 : len === 3 ? 0.25 : len === 4 ? 0.9 : len === 5 ? 1.8 : 3;
  const first = words[0] ?? "";
  const last = words[words.length - 1] ?? "";
  if (/^(?:the|of|and|to|from|with|in|on|a|an)$/i.test(first)) score += 8;
  if (/^(?:the|of|and|to|from|with|in|on|a|an)$/i.test(last)) score += 8;
  if (/^[a-z]/.test(first)) score += 4;
  if (/[,:'-]$/.test(raw)) score += 4;
  return score;
}

function splitKnownCountNames(content: string, targetCount: number): string[] {
  const clean = stripDecorativePrefix(content).replace(/\s+/g, " ").trim();
  if (!clean || targetCount <= 0 || targetCount > 120) return [];
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length < targetCount) return [];

  const n = words.length;
  const memo = new Map<string, { score: number; parts: string[] } | null>();
  function dp(index: number, remaining: number): { score: number; parts: string[] } | null {
    const key = `${index}:${remaining}`;
    if (memo.has(key)) return memo.get(key)!;
    if (remaining === 0) {
      const out = index === n ? { score: 0, parts: [] } : null;
      memo.set(key, out);
      return out;
    }
    const wordsLeft = n - index;
    if (wordsLeft < remaining || wordsLeft > remaining * 6) {
      memo.set(key, null);
      return null;
    }

    let best: { score: number; parts: string[] } | null = null;
    for (let len = 1; len <= 6 && index + len <= n; len++) {
      const wordsAfter = n - (index + len);
      if (wordsAfter < remaining - 1 || wordsAfter > (remaining - 1) * 6) continue;
      const segmentWords = words.slice(index, index + len);
      const p = segmentPenalty(segmentWords);
      if (p >= 80) continue;
      const rest = dp(index + len, remaining - 1);
      if (!rest) continue;
      const candidate = {
        score: p + rest.score,
        parts: [cleanParsedCardName(segmentWords.join(" ")), ...rest.parts],
      };
      if (!best || candidate.score < best.score) best = candidate;
    }
    memo.set(key, best);
    return best;
  }

  return dp(0, targetCount)?.parts.filter((name) => name && looksLikeCardName(name)) ?? [];
}

function parseCompressedProseDecklist(raw?: string): ParsedDeckEntry[] | null {
  if (!raw?.trim()) return null;
  const compact = raw.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  const sectionMatches = Array.from(compact.matchAll(PROSE_SECTION_RE));
  if (sectionMatches.length < 3) return null;

  const byName = new Map<string, ParsedDeckEntry>();
  const add = (nameRaw: string, qty = 1) => {
    const name = cleanParsedCardName(nameRaw);
    if (!name || !looksLikeCardName(name)) return;
    const key = name.toLowerCase();
    const existing = byName.get(key);
    if (existing) existing.qty += qty;
    else byName.set(key, { name, qty });
  };

  const firstSectionIndex = sectionMatches[0]?.index ?? -1;
  if (firstSectionIndex > 0) {
    const prefix = compact.slice(0, firstSectionIndex);
    const idx = prefix.toLowerCase().lastIndexOf("commander");
    if (idx >= 0) {
      const commanderName = stripDecorativePrefix(prefix.slice(idx + "commander".length).replace(/^[:\s]+/, ""))
        .replace(/^1\s*[xX]?\s+/, "")
        .replace(/[^\p{L}\p{N}'")]+$/u, "")
        .trim();
      if (commanderName && !/^(deck|format|list)\b/i.test(commanderName)) add(commanderName, 1);
    }
  }

  for (let i = 0; i < sectionMatches.length; i++) {
    const match = sectionMatches[i];
    const section = String(match[1] || "").toLowerCase();
    const targetCount = match[2] ? Math.max(0, parseInt(match[2], 10) || 0) : 0;
    const start = (match.index ?? 0) + match[0].length;
    const end = i + 1 < sectionMatches.length ? sectionMatches[i + 1].index ?? compact.length : compact.length;
    const content = stripDecorativePrefix(compact.slice(start, end));
    if (!content) continue;

    const quantityRuns = parseQuantityRuns(content);
    if (quantityRuns.length >= 2) {
      for (const entry of quantityRuns) add(entry.name, entry.qty);
      continue;
    }

    if (targetCount > 0) {
      for (const name of splitKnownCountNames(content, targetCount)) add(name, 1);
    }
  }

  return byName.size >= 6 ? Array.from(byName.values()) : null;
}

/**
 * Parse a raw decklist text block into {name, qty} entries.
 * Handles various export formats from Moxfield, Archidekt, TappedOut, MTGO, Arena, etc.
 * 
 * Supported formats:
 *   - "3 Sol Ring" (standard)
 *   - "3x Sol Ring" (with x)
 *   - "Sol Ring x3" (trailing x)
 *   - "Sol Ring" (no qty = 1)
 *   - "1 Sol Ring (C21) 263" (with set code)
 *   - "1x Sol Ring [2XM] *F*" (with brackets and foil)
 *   - "SB: 1 Path to Exile" (sideboard prefix)
 *   - "CMDR: 1 Kenrith" (commander prefix)
 *   - CSV: "Sol Ring, 3" or "Sol Ring,3"
 *   
 * Ignores comments (# or //) and blank lines.
 */
export function parseDeckText(raw?: string): ParsedDeckEntry[] {
  if (!raw) return [];
  const delimited = parseDelimitedCardImport(raw);
  if (delimited) return delimited;

  const compressed = parseCompressedProseDecklist(raw);
  if (compressed) return compressed;

  const out: Record<string, number> = {};

  for (const rawLine of raw.split(/\r?\n/)) {
    let line = normalizeChars(rawLine);
    if (!line) continue;
    
    // Skip comment lines
    if (line.startsWith('#') || line.startsWith('//')) continue;
    
    // Skip section headers
    if (/^(COMMANDER|SIDEBOARD|MAINBOARD|MAYBEBOARD|LANDS?|CREATURES?|INSTANTS?|SORCERY|SORCERIES|ARTIFACTS?|ENCHANTMENTS?|PLANESWALKERS?|BATTLES?|CONSIDERING|COMPANION):?\s*$/i.test(line)) continue;
    // e.g. "Artifacts (5)", "Creatures (23)"
    if (/^(COMMANDER|SIDEBOARD|MAINBOARD|MAYBEBOARD|LANDS?|CREATURES?|INSTANTS?|SORCERY|SORCERIES|ARTIFACTS?|ENCHANTMENTS?|PLANESWALKERS?|BATTLES?|CONSIDERING|COMPANION)\s*\(\d+\)\s*$/i.test(line)) continue;
    // User prompt wrappers like "analyse this:" are not card names.
    if (!/^\s*(?:SB:|Sideboard:|CMDR:|Commander:)?\s*(?:\d+|x\s*\d+)/i.test(line) && /:\s*$/.test(line)) continue;
    
    // Strip sideboard/commander prefix but continue processing
    line = line.replace(/^(SB:|Sideboard:|CMDR:|Commander:)\s*/i, '');
    
    let qty = 1;
    let name = line;
    
    // Try various quantity patterns
    
    // Pattern 1: "3 Card Name" or "3x Card Name" or "3 x Card Name"
    let match = line.match(/^\s*(\d+)\s*[xX]?\s+(.+)$/);
    if (match) {
      qty = Math.max(1, parseInt(match[1], 10) || 1);
      name = match[2];
    } else {
      // Pattern 2: "x3 Card Name"
      match = line.match(/^\s*[xX]\s*(\d+)\s+(.+)$/);
      if (match) {
        qty = Math.max(1, parseInt(match[1], 10) || 1);
        name = match[2];
      } else {
        // Pattern 3: "Card Name x3" or "Card Name X 3"
        match = line.match(/^(.+?)\s+[xX]\s*(\d+)\s*$/);
        if (match) {
          name = match[1];
          qty = Math.max(1, parseInt(match[2], 10) || 1);
        } else {
          // Pattern 4: CSV format "Card Name, 3" or "Card Name,3"
          match = line.match(/^(.+?)\s*,\s*(\d+)\s*$/);
          if (match) {
            name = match[1];
            qty = Math.max(1, parseInt(match[2], 10) || 1);
          }
          // Otherwise: no quantity found, use qty=1 and full line as name
        }
      }
    }
    
    // Clean the card name
    name = cleanParsedCardName(name);
    
    // Validate it looks like a card name
    if (!name || !looksLikeCardName(name)) continue;
    
    // Aggregate same cards
    const key = name.toLowerCase();
    out[key] = (out[key] ?? 0) + qty;
    // Store the original casing (first occurrence wins)
    if (!out['__original_' + key]) {
      out['__original_' + key] = name as any;
    }
  }

  // Build result with original casing
  return Object.entries(out)
    .filter(([key]) => !key.startsWith('__original_'))
    .map(([key, qty]) => ({ 
      name: (out['__original_' + key] as unknown as string) || key, 
      qty 
    }));
}

/**
 * Parse decklist with zone information for 60-card constructed (non-Commander) decks.
 * For Commander, flattens to mainboard to match existing single-bucket behavior.
 *
 * - Section headers: Sideboard, Mainboard (empty header lines) toggle zone
 * - SB: / Sideboard: on a line forces that line to sideboard
 * - CMDR: lines are mainboard in deck_cards for Commander (commander is stored on `decks.commander`)
 */
export function parseDeckTextWithZones(
  raw?: string,
  options?: { isCommanderFormat?: boolean }
): ParsedDeckEntryWithZone[] {
  if (options?.isCommanderFormat) {
    return parseDeckText(raw).map((e) => ({ ...e, zone: "mainboard" as const }));
  }

  if (!raw) return [];
  const delimited = parseDelimitedCardImport(raw);
  if (delimited) return delimited.map((e) => ({ ...e, zone: "mainboard" as const }));

  type AggKey = string;
  const byKey = new Map<
    AggKey,
    { name: string; qty: number; zone: DeckCardZone }
  >();

  let lineZone: DeckCardZone = "mainboard";

  for (const rawLine of raw.split(/\r?\n/)) {
    let line = normalizeChars(rawLine);
    if (!line) continue;

    // `// Mainboard` / `// Sideboard` (export style) — must run before generic `//` skip
    if (line.startsWith("//")) {
      const inner = line.replace(/^\/\/\s*/, "").trim();
      if (/^(mainboard|sideboard)\s*:?\s*$/i.test(inner)) {
        lineZone = /^sideboard/i.test(inner) ? "sideboard" : "mainboard";
        continue;
      }
      continue;
    }
    if (line.startsWith("#")) {
      const inner = line.replace(/^#+\s*/, "").trim();
      if (/^(mainboard|sideboard)\s*:?\s*$/i.test(inner)) {
        lineZone = /^sideboard/i.test(inner) ? "sideboard" : "mainboard";
        continue;
      }
      continue;
    }

    if (/^sideboard:?\s*$/i.test(line)) {
      lineZone = "sideboard";
      continue;
    }
    if (/^mainboard:?\s*$/i.test(line)) {
      lineZone = "mainboard";
      continue;
    }

    if (
      /^(COMMANDER|MAYBEBOARD|CONSIDERING|COMPANION):?\s*$/i.test(line) ||
      /^(COMMANDER|MAYBEBOARD|CONSIDERING|COMPANION)\s*\(\d+\)\s*$/i.test(line)
    ) {
      continue;
    }
    if (
      /^(MAINBOARD|SIDEBOARD|LANDS?|CREATURES?|INSTANTS?|SORCERY|SORCERIES|ARTIFACTS?|ENCHANTMENTS?|PLANESWALKERS?|BATTLES?|CONSIDERING|COMPANION):?\s*$/i.test(
        line
      )
    ) {
      if (/^sideboard/i.test(line)) lineZone = "sideboard";
      else if (/^mainboard/i.test(line)) lineZone = "mainboard";
      continue;
    }
    if (
      /^(MAINBOARD|SIDEBOARD|LANDS?|CREATURES?|INSTANTS?|SORCERY|SORCERIES|ARTIFACTS?|ENCHANTMENTS?|PLANESWALKERS?|BATTLES?|CONSIDERING|COMPANION)\s*\(\d+\)\s*$/i.test(
        line
      )
    ) {
      if (/^sideboard/i.test(line)) lineZone = "sideboard";
      if (/^mainboard/i.test(line)) lineZone = "mainboard";
      continue;
    }

    let thisZone: DeckCardZone = lineZone;
    if (/^SB:\s*/i.test(line) || /^Sideboard:\s*/i.test(line)) {
      thisZone = "sideboard";
      line = line.replace(/^(SB:|Sideboard:)\s*/i, "");
    } else {
      line = line.replace(/^(CMDR:|Commander:)\s*/i, "");
    }

    let qty = 1;
    let name = line;

    let match = line.match(/^\s*(\d+)\s*[xX]?\s+(.+)$/);
    if (match) {
      qty = Math.max(1, parseInt(match[1], 10) || 1);
      name = match[2];
    } else {
      match = line.match(/^\s*[xX]\s*(\d+)\s+(.+)$/);
      if (match) {
        qty = Math.max(1, parseInt(match[1], 10) || 1);
        name = match[2];
      } else {
        match = line.match(/^(.+?)\s+[xX]\s*(\d+)\s*$/);
        if (match) {
          name = match[1];
          qty = Math.max(1, parseInt(match[2], 10) || 1);
        } else {
          match = line.match(/^(.+?)\s*,\s*(\d+)\s*$/);
          if (match) {
            name = match[1];
            qty = Math.max(1, parseInt(match[2], 10) || 1);
          }
        }
      }
    }

    name = cleanParsedCardName(name);
    if (!name || !looksLikeCardName(name)) continue;

    const key = `${thisZone}::${name.toLowerCase()}` as AggKey;
    const existing = byKey.get(key);
    if (existing) {
      existing.qty += qty;
    } else {
      byKey.set(key, { name, qty, zone: thisZone });
    }
  }

  return Array.from(byKey.values());
}
