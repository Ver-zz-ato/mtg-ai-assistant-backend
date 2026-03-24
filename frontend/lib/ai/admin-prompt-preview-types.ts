/**
 * Admin-only prompt composition snapshot for /admin/chat-test.
 * Populated by /api/chat/stream when x-admin-prompt-preview: 1 and the user passes isAdmin().
 */

export type AdminPromptPreviewPayload = {
  /** Summary */
  prompt_layers_used: boolean;
  prompt_path: "composed" | "fallback_version" | "fallback_hardcoded" | "micro_override";
  /** Human-readable: composed layers vs DB version id vs hardcoded */
  base_prompt_source_label: string;
  prompt_version_id: string | null;
  modules_attached: string[];
  selected_prompt_tier: "micro" | "standard" | "full";
  model_tier: string;
  stream_injected: "analyze" | "confirm" | "ask_commander" | "none";

  /** Section 2: core system text from build path (includes NO_FILLER), before prefs / level / overlay */
  base_prompt_text: string;
  /** Standard tier only: recent 2-turn block if appended */
  standard_recent_history_text: string | null;
  /** Full tier: user preference block */
  user_prefs_text: string | null;
  user_level_text: string | null;
  tier_overlay_text: string | null;
  tier_overlay_applied: boolean;

  rules_facts_text: string | null;

  /** v2 analyze path: either deck intelligence + plan, or raw JSON summary */
  deck_intelligence_block_text: string | null;
  v2_summary_json_text: string | null;
  semantic_fingerprint_text: string | null;
  recommendation_steering_text: string | null;
  cards_in_deck_line_text: string | null;
  recent_conversation_block_text: string | null;
  commander_grounding_text: string | null;
  /** Non-commander key cards oracle grounding (full analyze path). */
  key_cards_grounding_text: string | null;
  deck_context_block_text: string | null;
  few_shot_examples_text: string | null;
  /** Raw / no-v2 path: generateDeckContext + fingerprint extras */
  raw_fallback_extras_text: string | null;

  /** Injected after deck context: analyze/confirm/ask_commander contract strings */
  stream_contract_injection_text: string | null;
  thread_memory_block_text: string | null;
  pro_cross_thread_prefs_text: string | null;

  /**
   * Exact system string passed to the model (after all appends for this request).
   * Labeled in UI as the authoritative final prompt.
   */
  final_system_prompt_exact: string;
  final_system_prompt_note: "exact_string_sent_to_openai";

  notes: string[];
};

export function createEmptyAdminPromptPreview(): AdminPromptPreviewPayload {
  return {
    prompt_layers_used: false,
    prompt_path: "composed",
    base_prompt_source_label: "",
    prompt_version_id: null,
    modules_attached: [],
    selected_prompt_tier: "micro",
    model_tier: "",
    stream_injected: "none",
    base_prompt_text: "",
    standard_recent_history_text: null,
    user_prefs_text: null,
    user_level_text: null,
    tier_overlay_text: null,
    tier_overlay_applied: false,
    rules_facts_text: null,
    deck_intelligence_block_text: null,
    v2_summary_json_text: null,
    semantic_fingerprint_text: null,
    recommendation_steering_text: null,
    cards_in_deck_line_text: null,
    recent_conversation_block_text: null,
    commander_grounding_text: null,
    key_cards_grounding_text: null,
    deck_context_block_text: null,
    few_shot_examples_text: null,
    raw_fallback_extras_text: null,
    stream_contract_injection_text: null,
    thread_memory_block_text: null,
    pro_cross_thread_prefs_text: null,
    final_system_prompt_exact: "",
    final_system_prompt_note: "exact_string_sent_to_openai",
    notes: [],
  };
}
