/**
 * Unit tests: explicit Stripe Price IDs for new checkout sessions.
 * Run: npx tsx tests/unit/billing-plan-prices.test.ts
 */
import assert from 'node:assert/strict';
import { getPriceIdForPlan, PLAN_TO_PRICE } from '@/lib/billing';

assert.equal(PLAN_TO_PRICE.monthly, 'price_1TjNHQLeE3sVc9QprG2iB3R2');
assert.equal(PLAN_TO_PRICE.yearly, 'price_1TjNIaLeE3sVc9Qp5I6vNMua');
assert.equal(getPriceIdForPlan('monthly'), PLAN_TO_PRICE.monthly);
assert.equal(getPriceIdForPlan('yearly'), PLAN_TO_PRICE.yearly);

console.log('billing-plan-prices.test.ts: all assertions passed.');
export {};
