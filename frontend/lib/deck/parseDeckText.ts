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
