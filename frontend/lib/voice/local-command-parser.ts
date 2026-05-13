/**
 * Deterministic parser for common lifecounter board commands.
 * Keeps frequent game mutations off the LLM path and mirrors the API action schema.
 */

import type { GameAction } from "./types";
import { validateActions, type ValidateContext } from "./validate";

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

const COUNTER_ALIASES: Record<string, "poison" | "energy" | "experience" | "rad" | "storm"> = {
  poison: "poison",
  poisons: "poison",
  toxic: "poison",
  toxicity: "poison",
  energy: "energy",
  energies: "energy",
  experience: "experience",
  rad: "rad",
  radiation: "rad",
  storm: "storm",
};

const COUNTER_PATTERN = Object.keys(COUNTER_ALIASES).join("|");
const NUMBER_PATTERN = "\\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty";

export interface LocalCommandParserContext extends ValidateContext {}

export interface LocalCommandParserOutput {
  actions: GameAction[];
  spoken_confirmation: string;
  confirmation_required?: boolean;
  confirmation_reason?: string;
  pending_actions?: GameAction[];
  local_parser_hit: true;
  ambiguous_target?: boolean;
}

function normalizeSpeech(text: string): string {
  return text
    .toLowerCase()
    .replace(/\bhit points?\b/g, "hp")
    .replace(/\bhealth\b/g, "life")
    .replace(/(\d+)x\b/g, "$1")
    .replace(/[.,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(raw: string): number {
  const normalized = raw.toLowerCase();
  return NUMBER_WORDS[normalized] ?? Number.parseInt(normalized, 10);
}

function numberSource(amount: number): string {
  return amount === 1 ? "1" : String(amount);
}

function detectTarget(
  text: string,
  ctx?: LocalCommandParserContext
): { target: string; ambiguous: boolean } {
  if (/\b(me|my|myself|self|i)\b/.test(text)) {
    return { target: ctx?.selfPlayerId ?? "self", ambiguous: false };
  }
  if (!ctx?.players?.length) return { target: ctx?.selfPlayerId ?? "self", ambiguous: false };

  const playerNumber = text.match(/\bplayer\s*(\d+)\b/);
  if (playerNumber) {
    const index = Number.parseInt(playerNumber[1], 10) - 1;
    if (ctx.players[index]) return { target: ctx.players[index].id, ambiguous: false };
    return { target: ctx.selfPlayerId ?? "self", ambiguous: true };
  }

  const normalizedText = text.replace(/[^a-z0-9 ]/g, "");
  const candidates = ctx.players
    .map((player) => {
      const normalizedName = player.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      const normalizedId = player.id.toLowerCase().replace(/[^a-z0-9]/g, "");
      const tokens = normalizedText.split(" ").filter((token) => token.length >= 3);
      const exactName = normalizedText.includes(normalizedName);
      const exactId = normalizedText.includes(normalizedId);
      const prefixToken = tokens.some((token) => normalizedName.startsWith(token) || normalizedId.startsWith(token));
      return { player, score: exactName || exactId ? 3 : prefixToken ? 1 : 0 };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 1 || candidates[0]?.score > candidates[1]?.score) {
    return { target: candidates[0].player.id, ambiguous: false };
  }

  if (candidates.length > 1 && candidates[0]?.score === candidates[1]?.score) {
    return { target: ctx.selfPlayerId ?? "self", ambiguous: true };
  }

  return { target: ctx.selfPlayerId ?? "self", ambiguous: false };
}

function actionPhrase(text: string): string {
  const counterMatch = text.match(new RegExp(`\\b(add|give|put|remove|subtract|take away)\\s+(${NUMBER_PATTERN})\\s*(?:counters?\\s*)?(${COUNTER_PATTERN})\\b`));
  if (counterMatch) return `${counterMatch[1]} ${counterMatch[2]} ${counterMatch[3]}`;

  const trailingCounterMatch = text.match(new RegExp(`\\b(${NUMBER_PATTERN})\\s*(?:counters?\\s*)?(${COUNTER_PATTERN})\\b`));
  if (trailingCounterMatch) return `${trailingCounterMatch[1]} ${trailingCounterMatch[2]}`;

  const lifeMatch = text.match(new RegExp(`\\b(add|gain|heal|increase|remove|subtract|take away|take|lose|lost|minus)\\s+(${NUMBER_PATTERN})\\s*(?:life|hp)?\\b`));
  if (lifeMatch) return `${lifeMatch[1]} ${lifeMatch[2]} life`;

  const setLifeMatch = text.match(new RegExp(`\\b(set|set life|set hp)\\b.*?\\b(?:to|at)\\s+(${NUMBER_PATTERN})\\b`));
  if (setLifeMatch) return `set ${setLifeMatch[2]}`;

  return "Done";
}

function confirmationFor(action: GameAction): string {
  if (action.action === "adjust_life") {
    return action.amount >= 0
      ? `Added ${numberSource(action.amount)} life`
      : `Removed ${numberSource(Math.abs(action.amount))} life`;
  }
  if (action.action === "set_life") return `Life set to ${action.value}`;
  if (action.action === "adjust_counter") {
    const label = action.counter === "poison" ? "poison" : action.counter;
    return action.amount >= 0
      ? `Added ${numberSource(action.amount)} ${label}`
      : `Removed ${numberSource(Math.abs(action.amount))} ${label}`;
  }
  if (action.action === "set_counter") return `${action.counter} set to ${action.value}`;
  return "Done";
}

export function parseLocalGameCommand(
  transcript: string,
  ctx?: LocalCommandParserContext
): LocalCommandParserOutput | null {
  const text = normalizeSpeech(transcript);
  if (!text) return null;

  if (/^(undo|revert that|take that back)$/.test(text)) {
    return { actions: [{ action: "undo" }], spoken_confirmation: "Undone", local_parser_hit: true };
  }

  const targetResult = detectTarget(text, ctx);
  const target = targetResult.target;
  const rawActions: unknown[] = [];

  const counterAdjust = text.match(new RegExp(`\\b(add|give|put|remove|subtract|take away)\\s+(${NUMBER_PATTERN})\\s*(?:counters?\\s*)?(${COUNTER_PATTERN})\\b`));
  const bareCounter = text.match(new RegExp(`^(${NUMBER_PATTERN})\\s*(?:counters?\\s*)?(${COUNTER_PATTERN})(?:\\s|$)`));
  if (counterAdjust || bareCounter) {
    const verb = counterAdjust?.[1] ?? "add";
    const amountRaw = counterAdjust?.[2] ?? bareCounter?.[1] ?? "0";
    const counterRaw = counterAdjust?.[3] ?? bareCounter?.[2] ?? "";
    const value = parseNumber(amountRaw);
    const sign = /^(remove|subtract|take away)$/.test(verb) ? -1 : 1;
    rawActions.push({
      action: "adjust_counter",
      target,
      counter: COUNTER_ALIASES[counterRaw] ?? counterRaw,
      amount: sign * value,
    });
  }

  if (!rawActions.length && /\bremove\s+(all\s+)?poison\b/.test(text)) {
    rawActions.push({ action: "set_counter", target, counter: "poison", value: 0 });
  }

  const setLife = text.match(new RegExp(`\\b(?:set|set life|set hp)\\b.*?\\b(?:to|at)\\s+(${NUMBER_PATTERN})\\b`));
  const atLife = text.match(new RegExp(`\\b(?:i'?m|im|player\\s*\\d+\\s*is|[a-z0-9_ -]+\\s*is)\\s+(?:at|on)\\s+(${NUMBER_PATTERN})\\b`));
  const setLifeValue = setLife?.[1] ?? atLife?.[1];
  if (!rawActions.length && setLifeValue) {
    rawActions.push({ action: "set_life", target, value: parseNumber(setLifeValue) });
  }

  const lifeAdjust = text.match(new RegExp(`\\b(add|gain|heal|increase|remove|subtract|take away|take|lose|lost|minus)\\s+(${NUMBER_PATTERN})\\s*(?:life|hp)?\\b`));
  if (!rawActions.length && lifeAdjust) {
    const verb = lifeAdjust[1];
    const value = parseNumber(lifeAdjust[2]);
    const sign = /^(add|gain|heal|increase)$/.test(verb) ? 1 : -1;
    rawActions.push({ action: "adjust_life", target, amount: sign * value });
  }

  const actions = validateActions(rawActions, ctx);
  if (!actions.length) return null;

  return {
    actions,
    spoken_confirmation: confirmationFor(actions[0]) || actionPhrase(text),
    local_parser_hit: true,
    ambiguous_target: targetResult.ambiguous,
  };
}
