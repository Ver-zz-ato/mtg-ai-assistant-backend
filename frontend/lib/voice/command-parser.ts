/**
 * Command parser — converts transcript to structured game actions.
 * Uses JSON mode. Validates output. Returns empty actions on failure.
 */

import { VOICE_COMMAND_PARSER_PROMPT } from "@/lib/ai/prompts/voice-commands";
import { DEFAULT_FALLBACK_MODEL } from "@/lib/ai/default-models";
import type { GameAction } from "./types";
import { parseLocalGameCommand } from "./local-command-parser";
import { validateActions } from "./validate";

const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = DEFAULT_FALLBACK_MODEL;

export interface CommandParserOutput {
  mode: "game_action";
  actions: GameAction[];
  spoken_confirmation: string;
}

export interface ParserContext {
  players?: Array<{ id: string; name: string }>;
  selfPlayerId?: string;
}

export async function parseCommands(
  transcript: string,
  apiKey: string,
  ctx?: ParserContext
): Promise<CommandParserOutput> {
  const local = parseLocalGameCommand(transcript, ctx);
  if (local?.actions.length) {
    return {
      mode: "game_action",
      actions: local.actions,
      spoken_confirmation: local.spoken_confirmation,
    };
  }

  const playersJson = ctx?.players?.length
    ? `Players: ${JSON.stringify(ctx.players)}. Self/me: ${ctx.selfPlayerId ?? "unknown"}.`
    : "No player context. Use 'self' or 'me' as target placeholder when speaker means themselves.";

  const res = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: VOICE_COMMAND_PARSER_PROMPT + "\n\n" + playersJson },
        { role: "user", content: `Parse: "${transcript}"` },
      ],
      max_tokens: 300,
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    console.error("[voice/parser] Parser error:", await res.text());
    return { mode: "game_action", actions: [], spoken_confirmation: "" };
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content?.trim();
  if (!raw) return { mode: "game_action", actions: [], spoken_confirmation: "" };

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    let actions: unknown[] = Array.isArray(parsed.actions) ? parsed.actions : [];
    const spoken_confirmation =
      typeof parsed.spoken_confirmation === "string" ? parsed.spoken_confirmation : "";

    const validated = validateActions(actions, ctx);
    return {
      mode: "game_action",
      actions: validated,
      spoken_confirmation,
    };
  } catch (e) {
    console.error("[voice/parser] Parse error:", e);
    return { mode: "game_action", actions: [], spoken_confirmation: "" };
  }
}
