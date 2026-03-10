/**
 * Shared chat context builder for both stream and non-stream routes.
 * Provides: thread summary (within-thread memory), Pro user preferences (cross-thread memory).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildSummaryPrompt,
  parseSummary,
  formatSummaryForPrompt,
  type ConversationSummary,
} from "@/lib/ai/conversation-summary";

export interface ThreadSummaryResult {
  /** Formatted string to append to system prompt, or empty if none */
  formatted: string;
  /** Whether background summary generation was triggered */
  triggeredBackgroundGen: boolean;
}

/**
 * Inject thread summary (conversation memory) into context.
 * Fetches existing summary from chat_threads; if missing and 10+ messages, triggers background generation.
 */
export async function injectThreadSummaryContext(
  supabase: SupabaseClient,
  tid: string,
  threadHistory: Array<{ role: string; content: string }>,
  userId: string | null,
  isPro: boolean,
  isGuest: boolean,
  anonId: string | null
): Promise<ThreadSummaryResult> {
  if (!tid || isGuest || threadHistory.length < 10) {
    return { formatted: "", triggeredBackgroundGen: false };
  }

  try {
    const { data: thread } = await supabase
      .from("chat_threads")
      .select("summary")
      .eq("id", tid)
      .maybeSingle();

    if (thread?.summary) {
      try {
        const summary = JSON.parse(thread.summary) as ConversationSummary;
        const formatted = formatSummaryForPrompt(summary);
        return formatted ? { formatted, triggeredBackgroundGen: false } : { formatted: "", triggeredBackgroundGen: false };
      } catch {
        return {
          formatted: `\n\nConversation summary: ${thread.summary}`,
          triggeredBackgroundGen: false,
        };
      }
    }

    // Trigger background generation (fire-and-forget)
    (async () => {
      try {
        const { callLLM } = await import("@/lib/ai/unified-llm-client");
        const { getModelForTier } = await import("@/lib/ai/model-by-tier");
        const tierRes = getModelForTier({ isGuest: false, userId, isPro });
        const summaryPrompt = buildSummaryPrompt(threadHistory);
        const messages = [
          { role: "system" as const, content: "Extract key facts from this conversation. Return only valid JSON." },
          { role: "user" as const, content: summaryPrompt },
        ];
        const response = await callLLM(messages, {
          route: "/api/chat",
          feature: "chat",
          model: tierRes.fallbackModel,
          fallbackModel: tierRes.fallbackModel,
          timeout: 10000,
          maxTokens: 256,
          apiType: "chat",
          userId,
          isPro,
          anonId,
          skipRecordAiUsage: false,
        });
        const summary = parseSummary(response.text);
        if (summary) {
          await supabase
            .from("chat_threads")
            .update({ summary: JSON.stringify(summary) })
            .eq("id", tid);
        }
      } catch (error) {
        console.warn("[chat-context] Background summary generation failed:", error);
      }
    })();

    return { formatted: "", triggeredBackgroundGen: true };
  } catch (error) {
    console.warn("[chat-context] Thread summary failed:", error);
    return { formatted: "", triggeredBackgroundGen: false };
  }
}

export interface UserChatPreferences {
  format?: string | null;
  budget?: string | null;
  colors?: string[] | null;
  playstyle?: string | null;
}

/**
 * Format saved Pro preferences for system prompt injection.
 */
export function formatProPreferencesForPrompt(prefs: UserChatPreferences): string {
  const parts: string[] = [];
  if (prefs.format) parts.push(`Format: ${prefs.format}`);
  if (prefs.budget) parts.push(`Budget: ${prefs.budget}`);
  if (prefs.colors && prefs.colors.length > 0) parts.push(`Colors: ${prefs.colors.join(", ")}`);
  if (prefs.playstyle) parts.push(`Playstyle: ${prefs.playstyle}`);
  if (parts.length === 0) return "";
  return `\n\n[Pro: Your saved preferences across all chats] ${parts.join(" | ")}. Assume these without asking.`;
}

/**
 * Fetch saved Pro user preferences from DB. Returns null if not Pro or no preferences.
 */
export async function getProUserPreferences(
  supabase: SupabaseClient,
  userId: string | null,
  isPro: boolean
): Promise<UserChatPreferences | null> {
  if (!userId || !isPro) return null;
  try {
    const { data } = await supabase
      .from("user_chat_preferences")
      .select("format, budget, colors, playstyle")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return null;
    const prefs: UserChatPreferences = {
      format: data.format ?? null,
      budget: data.budget ?? null,
      colors: Array.isArray(data.colors) ? data.colors : null,
      playstyle: data.playstyle ?? null,
    };
    const hasAny = prefs.format || prefs.budget || (prefs.colors && prefs.colors.length) || prefs.playstyle;
    return hasAny ? prefs : null;
  } catch {
    return null;
  }
}
