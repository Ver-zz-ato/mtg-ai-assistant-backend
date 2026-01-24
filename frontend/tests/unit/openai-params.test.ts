/**
 * Unit tests for OpenAI param sanitization.
 * Ensures temperature, top_p, and max_tokens are never sent to the API.
 */
import assert from "node:assert";
import {
  sanitizeOpenAIParams,
  assertNoForbiddenParams,
  prepareOpenAIBody,
} from "@/lib/ai/openai-params";

const savedEnv = process.env.NODE_ENV;

function restoreEnv() {
  process.env.NODE_ENV = savedEnv;
}

// --- sanitizeOpenAIParams ---
const withForbidden = {
  model: "gpt-5",
  messages: [{ role: "user", content: "hi" }],
  temperature: 0.7,
  top_p: 1.0,
  max_tokens: 100,
  max_completion_tokens: 500,
};
sanitizeOpenAIParams(withForbidden as Record<string, unknown>);
assert.equal((withForbidden as any).temperature, undefined, "temperature must be removed");
assert.equal((withForbidden as any).top_p, undefined, "top_p must be removed");
assert.equal((withForbidden as any).max_tokens, undefined, "max_tokens must be removed");
assert.equal((withForbidden as any).max_completion_tokens, 500, "max_completion_tokens must remain");
assert.equal((withForbidden as any).model, "gpt-5", "model must remain");

// --- prepareOpenAIBody (sanitize) ---
const prepared = prepareOpenAIBody({
  model: "gpt-4o-mini",
  messages: [],
  temperature: 0.9,
  max_completion_tokens: 128,
} as Record<string, unknown>);
assert.equal((prepared as any).temperature, undefined, "prepareOpenAIBody must strip temperature");
assert.equal((prepared as any).max_completion_tokens, 128, "prepareOpenAIBody must keep max_completion_tokens");

// --- assertNoForbiddenParams (dev-only): when NODE_ENV=development, throws ---
process.env.NODE_ENV = "development";
try {
  assertNoForbiddenParams({ model: "gpt-5", temperature: 0.7 });
  assert.fail("assertNoForbiddenParams must throw in dev when temperature present");
} catch (e: any) {
  assert.ok(
    /forbidden|temperature/.test((e?.message || "").toLowerCase()),
    "expected forbidden-param error message"
  );
}
restoreEnv();

// --- assertNoForbiddenParams: no throw when clean ---
process.env.NODE_ENV = "development";
assert.doesNotThrow(() => assertNoForbiddenParams({ model: "gpt-5", max_completion_tokens: 100 }));
restoreEnv();

console.log("openai-params.test.ts passed");
