/**
 * Shared chat context builder for both stream and non-stream routes.
 * Provides: thread summary (within-thread memory), Pro user preferences (cross-thread memory).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildSummaryPrompt,
  parseSummary,
  formatSummaryForPrompt,
  normalizeSummary,
  type ConversationSummary,
} from "@/lib/ai/conversation-summary";

const THREAD_SUMMARY_MIN_MESSAGES = 4;
const THREAD_SUMMARY_STALE_AFTER_MESSAGES = 4;
const MEMORY_MAX_LENGTH = 240;
const LOCAL_MEMORY_MAX_LENGTH = 900;
const PII_OR_SECRET_RE = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|(\b(password|passcode|api[_ -]?key|secret|access[_ -]?token|bearer|credit card|card number|ssn)\b)|(\+?\d[\d\s().-]{8,}\d)/i;

export interface ThreadSummaryResult {
  /** Formatted string to append to system prompt, or empty if none */
  formatted: string;
  /** Whether background summary generation was triggered */
  triggeredBackgroundGen: boolean;
}

async function generateAndPersistThreadSummary(
  supabase: SupabaseClient,
  tid: string,
  threadHistory: Array<{ role: string; content: string }>,
  userId: string | null,
  isPro: boolean,
  anonId: string | null
): Promise<ConversationSummary | null> {
  const { callLLM } = await import("@/lib/ai/unified-llm-client");
  const { getModelForTier } = await import("@/lib/ai/model-by-tier");
  const tierRes = getModelForTier({ isGuest: false, userId, isPro });
  const summaryPrompt = buildSummaryPrompt(threadHistory);
  const messages = [
    { role: "system" as const, content: "Extract key ManaTap chat memory. Return only valid JSON." },
    { role: "user" as const, content: summaryPrompt },
  ];
  const response = await callLLM(messages, {
    route: "/api/chat/memory-summary",
    feature: "chat",
    model: tierRes.fallbackModel,
    fallbackModel: tierRes.fallbackModel,
    timeout: 12000,
    maxTokens: 1200,
    apiType: "chat",
    userId,
    isPro,
    anonId,
    skipRecordAiUsage: false,
  });
  const summary = normalizeSummary({
    ...(parseSummary(response.text) ?? {}),
    messageCount: threadHistory.length,
    updatedAt: new Date().toISOString(),
  });
  if (!summary) return null;
  await supabase
    .from("chat_threads")
    .update({ summary: JSON.stringify(summary) })
    .eq("id", tid);
  return summary;
}

function triggerBackgroundThreadSummaryRefresh(
  supabase: SupabaseClient,
  tid: string,
  threadHistory: Array<{ role: string; content: string }>,
  userId: string | null,
  isPro: boolean,
  anonId: string | null
): void {
  void (async () => {
    try {
      await generateAndPersistThreadSummary(supabase, tid, threadHistory, userId, isPro, anonId);
    } catch (error) {
      console.warn("[chat-context] Background summary generation failed:", error);
    }
  })();
}

