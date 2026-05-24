import assert from "node:assert";
import {
  maskEmail,
  maskUserRef,
  parseBoundedIntParam,
  parseDaysParam,
  parseHoursParam,
  severityForThreshold,
} from "@/lib/admin/mobile-command-center";

assert.strictEqual(parseDaysParam(null, 7), 7);
assert.strictEqual(parseDaysParam("0", 7), 1);
assert.strictEqual(parseDaysParam("999", 7), 90);
assert.strictEqual(parseDaysParam("14", 7), 14);

assert.strictEqual(parseHoursParam("0", 24), 1);
assert.strictEqual(parseHoursParam("500", 24), 168);
assert.strictEqual(parseBoundedIntParam("abc", 5, 1, 10), 5);

assert.strictEqual(maskUserRef(""), "(unknown)");
assert.strictEqual(maskUserRef("(guest)"), "(guest)");
assert.strictEqual(maskUserRef("12345678-1234-1234-1234-123456789abc"), "12345678...9abc");
assert.strictEqual(maskEmail("davy@example.com"), "d***@example.com");

assert.strictEqual(severityForThreshold(0.02, 0.03, 0.1), "ok");
assert.strictEqual(severityForThreshold(0.03, 0.03, 0.1), "warn");
assert.strictEqual(severityForThreshold(0.1, 0.03, 0.1), "critical");

console.log("mobile-command-center.test.ts: all assertions passed.");
export {};
