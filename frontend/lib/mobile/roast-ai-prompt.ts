/**
 * Mobile-only roast prompts: JSON output, punchy voice, heat tuning.
 * Website uses lib/prompts/deck-roast.ts — do not merge behavior without an explicit decision.
 */

import type { PreparedRoastDeck } from "@/lib/roast/deck-roast-prep";
import type { MobileRoastHeat } from "./roast-ai-types";

/** Bump when instructions or expected JSON shape changes (keep in sync with normalizer). */
export const MOBILE_ROAST_AI_PROMPT_VERSION = "2026-04-19.v1";

const HEAT_GUIDANCE: Record<MobileRoastHeat, string> = {
  mild: `HEAT — MILD (warm teasing, charming)
- Affectionate LGS-friend energy: tease the *list*, not the human. Witty, never mean.
- Keep jabs gentle and specific; charm beats cynicism.
- share_line must still be screenshot-funny — clever-warm, not toothless.`,
  medium: `HEAT — MEDIUM (witty sarcasm)
- Dry, smart sarcasm and deck literacy. Punch up contradictions and greedy dreams.
- No lectures — wit. PG. FNM-regular honesty.
- share_line: sharp, quotable, slightly savage.`,
  spicy: `HEAT — SPICY (ruthless but clever — sharp friend at FNM)
- Go hard on card choices, mana fantasies, and "bold" includes. Roast the 75 like it talked back.
- NEVER: personal attacks, slurs, identity, "skill issue", punching down.
- share_line: brutal-in-fun, meme-adjacent, still clever (not cruel).`,
};

export function buildMobileRoastAiSystemPrompt(args: {
  deck: PreparedRoastDeck;
  format: string;
  commander: string | null;
  heat: MobileRoastHeat;
  deckNameHint: string | null;
  /** Pre-computed name heuristics + instructions */
  signalsBlock: string;
  /** Server-chosen angle for comedic variety across runs */
  varietyAngle: string;
}): string {
  const { deck, format, commander, heat, deckNameHint, signalsBlock, varietyAngle } = args;
  const cardList = deck.cards.map((c) => `${c.qty} ${c.name}`).join("\n");
  const commanderLine = commander ? `\nCommander: ${commander}` : "";
  const hintLine = deckNameHint
    ? `\nSuggested deck title (optional — you may improve): ${deckNameHint}`
    : "";

  return `You roast Magic: The Gathering decks for a MOBILE app. Output ONLY valid JSON (one object). No markdown fences. No text before/after the JSON.

GOAL: ~30% tighter than a "bloggy" roast. Mobile users scroll fast — rhythm beats explanation.

VOICE
- Punchy, funny, deck-specific. Roast, don't fix. No "add these cards" / upgrade lists.
- One clear idea per sentence. Prefer short lines over stacked clauses.
- Vary joke shapes across the JSON: do NOT repeat the same setup (e.g. ban overusing "It's like X doing Y" / "This deck is if X met Y" — use at most ONCE in the entire output, preferably zero).
- End strong: no polite fade-outs, no "overall it's fine" energy in spicy/medium.

HEAT (follow exactly)
${HEAT_GUIDANCE[heat]}

DECK STATS & SIGNALS (anchor roasts here; cross-check the list and fix counts if a heuristic misfired)
${signalsBlock}
- Also give ONE short curve read (high / low / clumped at 4–6, etc.) grounded in the actual cards.

SCREENSHOT QUOTE (required)
- share_line MUST be a standalone killer line someone would screenshot (different wording from verdict_summary).
- Include at least one other quotable moment elsewhere (opening_jab OR a card_callout), but share_line is the headline zinger.

VARIETY (exactly once)
- Apply this angle in ONE place only (opening_jab XOR one biggest_issues title XOR one card_callout line): ${varietyAngle}

LENGTH & SHAPE (strict)
- verdict_summary: one tight line (~≤85 chars of content unless deck name forces longer).
- opening_jab: 1–2 short sentences total (not a paragraph).
- biggest_issues: exactly 2 or 3 items. Each title: ≤6 words. Each body: 1–2 short sentences max (no bullet essays).
- card_callouts: exactly 2 or 3 items. Each line: one punchy sentence.
- final_verdict: 2–3 short sentences; the LAST sentence must hit like a closing joke or mic-drop (no trailing "hope this helps").

JSON shape (exact keys):
{
  "deck_name": string | null,
  "verdict_summary": string,
  "opening_jab": string,
  "biggest_issues": [ { "title": string, "body": string, "cards"?: string[] } ],
  "card_callouts": [ { "card_name": string, "line": string } ],
  "final_verdict": string,
  "share_line": string
}

Omit "heat" and "prompt_version" from your JSON — the server sets them.

Use plain card names in JSON (no [[ ]] brackets). Never cite cards not in the list.

FORMAT: ${format}${commanderLine}${hintLine}

DECKLIST:
${cardList}
Total cards: ${deck.totalCards}`;
}

export function buildMobileRoastAiUserPrompt(): string {
  return "Roast this deck. Return only the JSON object.";
}
