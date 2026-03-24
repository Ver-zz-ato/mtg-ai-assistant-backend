/**
 * Authoritative commander card text for LLM grounding (cache/Scryfall via fetchCard).
 * Fail-open: returns null on miss/error.
 */

import { fetchCard } from "@/lib/deck/inference";

/** Oracle cap for token budget (full text when shorter). */
export const COMMANDER_GROUNDING_ORACLE_MAX_CHARS = 800;

/**
 * Build a labeled block with resolved type line + oracle for the given commander name.
 * Uses the same resolution path as deck inference (scryfall_cache + API fallback).
 */
export async function formatCommanderGroundingForPrompt(commanderName: string): Promise<string | null> {
  const raw = String(commanderName || "").trim();
  if (!raw) return null;
  try {
    const card = await fetchCard(raw);
    if (!card) return null;
    const typeLine = (card.type_line || "").trim();
    const oracleRaw = (card.oracle_text || "").trim();
    if (!typeLine && !oracleRaw) return null;

    const displayName = (card.name || raw).trim();
    const oracleCapped =
      oracleRaw.length > COMMANDER_GROUNDING_ORACLE_MAX_CHARS
        ? `${oracleRaw.slice(0, COMMANDER_GROUNDING_ORACLE_MAX_CHARS).trim()}…`
        : oracleRaw;

    const lines: string[] = [
      "=== COMMANDER CARD (AUTHORITATIVE) ===",
      `Name: [[${displayName}]]`,
    ];
    if (typeLine) lines.push(`Type: ${typeLine}`);
    if (oracleCapped) lines.push(`Oracle text: ${oracleCapped}`);
    lines.push(
      "This block is the source of truth for the commander's actual abilities.",
      "Do NOT substitute abilities from similarly named cards.",
      "If other assumptions conflict with this block, trust this block."
    );

    return lines.join("\n");
  } catch {
    return null;
  }
}
