/**
 * Mobile-only roast prompts: JSON output, short copy, stronger heat differentiation.
 * Website uses lib/prompts/deck-roast.ts — do not merge behavior without an explicit decision.
 */

import type { PreparedRoastDeck } from "@/lib/roast/deck-roast-prep";
import type { MobileRoastHeat } from "./roast-ai-types";

/** Bump when instructions or expected JSON shape changes (keep in sync with normalizer). */
export const MOBILE_ROAST_AI_PROMPT_VERSION = "2026-04-18.v1";

const HEAT_GUIDANCE: Record<MobileRoastHeat, string> = {
  mild: `HEAT: MILD (playful)
- Warm LGS-friend energy: tease, don't wound.
- 1 short joke + honest observations; no pile-ons.
- "Share line" should be clever-charming, not cutting.`,
  medium: `HEAT: MEDIUM (cheeky)
- Sharp but fair: call out deck habits and curve sins with wit.
- Mix specific card jabs with one broader deck-identity joke.
- "Share line" can sting a little — still PG and clever.`,
  spicy: `HEAT: SPICY (savage-but-clever)
- Maximum spice WITHOUT cruelty: no personal insults, no "skill issue", no slurs.
- Ruthless about deck choices, mana, and synergy fiction — MTG-native burns.
- "Share line" should be a quotable zinger someone would actually post.`,
};

export function buildMobileRoastAiSystemPrompt(args: {
  deck: PreparedRoastDeck;
  format: string;
  commander: string | null;
  heat: MobileRoastHeat;
  deckNameHint: string | null;
}): string {
  const { deck, format, commander, heat, deckNameHint } = args;
  const cardList = deck.cards.map((c) => `${c.qty} ${c.name}`).join("\n");
  const commanderLine = commander ? `\nCommander: ${commander}` : "";
  const hintLine = deckNameHint
    ? `\nSuggested deck title (optional — you may improve): ${deckNameHint}`
    : "";

  return `You roast Magic: The Gathering decks for a MOBILE app. Output must be ONLY valid JSON (one object), no markdown fences, no prose before or after.

VOICE: Punchy, funny, deck-specific. Roasts, not deck-building advice. No "add these cards" / no upgrade lists.

${HEAT_GUIDANCE[heat]}

RULES:
- Reference REAL cards from the decklist; in JSON use plain card names in "cards" / "card_name" fields (no [[ ]] syntax).
- Never invent cards not in the list.
- Keep strings short enough to read on a phone (see length hints below).
- Differentiate heat levels clearly: mild ≠ medium ≠ spicy.
- "verdict_summary": one tight line (max ~120 chars of meaning).
- "opening_jab": 1–2 sentences max.
- "biggest_issues": 3–4 items (not 1, not 7).
- "card_callouts": 2–4 items tying a specific card to a roast line.
- "final_verdict": 2–4 sentences, ends with a memorable closer.
- "share_line": single line, under ~140 chars, works standalone out of context.

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

Omit "heat" and "prompt_version" from the model output — the server will set them.

FORMAT: ${format}${commanderLine}${hintLine}

DECKLIST:
${cardList}
Total cards: ${deck.totalCards}`;
}

export function buildMobileRoastAiUserPrompt(): string {
  return "Roast this deck. Return only the JSON object.";
}
