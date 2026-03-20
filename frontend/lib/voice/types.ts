/**
 * Voice command types — shared between intent classifier, command parser, and API.
 */

export type VoiceMode = "game_action" | "chat" | "clarify";

export type GameAction =
  | { action: "set_life"; target: string; value: number }
  | { action: "adjust_life"; target: string; amount: number }
  | { action: "set_counter"; target: string; counter: string; value: number }
  | { action: "adjust_counter"; target: string; counter: string; amount: number }
  | { action: "set_status"; target: string; status: string; value: boolean }
  | { action: "set_commander_damage"; target: string; source: string; value: number }
  | { action: "adjust_commander_damage"; target: string; source: string; amount: number }
  | { action: "undo" };

export interface IntentClassifierResult {
  mode: VoiceMode;
  confidence: number;
}

export interface CommandParserResult {
  mode: "game_action";
  actions: GameAction[];
  spoken_confirmation: string;
}

export interface ClarifierResult {
  mode: "clarify";
  clarification: string;
}

export interface VoiceContext {
  screen?: "game" | "other";
  players?: Array< { id: string; name: string } >;
  /** Player id to treat as "me" / self when targeting */
  selfPlayerId?: string;
}
