/**
 * Scanner analytics contract tests.
 * Run: npx tsx tests/unit/scanner-analytics.test.ts
 */
import assert from "node:assert";
import { SCAN_EVENTS } from "@/lib/scanner/analytics-events";

const requiredEvents = [
  "scan_card_screen_viewed",
  "scan_card_capture_completed",
  "scan_card_ocr_completed",
  "scan_card_match_completed",
  "scan_card_match_failed",
  "scan_card_result_selected",
  "scan_card_add_initiated",
  "scan_card_add_completed",
  "scan_card_direct_search_used",
  "scan_ai_fallback_started",
  "scan_ai_fallback_success",
  "scan_ai_fallback_failed",
  "scan_ai_assist_blocked",
  "scan_ai_improve_clicked",
  "scan_ai_improve_blocked",
  "scan_ai_improve_success",
];

for (const event of requiredEvents) {
  assert.ok(SCAN_EVENTS.includes(event as (typeof SCAN_EVENTS)[number]), `missing scanner event: ${event}`);
}

assert.equal(new Set(SCAN_EVENTS).size, SCAN_EVENTS.length, "scanner event list must not contain duplicates");

console.log("scanner-analytics.test.ts: all assertions passed.");
export {};
