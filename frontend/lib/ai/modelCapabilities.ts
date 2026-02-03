/**
 * Model capabilities registry: which OpenAI API surface a model supports.
 * Used so we never send a responses-only model (e.g. gpt-5.2-codex) to chat/completions.
 *
 * Thin prompt / thick validator: routing chooses model; this module answers
 * "does this model support chat_completions?" and "which endpoint should we use?"
 */

export type LlmApiSurface = "chat_completions" | "responses";

/** Override via env: comma-separated model IDs that require responses API (e.g. MODELS_RESPONSES_ONLY=gpt-5.2-codex) */
const RESPONSES_ONLY_ENV = typeof process !== "undefined" ? (process.env.MODELS_RESPONSES_ONLY || "").split(",").map((s) => s.trim()).filter(Boolean) : [];

/** Model IDs that are known to be responses-only (e.g. Codex). */
const RESPONSES_ONLY_PATTERNS = [
  (id: string) => id.endsWith("-codex"),
  ...RESPONSES_ONLY_ENV.map((id) => (m: string) => m === id),
];

/** Model IDs that are known to support chat/completions. */
const CHAT_COMPLETIONS_IDS = new Set([
  "gpt-5.2-chat-latest",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-4",
  "gpt-3.5-turbo",
]);

function normalizeModelId(model: string): string {
  return String(model || "").trim().toLowerCase();
}

/**
 * Preferred API surface for this model.
 * - Any model name ending in -codex => responses
 * - Known chat models => chat_completions
 * - default => chat_completions (can override via MODELS_RESPONSES_ONLY)
 */
export function getPreferredApiSurface(model: string): LlmApiSurface {
  const id = normalizeModelId(model);
  if (!id) return "chat_completions";

  for (const fn of RESPONSES_ONLY_PATTERNS) {
    if (fn(id)) return "responses";
  }
  if (CHAT_COMPLETIONS_IDS.has(id)) return "chat_completions";

  return "chat_completions";
}

/**
 * True if this model can be used with /v1/chat/completions (and thus with streaming chat).
 */
export function isChatCompletionsModel(model: string): boolean {
  return getPreferredApiSurface(model) === "chat_completions";
}

/**
 * True if this model requires /v1/responses (e.g. Codex).
 */
export function isResponsesOnlyModel(model: string): boolean {
  return getPreferredApiSurface(model) === "responses";
}
