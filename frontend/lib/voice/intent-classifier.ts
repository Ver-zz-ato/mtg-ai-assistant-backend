/**
 * Intent classifier — decides game_action vs chat vs clarify.
 * Uses JSON mode. Falls back to chat on parse failure.
 */

import { VOICE_INTENT_SYSTEM_PROMPT } from "@/lib/ai/prompts/voice-intent";
import type { IntentClassifierResult, VoiceMode } from "./types";

const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

const ALLOWED_MODES: VoiceMode[] = ["game_action", "chat", "clarify"];

export async function classifyIntent(
  transcript: string,
  apiKey: string
): Promise<IntentClassifierResult> {
  const res = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: VOICE_INTENT_SYSTEM_PROMPT },
        { role: "user", content: `Classify: "${transcript}"` },
      ],
      max_tokens: 60,
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    console.error("[voice/intent] Classifier error:", await res.text());
    return { mode: "chat", confidence: 0 };
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content?.trim();
  if (!raw) return { mode: "chat", confidence: 0 };

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const mode = parsed.mode;
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;

    if (typeof mode === "string" && ALLOWED_MODES.includes(mode as VoiceMode)) {
      return {
        mode: mode as VoiceMode,
        confidence: Math.max(0, Math.min(1, confidence)),
      };
    }
  } catch (e) {
    console.error("[voice/intent] Parse error:", e);
  }

  return { mode: "chat", confidence: 0 };
}
