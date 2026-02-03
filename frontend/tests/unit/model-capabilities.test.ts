/**
 * Unit tests: gpt-5.2-codex (and responses-only models) never reach chat-completions routes.
 * Ensures modelCapabilities and model-by-tier keep chat on chat-capable models only.
 */
import assert from "node:assert";
import {
  getPreferredApiSurface,
  isChatCompletionsModel,
  isResponsesOnlyModel,
} from "@/lib/ai/modelCapabilities";
import { getModelForTier } from "@/lib/ai/model-by-tier";

// --- Codex is responses-only ---
assert.strictEqual(getPreferredApiSurface("gpt-5.2-codex"), "responses", "gpt-5.2-codex must be responses");
assert.strictEqual(isChatCompletionsModel("gpt-5.2-codex"), false, "gpt-5.2-codex must not be chat-completions");
assert.strictEqual(isResponsesOnlyModel("gpt-5.2-codex"), true, "gpt-5.2-codex must be responses-only");

// --- Chat models are chat-completions ---
assert.strictEqual(isChatCompletionsModel("gpt-4o"), true, "gpt-4o must be chat-completions");
assert.strictEqual(isChatCompletionsModel("gpt-4o-mini"), true, "gpt-4o-mini must be chat-completions");
assert.strictEqual(isChatCompletionsModel("gpt-5.2-chat-latest"), true, "gpt-5.2-chat-latest must be chat-completions");

// --- Chat tier (Pro) must resolve to a chat-capable model ---
const chatPro = getModelForTier({
  isGuest: false,
  userId: "user-1",
  isPro: true,
  useCase: "chat",
});
assert.strictEqual(
  isChatCompletionsModel(chatPro.model),
  true,
  `Pro chat model must be chat-capable; got: ${chatPro.model}`
);

const chatProUnset = getModelForTier({
  isGuest: false,
  userId: "user-1",
  isPro: true,
});
assert.strictEqual(
  isChatCompletionsModel(chatProUnset.model),
  true,
  `Pro (useCase unset) model must be chat-capable; got: ${chatProUnset.model}`
);

// --- Fallback is chat-capable ---
assert.strictEqual(
  isChatCompletionsModel(chatPro.fallbackModel),
  true,
  `Pro fallback must be chat-capable; got: ${chatPro.fallbackModel}`
);

console.log("model-capabilities.test.ts: all assertions passed");
