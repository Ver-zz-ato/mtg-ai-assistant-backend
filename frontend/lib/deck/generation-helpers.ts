/**
 * Shared helpers for deck generation routes (AI output parsing, name normalization).
 * Kept aligned with /api/deck/generate-from-collection post-processing.
 */

import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";

/** OpenAI chat.completions: `message.content` may be a string or an array of parts (e.g. gpt-5 family). */
export function extractChatCompletionContent(data: unknown): string {
  const c = (data as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return "";
  const chunks: string[] = [];
  for (const part of c) {
    if (typeof part === "string") chunks.push(part);
    else if (part && typeof part === "object" && typeof (part as { text?: string }).text === "string") {
      chunks.push((part as { text: string }).text);
    }
  }
  return chunks.join("");
}

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

/** Total physical cards (sum of qty). Commander checks must use this, not row count — e.g. "35 Mountain" + 64 one-ofs = 65 rows but 99 cards. */
export function totalDeckQty(cards: Array<{ qty: number }>): number {
  return cards.reduce((s, c) => s + Math.max(0, Number(c.qty) || 0), 0);
}

/** Keep card order; cap total quantity at maxQty (for Commander: 100). */
export function trimDeckToMaxQty(cards: Array<{ name: string; qty: number }>, maxQty: number): Array<{ name: string; qty: number }> {
  let rem = Math.max(0, maxQty);
  const out: Array<{ name: string; qty: number }> = [];
  for (const c of cards) {
    if (rem <= 0) break;
    const q = Math.max(0, Number(c.qty) || 0);
    if (q <= 0) continue;
    const take = Math.min(q, rem);
    out.push({ name: c.name, qty: take });
    rem -= take;
  }
  return out;
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
      continue;
    }

    // Bare card name (model sometimes omits quantity)
    if (
      line.length >= 3 &&
      line.length <= 120 &&
      /[a-zA-Z]/.test(line) &&
      !/^\d/.test(line) &&
      !line.includes("://") &&
      !line.includes("@")
    ) {
      const low = line.toLowerCase();
      if (
        low.startsWith("here ") ||
        low.startsWith("below ") ||
        low.includes("decklist") ||
        low.includes("commander:") ||
        low.includes("following cards") ||
        low.includes("following is") ||
        low.endsWith(":") ||
        low === "mainboard" ||
        low === "sideboard" ||
        low === "commander"
      ) {
        continue;
      }
      out.push({ name: cleanCardNameFragment(line), qty: 1 });
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
