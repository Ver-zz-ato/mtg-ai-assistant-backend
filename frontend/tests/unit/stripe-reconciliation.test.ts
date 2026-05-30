import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type Stripe from 'stripe';
import {
  derivePlanFromStripeSubscription,
  isStripeEntitlementStatus,
  needsStripeProfileRepair,
} from '@/lib/stripe/reconciliation';

function makeSubscription(interval: 'month' | 'year', productId?: string) {
  return {
    items: {
      data: [
        {
          price: {
            product: productId ?? null,
            recurring: { interval },
          },
        },
      ],
    },
  } as unknown as Pick<Stripe.Subscription, 'items'>;
}

describe('stripe reconciliation helpers', () => {
  it('recognizes entitlement-granting statuses', () => {
    assert.equal(isStripeEntitlementStatus('active'), true);
    assert.equal(isStripeEntitlementStatus('trialing'), true);
    assert.equal(isStripeEntitlementStatus('past_due'), false);
    assert.equal(isStripeEntitlementStatus('unpaid'), false);
    assert.equal(isStripeEntitlementStatus('canceled'), false);
  });

  it('derives monthly/yearly plan from subscription interval fallback', () => {
    assert.equal(derivePlanFromStripeSubscription(makeSubscription('month')), 'monthly');
    assert.equal(derivePlanFromStripeSubscription(makeSubscription('year')), 'yearly');
  });

  it('detects when a Stripe-backed profile needs repair', () => {
    assert.equal(
      needsStripeProfileRepair(
        {
          id: 'user_1',
          is_pro: true,
          pro_plan: 'monthly',
          stripe_customer_id: 'cus_123',
          stripe_subscription_id: 'sub_123',
        },
        {
          customerId: 'cus_123',
          subscriptionId: 'sub_123',
          plan: 'monthly',
        }
      ),
      false
    );

    assert.equal(
      needsStripeProfileRepair(
        {
          id: 'user_1',
          is_pro: false,
          pro_plan: null,
          stripe_customer_id: null,
          stripe_subscription_id: null,
        },
        {
          customerId: 'cus_123',
          subscriptionId: 'sub_123',
          plan: 'monthly',
        }
      ),
      true
    );
  });
});
