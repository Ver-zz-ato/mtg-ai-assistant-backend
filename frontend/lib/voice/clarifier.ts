/**
 * Clarification generator — one short question when input is ambiguous.
 */

import { VOICE_CLARIFY_PROMPT } from "@/lib/ai/prompts/voice-clarify";
import { DEFAULT_FALLBACK_MODEL } from "@/lib/ai/default-models";

const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = DEFAULT_FALLBACK_MODEL;

export interface ClarifierOutput {
  mode: "clarify";
  clarification: string;
}

export async function generateClarification(
  transcript: string,
  apiKey: string
): Promise<ClarifierOutput> {
  const res = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: VOICE_CLARIFY_PROMPT },
        { role: "user", content: `Ambiguous input: "${transcript}"` },
      ],
      max_tokens: 80,
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    console.error("[voice/clarify] Clarifier error:", await res.text());
    return { mode: "clarify", clarification: "Could you repeat that?" };
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content?.trim();
  if (!raw) return { mode: "clarify", clarification: "Could you repeat that?" };

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const clarification =
      typeof parsed.clarification === "string" && parsed.clarification.length > 0
        ? parsed.clarification
        : "Could you repeat that?";

    return { mode: "clarify", clarification };
  } catch (e) {
    console.error("[voice/clarify] Parse error:", e);
    return { mode: "clarify", clarification: "Could you repeat that?" };
  }
}
