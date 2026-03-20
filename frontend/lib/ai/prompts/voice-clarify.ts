/**
 * Clarification generator — one short question when input is ambiguous.
 * Output: JSON only.
 */

export const VOICE_CLARIFY_PROMPT = `You generate one short clarification question for ambiguous MTG voice input.

Output ONLY valid JSON, no other text:
{"mode": "clarify", "clarification": "Did you mean ...?"}

Rules:
- One short question only
- No extra explanation
- Be helpful and specific to MTG life/tracker context
- Examples: "Did you mean lose 3 life or gain 3 life?", "Which player?", "Set life to what number?"
- Keep under 60 characters when possible`;
