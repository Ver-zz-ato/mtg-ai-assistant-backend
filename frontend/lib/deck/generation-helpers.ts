/**
 * Shared helpers for deck generation routes (AI output parsing, name normalization).
 * Kept aligned with /api/deck/generate-from-collection post-processing.
 */

import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";

export function norm(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function aggregateCards(cards: Array<{ name: string; qty: number }>): Array<{ name: string; qty: number }> {
  const map = new Map<string, { name: string; qty: number }>();
  for (const c of cards) {
    const key = c.name.trim().toLowerCase();
    const prev = map.get(key);
    if (prev) prev.qty = Math.min(99, prev.qty + c.qty);
    else map.set(key, { name: c.name.trim(), qty: c.qty });
  }
  return Array.from(map.values());
}

/**
 * Parse model decklist output: one "qty name" line per card (same rules as legacy generate route).
 */
export function parseAiDeckOutputLines(text: string): Array<{ name: string; qty: number }> {
  const out: Array<{ name: string; qty: number }> = [];
  if (!text) return out;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    const m = line.match(/^(\d+)\s*x?\s+(.+?)\s*$/i);
    if (!m) continue;
    const qty = Math.max(1, Math.min(99, parseInt(m[1], 10) || 1));
    const name = m[2].trim();
    if (!name) continue;
    out.push({ name, qty });
  }
  return out;
}

/** WUBRG color identity for a commander name (handles Partner // Partner). */
export async function getCommanderColorIdentity(commanderName: string): Promise<string[]> {
  if (!commanderName?.trim()) return [];
  const parts = commanderName.split(/\s*\/\/\s*/);
  const allColors = new Set<string>();
  try {
    const details = await getDetailsForNamesCached(parts);
    for (const part of parts) {
      const cardData = details.get(norm(part));
      if (cardData?.color_identity && Array.isArray(cardData.color_identity)) {
        cardData.color_identity.forEach((c: string) => allColors.add(c.toUpperCase()));
      }
    }
  } catch {
    // ignore
  }
  const wubrgOrder = ["W", "U", "B", "R", "G"];
  return wubrgOrder.filter((c) => allColors.has(c));
}
