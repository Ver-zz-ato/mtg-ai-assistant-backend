import assert from "node:assert";
import { normalizePosthogQueryHost } from "@/lib/server/posthog-hogql";

assert.strictEqual(normalizePosthogQueryHost(undefined), "https://eu.posthog.com");
assert.strictEqual(normalizePosthogQueryHost("https://eu.i.posthog.com"), "https://eu.posthog.com");
assert.strictEqual(normalizePosthogQueryHost("https://us.i.posthog.com"), "https://us.posthog.com");
assert.strictEqual(normalizePosthogQueryHost("https://app.posthog.com"), "https://us.posthog.com");
assert.strictEqual(normalizePosthogQueryHost("https://eu.posthog.com/"), "https://eu.posthog.com");

console.log("posthog-hogql.test.ts: all assertions passed.");
export {};
