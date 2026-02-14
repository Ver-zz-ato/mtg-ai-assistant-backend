/**
 * Golden unit tests for costUSD pricing math.
 * Catches 1K/1M unit flips and ensures correct cost calculation.
 * Run: npx tsx tests/unit/pricing.test.ts
 */
import assert from "node:assert";
import { costUSD, PRICING_VERSION } from "@/lib/ai/pricing";

// gpt-4o: $2.50/1M in = 0.0025/1K, $10/1M out = 0.01/1K
// (100,100): 0.1*0.0025 + 0.1*0.01 = 0.00125
assert.strictEqual(costUSD("gpt-4o", 100, 100), 0.00125);
assert.strictEqual(costUSD("gpt-4o", 1000, 0), 0.0025);
assert.strictEqual(costUSD("gpt-4o", 0, 1000), 0.01);
assert.ok(Math.abs(costUSD("gpt-4o", 1234, 5678) - 0.059865) < 1e-6);

// gpt-4o-mini: $0.15/1M in = 0.00015/1K, $0.60/1M out = 0.0006/1K
// (100,100): 0.000015 + 0.00006 = 0.000075
assert.strictEqual(costUSD("gpt-4o-mini", 100, 100), 0.000075);
assert.strictEqual(costUSD("gpt-4o-mini", 1000, 0), 0.00015);
assert.strictEqual(costUSD("gpt-4o-mini", 0, 1000), 0.0006);
assert.ok(Math.abs(costUSD("gpt-4o-mini", 1234, 5678) - 0.0035919) < 1e-6);

// Anti-regression: (1000,1000) gpt-4o-mini must NOT be 100× too high (catches 1K/1M flip)
// Correct: 0.00015 + 0.0006 = 0.00075. If wrong: would be ~0.075
const mini1k1k = costUSD("gpt-4o-mini", 1000, 1000);
assert.ok(mini1k1k < 0.01, `gpt-4o-mini (1000,1000) should be ~0.00075, got ${mini1k1k} (possible 1K/1M unit bug)`);
assert.ok(mini1k1k > 0.0005 && mini1k1k < 0.001, `gpt-4o-mini (1000,1000) expected ~0.00075, got ${mini1k1k}`);

// Unknown model uses default rates
const unknown = costUSD("unknown-model-xyz", 1000, 1000);
assert.ok(unknown > 0 && unknown < 1, `unknown model should return reasonable cost, got ${unknown}`);

// PRICING_VERSION exists
assert.ok(typeof PRICING_VERSION === "string" && PRICING_VERSION.length > 0);

// gpt-5 / gpt-5.2-codex (model matching uses includes)
assert.strictEqual(costUSD("gpt-5", 1000, 0), 0.0025);
assert.strictEqual(costUSD("gpt-5.2-codex", 1000, 0), 0.0025);

console.log("pricing.test.ts: all assertions passed.");
export {};
