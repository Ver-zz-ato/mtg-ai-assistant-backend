/**
 * OpenAI request param sanitization
 * Responses API models (gpt-5, gpt-4o, etc.) reject temperature/top_p/max_tokens.
 * Use max_completion_tokens only. Never send temperature or top_p.
 */

const FORBIDDEN_KEYS = ["temperature", "top_p", "max_tokens"] as const;

const isDev = process.env.NODE_ENV === "development";

/**
 * Strip forbidden params from an OpenAI request payload.
 * Mutates the object in place and returns it.
 * Use this immediately before JSON.stringify and fetch.
 */
export function sanitizeOpenAIParams<T extends Record<string, unknown>>(
  payload: T
): T {
  for (const key of FORBIDDEN_KEYS) {
    if (key in payload) {
      delete (payload as Record<string, unknown>)[key];
    }
  }
  return payload;
}

/**
 * Dev-only: throws if payload contains any forbidden param.
 * Call before sanitize to catch accidental reintroduction.
 */
export function assertNoForbiddenParams(payload: Record<string, unknown>): void {
  if (!isDev) return;
  for (const key of FORBIDDEN_KEYS) {
    if (key in payload) {
      throw new Error(
        `[openai-params] Forbidden param "${key}" must not be sent to OpenAI. Use sanitizeOpenAIParams() and max_completion_tokens only.`
      );
    }
  }
}

/**
 * Prepare a request body for OpenAI: assert (dev) then sanitize.
 * Use this for every OpenAI request before sending.
 */
export function prepareOpenAIBody<T extends Record<string, unknown>>(payload: T): T {
  assertNoForbiddenParams(payload as Record<string, unknown>);
  return sanitizeOpenAIParams(payload);
}
