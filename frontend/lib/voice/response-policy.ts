import type { GameAction } from "./types";

export type VoiceConfirmationReason =
  | "life_zero"
  | "large_life_change"
  | "clear_counter"
  | "set_counter_zero"
  | "ambiguous_target";

export interface ConfirmationAssessment {
  required: boolean;
  reason: VoiceConfirmationReason | null;
  prompt: string | null;
}

export function actionType(actions: GameAction[] | null | undefined): string | null {
  return actions?.[0]?.action ?? null;
}

export function assessConfirmationNeed(
  actions: GameAction[],
  opts: { ambiguousTarget?: boolean } = {}
): ConfirmationAssessment {
  if (opts.ambiguousTarget) {
    return {
      required: true,
      reason: "ambiguous_target",
      prompt: "Which player did you mean?",
    };
  }

  for (const action of actions) {
    if (action.action === "set_life" && action.value === 0) {
      return {
        required: true,
        reason: "life_zero",
        prompt: "Confirm setting life to 0?",
      };
    }

    if (action.action === "adjust_life" && Math.abs(action.amount) >= 20) {
      return {
        required: true,
        reason: "large_life_change",
        prompt: `Confirm ${action.amount > 0 ? "adding" : "removing"} ${Math.abs(action.amount)} life?`,
      };
    }

    if (action.action === "set_counter" && action.value === 0) {
      return {
        required: true,
        reason: action.counter === "poison" ? "clear_counter" : "set_counter_zero",
        prompt: `Confirm clearing ${action.counter}?`,
      };
    }
  }

  return { required: false, reason: null, prompt: null };
}

export function shouldSkipTtsForResponse(
  context: { noTts?: boolean; noTtsForCommands?: boolean; tts?: boolean } | null | undefined,
  mode: string
): boolean {
  if (context?.tts === false || context?.noTts) return true;
  return mode === "game_action" && context?.noTtsForCommands === true;
}
