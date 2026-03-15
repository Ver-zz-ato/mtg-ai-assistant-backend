/**
 * Append-only log of AI suggestion outcomes. Fail-open: never throws into caller.
 */

import { getAdmin } from "@/app/api/_lib/supa";

export type LogSuggestionOutcomeInput = {
  suggestion_id: string;
  deck_id?: string | null;
  user_id?: string | null;
  visitor_id?: string | null;
  suggested_card?: string | null;
  replaced_card?: string | null;
  category?: string | null;
  prompt_version_id?: string | null;
  format?: string | null;
  commander?: string | null;
  accepted?: boolean | null;
  rejected?: boolean | null;
  ignored?: boolean | null;
  outcome_source?: string | null;
};

/**
 * Log a suggestion outcome to ai_suggestion_outcomes. Best-effort; logs and returns false on failure.
 */
export async function logSuggestionOutcome(input: LogSuggestionOutcomeInput): Promise<boolean> {
  try {
    const admin = getAdmin();
    if (!admin) return false;

    const suggestionId = String(input.suggestion_id ?? "").trim();
    if (!suggestionId) return false;

    const { error } = await admin.from("ai_suggestion_outcomes").insert({
      suggestion_id: suggestionId,
      deck_id: input.deck_id ?? null,
      user_id: input.user_id ?? null,
      visitor_id: input.visitor_id ?? null,
      suggested_card: input.suggested_card ?? null,
      replaced_card: input.replaced_card ?? null,
      category: input.category ?? null,
      prompt_version_id: input.prompt_version_id ?? null,
      format: input.format ?? null,
      commander: input.commander ?? null,
      accepted: input.accepted ?? null,
      rejected: input.rejected ?? null,
      ignored: input.ignored ?? null,
      outcome_source: input.outcome_source ?? "client_accept",
    });

    if (error) {
      console.warn("[data-moat] logSuggestionOutcome failed:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[data-moat] logSuggestionOutcome error:", e);
    return false;
  }
}