/**
 * Inject thread summary (conversation memory) into context.
 * Fetches existing summary from chat_threads. Missing summaries are generated once the
 * thread has enough substance; stale summaries are refreshed in the background.
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
  if (!tid || isGuest || threadHistory.length < THREAD_SUMMARY_MIN_MESSAGES) {
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
        const summary = normalizeSummary(JSON.parse(thread.summary) as ConversationSummary);
        const formatted = summary ? formatSummaryForPrompt(summary) : "";
        const summarizedCount = summary?.messageCount ?? 0;
        const isStale = summarizedCount > 0 && threadHistory.length - summarizedCount >= THREAD_SUMMARY_STALE_AFTER_MESSAGES;
        if (isStale) {
          triggerBackgroundThreadSummaryRefresh(supabase, tid, threadHistory, userId, isPro, anonId);
        }
        return formatted ? { formatted, triggeredBackgroundGen: isStale } : { formatted: "", triggeredBackgroundGen: isStale };
      } catch {
        return {
          formatted: `\n\nConversation summary: ${thread.summary}`,
          triggeredBackgroundGen: false,
        };
      }
    }

    try {
      const summary = await generateAndPersistThreadSummary(supabase, tid, threadHistory, userId, isPro, anonId);
      const formatted = summary ? formatSummaryForPrompt(summary) : "";
      return { formatted, triggeredBackgroundGen: false };
    } catch (error) {
      console.warn("[chat-context] Synchronous summary generation failed:", error);
      triggerBackgroundThreadSummaryRefresh(supabase, tid, threadHistory, userId, isPro, anonId);
      return { formatted: "", triggeredBackgroundGen: true };
    }
  } catch (error) {
    console.warn("[chat-context] Thread summary failed:", error);
    return { formatted: "", triggeredBackgroundGen: false };
  }
}

export interface ExplicitMemoryCandidate {
  text: string;
  scope: "user" | "deck" | "format";
  memoryType: "budget_preference" | "constraint" | "playstyle_preference" | "note";
}

export interface DurableChatMemory {
  id?: string;
  scope: "user" | "deck" | "format";
  memoryType: string;
  text: string;
  deckId?: string | null;
  format?: string | null;
}

function cleanMemoryText(value: unknown, maxLength = MEMORY_MAX_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 4 || PII_OR_SECRET_RE.test(cleaned)) return null;
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength).trim() : cleaned;
}

function classifyMemoryType(text: string): ExplicitMemoryCandidate["memoryType"] {
  if (/\b(budget|cheap|expensive|under\s*[$\u00a3\u20ac]?\d+|spend|price|upgrade path)\b/i.test(text)) return "budget_preference";
  if (/\b(no|never|avoid|don't|do not|without|must keep|pet card|house rule)\b/i.test(text)) return "constraint";
  if (/\b(casual|competitive|cedh|combo|control|aggro|midrange|tokens|aristocrats|stax|tutor|combat)\b/i.test(text)) return "playstyle_preference";
  return "note";
}

export function sanitizeClientMemoryContext(raw: unknown): string {
  const precleaned = typeof raw === "string"
    ? raw
        .replace(/\b(localStorage|sessionStorage|document\.cookie)\b/gi, "[redacted]")
        .replace(/\bAuthorization:\s*Bearer\s+\S+/gi, "[redacted]")
    : raw;
  const cleaned = cleanMemoryText(precleaned, LOCAL_MEMORY_MAX_LENGTH);
  if (!cleaned) return "";
  return cleaned;
}

export function buildCurrentRequestMemoryRecallAnswer(userText: unknown, memoryContext: unknown): string | null {
  if (typeof userText !== "string") return null;
  const memory = sanitizeClientMemoryContext(memoryContext);
  if (!memory) return null;
  const q = userText.toLowerCase();
  const asksMemoryRecall = /\b(memory|remember|remembered|provided memory|memory context|marked as my|what.*favorite)\b/i.test(userText);
  if (!asksMemoryRecall) return null;

  const favoriteCard = memory.match(/\bfavou?rite\s+(?:mtg\s+|magic\s+)?card\s*[:=-]\s*([^\n.;|]+)/i);
  if (favoriteCard?.[1] && /\bfavou?rite\b/i.test(userText) && /\bcard\b/i.test(userText)) {
    return favoriteCard[1].trim();
  }

  const commander = memory.match(/\b(?:my\s+)?commander\s*[:=-]\s*([^\n.;|]+)/i);
  if (commander?.[1] && /\bcommander\b/i.test(q)) {
    return commander[1].trim();
  }

  return null;
}

export function extractExplicitMemoryCandidate(text: unknown): ExplicitMemoryCandidate | null {
  if (typeof text !== "string" || !/\bremember\b/i.test(text)) return null;
  const raw = text.replace(/\s+/g, " ").trim();
  const deckFirst = raw.match(/\bfor this deck,?\s+(?:please\s+)?remember(?: that)?\s+(.+)$/i);
  const deckLast = raw.match(/\b(?:please\s+)?remember(?: that)?\s+(.+?)\s+for this deck\b[.!?]?$/i);
  const formatMatch = raw.match(/\b(?:please\s+)?remember(?: that)?\s+(.+?)\s+for (?:my\s+)?(commander|modern|standard|pioneer|pauper|legacy|vintage|brawl|historic)\b[.!?]?$/i);
  const general = raw.match(/\b(?:please\s+)?remember(?: that)?\s+(.+)$/i);

  const scope: ExplicitMemoryCandidate["scope"] = deckFirst || deckLast ? "deck" : formatMatch ? "format" : "user";
  const body = deckFirst?.[1] ?? deckLast?.[1] ?? formatMatch?.[1] ?? general?.[1] ?? "";
  const cleaned = cleanMemoryText(body.replace(/\bfrom now on\b/gi, "").replace(/[.!?]+$/g, ""));
  if (!cleaned) return null;
  return {
    text: cleaned,
    scope,
    memoryType: classifyMemoryType(cleaned),
  };
}

function memoryValueToText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "text" in value && typeof (value as { text?: unknown }).text === "string") {
    return (value as { text: string }).text;
  }
  return "";
}

function rowToDurableMemory(row: {
  id?: string;
  scope?: string | null;
  memory_type?: string | null;
  value?: unknown;
  deck_id?: string | null;
}): DurableChatMemory | null {
  const scope = row.scope === "deck" || row.scope === "format" ? row.scope : "user";
  const text = cleanMemoryText(memoryValueToText(row.value));
  if (!text) return null;
  const format = row.value && typeof row.value === "object" && "format" in row.value && typeof (row.value as { format?: unknown }).format === "string"
    ? (row.value as { format: string }).format
    : null;
  return {
    id: row.id,
    scope,
    memoryType: row.memory_type ?? "note",
    text,
    deckId: row.deck_id ?? null,
    format,
  };
}

export async function saveExplicitMemoryFromUserText(args: {
  supabase: SupabaseClient;
  userId: string | null;
  isPro: boolean;
  text: string;
  deckId?: string | null;
  format?: string | null;
  threadId?: string | null;
}): Promise<{ saved: boolean; memory?: DurableChatMemory; skippedReason?: string }> {
  const candidate = extractExplicitMemoryCandidate(args.text);
  if (!candidate) return { saved: false, skippedReason: "no_explicit_memory" };
  if (!args.userId || !args.isPro) return { saved: false, skippedReason: "durable_memory_requires_pro" };
  if (candidate.scope === "deck" && !args.deckId) return { saved: false, skippedReason: "deck_memory_requires_linked_deck" };

  try {
    const { data: existingRows } = await args.supabase
      .from("deck_memories")
      .select("id, scope, memory_type, value, deck_id")
      .eq("user_id", args.userId)
      .eq("status", "confirmed")
      .limit(40);

    const normalizedNew = candidate.text.toLowerCase();
    const duplicate = Array.isArray(existingRows)
      ? existingRows.some((row) => {
          const existing = rowToDurableMemory(row);
          if (!existing) return false;
          return existing.scope === candidate.scope
            && (existing.deckId ?? null) === (candidate.scope === "deck" ? args.deckId ?? null : null)
            && existing.text.toLowerCase() === normalizedNew;
        })
      : false;

    if (duplicate) return { saved: false, skippedReason: "duplicate" };

    const value = {
      text: candidate.text,
      format: candidate.scope === "format" ? args.format ?? null : null,
    };
    const { data, error } = await args.supabase
      .from("deck_memories")
      .insert({
        user_id: args.userId,
        deck_id: candidate.scope === "deck" ? args.deckId ?? null : null,
        scope: candidate.scope,
        memory_type: candidate.memoryType,
        value,
        status: "confirmed",
        source_thread_id: args.threadId ?? null,
        confirmed_at: new Date().toISOString(),
      })
      .select("id, scope, memory_type, value, deck_id")
      .maybeSingle();

    if (error || !data) return { saved: false, skippedReason: error?.message ?? "insert_failed" };
    const memory = rowToDurableMemory(data);
    return memory ? { saved: true, memory } : { saved: false, skippedReason: "invalid_saved_memory" };
  } catch (error) {
    console.warn("[chat-context] Explicit memory save failed:", error);
    return { saved: false, skippedReason: "save_failed" };
  }
}

export async function loadDurableChatMemories(args: {
  supabase: SupabaseClient;
  userId: string | null;
  isPro: boolean;
  deckId?: string | null;
  format?: string | null;
  limit?: number;
}): Promise<DurableChatMemory[]> {
  if (!args.userId || !args.isPro) return [];
  try {
    const { data } = await args.supabase
      .from("deck_memories")
      .select("id, scope, memory_type, value, deck_id")
      .eq("user_id", args.userId)
      .eq("status", "confirmed")
      .order("confirmed_at", { ascending: false })
      .limit(Math.max(args.limit ?? 12, 12));

    if (!Array.isArray(data)) return [];
    const normalizedFormat = args.format?.trim().toLowerCase() ?? null;
    const memories = data
      .map(rowToDurableMemory)
      .filter((memory): memory is DurableChatMemory => {
        if (!memory) return false;
        if (memory.scope === "deck") return !!args.deckId && memory.deckId === args.deckId;
        if (memory.scope !== "format") return true;
        const memoryFormat = memory.format?.trim().toLowerCase() ?? null;
        return !memoryFormat || !normalizedFormat || memoryFormat === normalizedFormat;
      })
      .slice(0, args.limit ?? 10);
    return memories;
  } catch (error) {
    console.warn("[chat-context] Durable memory load failed:", error);
    return [];
  }
}

export function formatDurableMemoriesForPrompt(memories: DurableChatMemory[]): string {
  if (!memories.length) return "";
  const lines = memories.slice(0, 10).map((memory) => {
    const scope = memory.scope === "deck" ? "this deck" : memory.scope === "format" ? "this format" : "user";
    return `- ${scope}/${memory.memoryType}: ${memory.text}`;
  });
  return `\n\nSAVED MANATAP MEMORY (confirmed by the user; advisory, and current message/deck data overrides it):\n${lines.join("\n")}`;
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
