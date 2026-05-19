/**
 * Unit tests: ai_usage route is always populated.
 * Verifies getRouteForInsert and callLLM→recordAiUsage route flow.
 * Run: npx tsx tests/unit/ai-usage-route.test.ts
 */
import assert from "node:assert";
import { getRouteForInsert } from "@/lib/ai/log-usage";
import { isAppAiUsageRow } from "@/lib/ai/manatap-client-origin";

// getRouteForInsert: never returns null/empty
assert.strictEqual(getRouteForInsert({ route: "chat_stream" }), "chat_stream");
assert.strictEqual(getRouteForInsert({ route: "deck_analyze" }), "deck_analyze");
assert.strictEqual(getRouteForInsert({ route: "swap_suggestions" }), "swap_suggestions");
assert.strictEqual(getRouteForInsert({ route: "  chat  " }), "chat");
assert.strictEqual(getRouteForInsert({ route: "" }), "unknown");
assert.strictEqual(getRouteForInsert({ route: null }), "unknown");
assert.strictEqual(getRouteForInsert({}), "unknown");

// callLLM passes config.feature as route — verify feature values used by routes
const ROUTES_FROM_CALLLM = [
  "chat",
  "chat_stream",
  "deck_analyze",
  "deck_analyze_slot_planning",
  "deck_analyze_slot_candidates",
  "deck_compare",
  "deck_compare_mobile",
  "deck_roast_mobile",
  "deck_scan",
  "swap_suggestions",
  "swap_why",
  "suggestion_why",
  "reprint_risk",
  "debug_ping",
];
for (const r of ROUTES_FROM_CALLLM) {
  assert.strictEqual(getRouteForInsert({ route: r }), r);
}

assert.strictEqual(
  isAppAiUsageRow({ source: "manatap_app", source_page: null, route: "chat_stream" }),
  true
);
assert.strictEqual(
  isAppAiUsageRow({ source: null, source_page: "app_home_chat", route: "chat_stream" }),
  true
);
assert.strictEqual(
  isAppAiUsageRow({ source: null, source_page: null, route: "deck_analyze_mobile_explain" }),
  true
);
assert.strictEqual(
  isAppAiUsageRow({ source: null, source_page: null, route: "deck_roast_mobile" }),
  true
);
assert.strictEqual(
  isAppAiUsageRow({ source: null, source_page: "/ · Chat.tsx", route: "chat_stream" }),
  false
);

console.log("ai-usage-route.test.ts: all assertions passed.");
export {};
