import { getAdmin } from "@/lib/supa";
import type { GameAction, VoiceTargetMatchQuality } from "./types";

export type VoiceInteractionRow = {
  user_id: string | null;
  anon_id: string | null;
  user_tier: string | null;
  screen: string | null;
  voice_mode: string | null;
  transcript: string | null;
  detected_mode: string | null;
  local_parser_hit: boolean | null;
  action_count: number;
  pending_action_count: number;
  actions_json: GameAction[] | null;
  pending_actions_json: GameAction[] | null;
  players_snapshot_json: Array<{ id: string; name: string; aliases?: string[] }> | null;
  players_count: number;
  match_quality: VoiceTargetMatchQuality | null;
  clarify_reason: string | null;
  confirmation_required: boolean | null;
  confirmation_reason: string | null;
  confirmation_resolution: string | null;
  assistant_text: string | null;
  spoken_confirmation: string | null;
  tts_requested: boolean | null;
  tts_generated: boolean | null;
  follow_up_used: boolean | null;
  final_outcome: string | null;
  latency_ms: number | null;
  error_code: string | null;
};

export async function insertVoiceInteraction(row: VoiceInteractionRow): Promise<void> {
  try {
    const admin = getAdmin();
    const { error } = await admin.from("voice_interactions").insert(row);
    if (error) {
      console.error("[voice/telemetry] insert failed", error.message);
    }
  } catch (error) {
    console.error("[voice/telemetry] insert error", error);
  }
}
