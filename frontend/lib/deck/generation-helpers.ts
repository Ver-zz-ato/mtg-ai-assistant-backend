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
 * If the model wrapped the list in ``` fences (optionally with prose before/after), use the fenced body.
 */
function unwrapMarkdownFence(text: string): string {
  const t = text.trim();
  const open = t.indexOf("```");
  if (open === -1) return t;
  const afterOpen = t.indexOf("\n", open);
  const innerStart = afterOpen === -1 ? open + 3 : afterOpen + 1;
  const close = t.lastIndexOf("```");
  if (close <= open) return t;
  return t.slice(innerStart, close).trim();
}

function cleanCardNameFragment(s: string): string {
  return s.replace(/\*\*/g, "").replace(/`+/g, "").trim();
}

/**
 * Parse model decklist output: one "qty name" line per card (same rules as legacy generate route).
 * Accepts common model drift: markdown fences, bullets, numbered lists ("1. Name" = one copy), trailing junk.
 */
export function parseAiDeckOutputLines(text: string): Array<{ name: string; qty: number }> {
  const out: Array<{ name: string; qty: number }> = [];
  if (!text) return out;
  const body = unwrapMarkdownFence(text);
  for (const raw of body.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    if (line.startsWith("```")) continue;

    if (line.startsWith("- ")) line = line.slice(2).trim();
    line = line.replace(/^\*+\s*/, "").replace(/\s*\*+$/, "").trim();
    if (!line) continue;

    // Standard: "1 Sol Ring", "1x Sol Ring", "4 Forest"
    let m = line.match(/^(\d+)\s*x?\s+(.+)$/i);
    if (m) {
      const qty = Math.max(1, Math.min(99, parseInt(m[1], 10) || 1));
      const name = cleanCardNameFragment(m[2]);
      if (name) out.push({ name, qty });
      continue;
    }

    // Numbered list: "1. Sol Ring" — leading number is list index, not MTG quantity
    m = line.match(/^(\d+)\.\s+(.+)$/);
    if (m) {
      const name = cleanCardNameFragment(m[2]);
      if (name) out.push({ name, qty: 1 });
    }
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
