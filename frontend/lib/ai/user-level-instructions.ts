/**
 * User-level instructions for tailoring AI responses by experience level.
 * Used in main chat and deck assistant to adjust language, tone, and depth.
 */

export type UserLevel = "beginner" | "intermediate" | "pro";

const BEGINNER_INSTRUCTION = `User level: BEGINNER. Use simple, plain language. Avoid jargon; when you must use MTG terms (e.g. ramp, curve, synergy), briefly define them. Be encouraging and patient. Use analogies and short explanations. Prefer concrete examples over abstract theory.`;

const INTERMEDIATE_INSTRUCTION = `User level: INTERMEDIATE. Assume basic MTG knowledge (lands, mana curve, card types). Use common strategic terms (ramp, card advantage, tempo) without defining them. Go into moderate depth on strategy and deckbuilding. Balance explanation with actionable advice.`;

const PRO_INSTRUCTION = `User level: PRO. Assume full Commander/MTG knowledge. Be concise and technical. Use jargon freely (mana dorks, stax, value engines, etc.). Skip hand-holding and obvious explanations. Lead with actionable recommendations.`;

const INSTRUCTIONS: Record<UserLevel, string> = {
  beginner: BEGINNER_INSTRUCTION,
  intermediate: INTERMEDIATE_INSTRUCTION,
  pro: PRO_INSTRUCTION,
};

/** Returns the system-prompt instruction block for the given user level, or empty string if invalid. */
export function getUserLevelInstruction(level: string | null | undefined): string {
  const normalized = typeof level === "string" ? level.toLowerCase().trim() : "";
  const key = normalized as UserLevel;
  if (key in INSTRUCTIONS) {
    return `\n\n${INSTRUCTIONS[key]}`;
  }
  return "";
}
