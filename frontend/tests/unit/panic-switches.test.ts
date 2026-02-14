/**
 * Panic switch verification (dry-run, no OpenAI, no Supabase).
 * Verifies llm_force_full_routes and llm_min_tokens_per_route logic.
 * Run: npx tsx tests/unit/panic-switches.test.ts
 */
import assert from "node:assert";
import { getDynamicTokenCeiling } from "@/lib/ai/chat-generation-config";
import type { RuntimeAIConfig } from "@/lib/ai/runtime-config";

/** Same logic as chat/stream routes: when route is in llm_force_full_routes, bypass Layer0 → FULL_LLM */
function wouldBypassLayer0(route: string, config: RuntimeAIConfig): boolean {
  const routes = config.llm_force_full_routes ?? [];
  return Array.isArray(routes) && routes.includes(route);
}

// --- llm_force_full_routes ---
const configWithForceFull: RuntimeAIConfig = {
  flags: {},
  llm_budget: {},
  llm_models: null,
  llm_thresholds: null,
  llm_force_full_routes: ["chat_stream", "deck_analyze", "swap_suggestions"],
};

assert.strictEqual(wouldBypassLayer0("chat_stream", configWithForceFull), true);
assert.strictEqual(wouldBypassLayer0("deck_analyze", configWithForceFull), true);
assert.strictEqual(wouldBypassLayer0("chat", configWithForceFull), false);

const configEmpty: RuntimeAIConfig = {
  flags: {},
  llm_budget: {},
  llm_models: null,
  llm_thresholds: null,
};
assert.strictEqual(wouldBypassLayer0("chat_stream", configEmpty), false);

// --- llm_min_tokens_per_route (via getDynamicTokenCeiling minTokenFloor) ---
const withFloor = getDynamicTokenCeiling(
  { isComplex: false, deckCardCount: 0, minTokenFloor: 256 },
  true
);
assert.ok(withFloor >= 256, `minTokenFloor=256 should yield >= 256, got ${withFloor}`);

// Without floor, non-stream simple = 192; with floor 256 it becomes 256
const withoutFloor = getDynamicTokenCeiling(
  { isComplex: false, deckCardCount: 0 },
  false
);
assert.strictEqual(withoutFloor, 192, "non-stream simple without floor = 192");

// Non-stream with floor
const nonStreamWithFloor = getDynamicTokenCeiling(
  { isComplex: false, deckCardCount: 0, minTokenFloor: 256 },
  false
);
assert.ok(nonStreamWithFloor >= 256, `non-stream minTokenFloor=256 should yield >= 256, got ${nonStreamWithFloor}`);

console.log("panic-switches.test.ts: all assertions passed.");
export {};
