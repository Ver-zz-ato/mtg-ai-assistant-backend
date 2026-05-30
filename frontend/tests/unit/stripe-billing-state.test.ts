/**
 * Unit tests: Stripe billing duplicate-subscription guard logic.
 * Run: npx tsx tests/unit/stripe-billing-state.test.ts
 */
import assert from "node:assert";
import { isBlockingStripeSubscriptionStatus } from "@/lib/stripe/billing-state";

assert.strictEqual(isBlockingStripeSubscriptionStatus("active"), true);
assert.strictEqual(isBlockingStripeSubscriptionStatus("trialing"), true);
assert.strictEqual(isBlockingStripeSubscriptionStatus("past_due"), true);
assert.strictEqual(isBlockingStripeSubscriptionStatus("unpaid"), true);

assert.strictEqual(isBlockingStripeSubscriptionStatus("canceled"), false);
assert.strictEqual(isBlockingStripeSubscriptionStatus("incomplete"), false);
assert.strictEqual(isBlockingStripeSubscriptionStatus("incomplete_expired"), false);
assert.strictEqual(isBlockingStripeSubscriptionStatus("paused"), false);

console.log("stripe-billing-state.test.ts: all assertions passed.");
export {};
