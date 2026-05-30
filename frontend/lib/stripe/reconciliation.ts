import Stripe from 'stripe';
import { PRODUCT_TO_PLAN } from '@/lib/billing';

export const STRIPE_RECONCILIATION_STATUSES = ['active', 'trialing'] as const;

export type StripeEntitlementProfile = {
  id: string;
  is_pro?: boolean | null;
  pro_plan?: string | null;
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string | null;
};

export function isStripeEntitlementStatus(status: Stripe.Subscription.Status): boolean {
  return STRIPE_RECONCILIATION_STATUSES.includes(
    status as (typeof STRIPE_RECONCILIATION_STATUSES)[number]
  );
}

export function derivePlanFromStripeSubscription(
  subscription: Pick<Stripe.Subscription, 'items'>
): 'monthly' | 'yearly' | null {
  const item = subscription.items.data[0];
  const productId = typeof item?.price?.product === 'string' ? item.price.product : null;

  if (productId && PRODUCT_TO_PLAN[productId]) {
    return PRODUCT_TO_PLAN[productId] as 'monthly' | 'yearly';
  }

  const interval = item?.price?.recurring?.interval;
  if (interval === 'month') return 'monthly';
  if (interval === 'year') return 'yearly';
  return null;
}

export function needsStripeProfileRepair(
  profile: StripeEntitlementProfile | null,
  expected: {
    customerId: string;
    subscriptionId: string;
    plan: 'monthly' | 'yearly' | null;
  }
): boolean {
  if (!profile) return true;
  if (profile.is_pro !== true) return true;
  if (profile.stripe_customer_id !== expected.customerId) return true;
  if (profile.stripe_subscription_id !== expected.subscriptionId) return true;
  if ((profile.pro_plan || null) !== expected.plan) return true;
  return false;
}
