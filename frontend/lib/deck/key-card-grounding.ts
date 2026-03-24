/**
 * Authoritative oracle snippets for a small set of key non-commander cards (LLM grounding).
 * Uses the same resolution path as commander grounding (fetchCard / cache + Scryfall).
 * Fail-open: returns null on miss/error or when nothing resolves.
 */

import { fetchCard } from "@/lib/deck/inference";

export const KEY_CARDS_GROUNDING_ORACLE_MAX_CHARS = 700;

function normName(n: string): string {
  return String(n || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupe(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const k = normName(n);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(n.trim());
  }
  return out;
}

/**
 * Compact instruction appended when a KEY CARDS block is injected (system or user context).
 */
export const KEY_CARDS_GROUNDING_INSTRUCTION = `========================
KEY CARD GROUNDING
========================
If a "KEY CARDS (AUTHORITATIVE)" block is present:
- Treat these cards as high-confidence mechanical references.
- Use their oracle text to validate interactions and engine logic.
- Prefer these grounded cards when explaining synergy chains.

Do not ignore grounded card text in favor of assumptions or misinterpret interactions involving these cards.

If the block is absent, proceed normally using deck context and general knowledge.`;

/**
 * Build labeled blocks with type line + oracle for each resolved card name.
 */
export async function formatKeyCardsGroundingForPrompt(cardNames: string[]): Promise<string | null> {
  if (!cardNames?.length) return null;
  const names = dedupe(cardNames).slice(0, 5);
  if (!names.length) return null;

  const blocks: string[] = ["=== KEY CARDS (AUTHORITATIVE) ==="];

  for (const raw of names) {
    try {
      const card = await fetchCard(raw);
      if (!card) continue;
      const typeLine = (card.type_line || "").trim();
      const oracleRaw = (card.oracle_text || "").trim();
      if (!typeLine && !oracleRaw) continue;

      const displayName = (card.name || raw).trim();
      const oracleCapped =
        oracleRaw.length > KEY_CARDS_GROUNDING_ORACLE_MAX_CHARS
          ? `${oracleRaw.slice(0, KEY_CARDS_GROUNDING_ORACLE_MAX_CHARS).trim()}…`
          : oracleRaw;

      blocks.push(`[[${displayName}]]`);
      if (typeLine) blocks.push(`Type: ${typeLine}`);
      if (oracleCapped) blocks.push(`Oracle text: ${oracleCapped}`);
      blocks.push("");
    } catch {
      /* skip card */
    }
  }

  if (blocks.length <= 1) return null;
  return blocks.join("\n").trim();
}
