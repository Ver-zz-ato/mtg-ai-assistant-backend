/**
 * Unit tests: Stripe billing duplicate-subscription guard logic.
 * Run: npx tsx tests/unit/stripe-billing-state.test.ts
 */
import assert from "node:assert";
import {
  chooseBestStripeCustomerCandidate,
  isBlockingStripeSubscriptionStatus,
} from "@/lib/stripe/billing-state";

assert.strictEqual(isBlockingStripeSubscriptionStatus("active"), true);
assert.strictEqual(isBlockingStripeSubscriptionStatus("trialing"), true);
assert.strictEqual(isBlockingStripeSubscriptionStatus("past_due"), true);
assert.strictEqual(isBlockingStripeSubscriptionStatus("unpaid"), true);

assert.strictEqual(isBlockingStripeSubscriptionStatus("canceled"), false);
assert.strictEqual(isBlockingStripeSubscriptionStatus("incomplete"), false);
assert.strictEqual(isBlockingStripeSubscriptionStatus("incomplete_expired"), false);
assert.strictEqual(isBlockingStripeSubscriptionStatus("paused"), false);

const customerWithProfileSub = chooseBestStripeCustomerCandidate(
  [
    { id: "cus_old", created: 10 },
    { id: "cus_newer_empty", created: 20 },
  ],
  new Map([
    ["cus_old", [{ id: "sub_current", status: "active" }]],
    ["cus_newer_empty", []],
  ]),
  "sub_current"
);
assert.strictEqual(customerWithProfileSub?.id, "cus_old");

const customerWithBlockingSub = chooseBestStripeCustomerCandidate(
  [
    { id: "cus_canceled_newer", created: 30 },
    { id: "cus_past_due", created: 20 },
  ],
  new Map([
    ["cus_canceled_newer", [{ id: "sub_old", status: "canceled" }]],
    ["cus_past_due", [{ id: "sub_retrying", status: "past_due" }]],
  ])
);
assert.strictEqual(customerWithBlockingSub?.id, "cus_past_due");

const newestCustomerWithoutSubs = chooseBestStripeCustomerCandidate(
  [
    { id: "cus_old_empty", created: 10 },
    { id: "cus_new_empty", created: 20 },
  ],
  new Map([
    ["cus_old_empty", []],
    ["cus_new_empty", []],
  ])
);
assert.strictEqual(newestCustomerWithoutSubs?.id, "cus_new_empty");

console.log("stripe-billing-state.test.ts: all assertions passed.");
export {};
