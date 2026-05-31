import type { SupabaseClient, User } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';

type ProfileBillingRow = {
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
} | null;

type StripeCustomerCandidate = {
  id: string;
  created?: number | null;
  deleted?: boolean | null | void;
};

type StripeSubscriptionCandidate = Pick<Stripe.Subscription, 'id' | 'status'>;

const DUPLICATE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  'active',
  'trialing',
  'past_due',
  'unpaid',
]);

export function isBlockingStripeSubscriptionStatus(status: Stripe.Subscription.Status): boolean {
  return DUPLICATE_SUBSCRIPTION_STATUSES.has(status);
}

function escapeStripeSearchValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function isLiveStripeCustomer(
  customer: Stripe.Customer | Stripe.DeletedCustomer
): customer is Stripe.Customer {
  return !customer.deleted;
}

async function persistStripeCustomerId(opts: {
  supabase: SupabaseClient;
  userId: string;
  customerId: string;
  source: 'metadata' | 'email' | 'created';
}) {
  const { error } = await opts.supabase
    .from('profiles')
    .update({ stripe_customer_id: opts.customerId })
    .eq('id', opts.userId);

  if (error) {
    console.error('Failed to persist recovered Stripe customer ID', {
      userId: opts.userId,
      customerId: opts.customerId,
      source: opts.source,
      error,
    });
    throw new Error(`Failed to persist Stripe customer ID from ${opts.source}`);
  }
}

async function getCustomerById(customerId: string | null | undefined): Promise<Stripe.Customer | null> {
  if (!customerId) return null;
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return null;
    return customer;
  } catch {
    return null;
  }
}

function customerCandidateRank(
  customer: StripeCustomerCandidate,
  subscriptions: StripeSubscriptionCandidate[],
  profileSubscriptionId?: string | null
): number {
  const ownsProfileSubscription = !!profileSubscriptionId &&
    subscriptions.some((subscription) => subscription.id === profileSubscriptionId);
  const ownsBlockingProfileSubscription = !!profileSubscriptionId &&
    subscriptions.some((subscription) =>
      subscription.id === profileSubscriptionId &&
      isBlockingStripeSubscriptionStatus(subscription.status)
    );
  const ownsBlockingSubscription = subscriptions.some((subscription) =>
    isBlockingStripeSubscriptionStatus(subscription.status)
  );

  if (ownsBlockingProfileSubscription) return 400;
  if (ownsBlockingSubscription) return 300;
  if (ownsProfileSubscription) return 200;
  if (subscriptions.length === 0) return 100;
  return 50;
}

export function chooseBestStripeCustomerCandidate<T extends StripeCustomerCandidate>(
  candidates: T[],
  subscriptionsByCustomer: Map<string, StripeSubscriptionCandidate[]>,
  profileSubscriptionId?: string | null
): T | null {
  const liveCandidates = candidates.filter((candidate) => !candidate.deleted);
  if (liveCandidates.length === 0) return null;

  return [...liveCandidates].sort((a, b) => {
    const rankDelta =
      customerCandidateRank(b, subscriptionsByCustomer.get(b.id) || [], profileSubscriptionId) -
      customerCandidateRank(a, subscriptionsByCustomer.get(a.id) || [], profileSubscriptionId);
    if (rankDelta !== 0) return rankDelta;
    return (b.created || 0) - (a.created || 0);
  })[0] || null;
}

async function getSubscriptionsByCustomer(
  candidates: Stripe.Customer[]
): Promise<Map<string, StripeSubscriptionCandidate[]>> {
  const entries = await Promise.all(
    candidates.map(async (customer) => {
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: 'all',
        limit: 10,
      });
      return [
        customer.id,
        subscriptions.data.map((subscription) => ({
          id: subscription.id,
          status: subscription.status,
        })),
      ] as const;
    })
  );

  return new Map(entries);
}

async function findCustomerByAppUserId(
  userId: string,
  profileSubscriptionId?: string | null
): Promise<Stripe.Customer | null> {
  try {
    const results = await stripe.customers.search({
      query: `metadata['app_user_id']:'${escapeStripeSearchValue(userId)}'`,
      limit: 100,
    });
    const candidates = results.data.filter(isLiveStripeCustomer);
    if (candidates.length <= 1) return candidates[0] ?? null;

    const subscriptionsByCustomer = await getSubscriptionsByCustomer(candidates);
    return chooseBestStripeCustomerCandidate<Stripe.Customer>(
      candidates,
      subscriptionsByCustomer,
      profileSubscriptionId
    );
  } catch {
    return null;
  }
}

async function findCustomerByEmail(
  email: string | null | undefined,
  profileSubscriptionId?: string | null
): Promise<Stripe.Customer | null> {
  if (!email) return null;
  try {
    const results = await stripe.customers.list({ email, limit: 10 });
    const candidates = results.data.filter(isLiveStripeCustomer);
    if (candidates.length <= 1) return candidates[0] ?? null;

    const subscriptionsByCustomer = await getSubscriptionsByCustomer(candidates);
    return chooseBestStripeCustomerCandidate<Stripe.Customer>(
      candidates,
      subscriptionsByCustomer,
      profileSubscriptionId
    );
  } catch {
    return null;
  }
}

export async function resolveStripeCustomerForUser(opts: {
  supabase: SupabaseClient;
  user: Pick<User, 'id' | 'email'>;
  profile: ProfileBillingRow;
}): Promise<
  | { customerId: string; recoveredFrom: 'profile' | 'metadata' | 'email' }
  | { customerId: null; recoveredFrom: 'none' }
> {
  const { supabase, user, profile } = opts;

  const profileCustomer = await getCustomerById(profile?.stripe_customer_id);
  if (profileCustomer) {
    return { customerId: profileCustomer.id, recoveredFrom: 'profile' };
  }

  const metadataCustomer = await findCustomerByAppUserId(user.id, profile?.stripe_subscription_id);
  if (metadataCustomer) {
    await persistStripeCustomerId({
      supabase,
      userId: user.id,
      customerId: metadataCustomer.id,
      source: 'metadata',
    });
    return { customerId: metadataCustomer.id, recoveredFrom: 'metadata' };
  }

  const emailCustomer = await findCustomerByEmail(user.email, profile?.stripe_subscription_id);
  if (emailCustomer) {
    await persistStripeCustomerId({
      supabase,
      userId: user.id,
      customerId: emailCustomer.id,
      source: 'email',
    });
    return { customerId: emailCustomer.id, recoveredFrom: 'email' };
  }

  return { customerId: null, recoveredFrom: 'none' };
}

export async function ensureStripeCustomerForUser(opts: {
  supabase: SupabaseClient;
  user: Pick<User, 'id' | 'email'>;
  profile: ProfileBillingRow;
}): Promise<{ customerId: string; created: boolean; recoveredFrom: 'profile' | 'metadata' | 'email' | 'created' }> {
  const resolved = await resolveStripeCustomerForUser(opts);
  if (resolved.customerId) {
    return {
      customerId: resolved.customerId,
      created: false,
      recoveredFrom: resolved.recoveredFrom,
    };
  }

  const customer = await stripe.customers.create({
    email: opts.user.email,
    metadata: {
      app_user_id: opts.user.id,
    },
  });

  await persistStripeCustomerId({
    supabase: opts.supabase,
    userId: opts.user.id,
    customerId: customer.id,
    source: 'created',
  });

  return {
    customerId: customer.id,
    created: true,
    recoveredFrom: 'created',
  };
}

export async function findExistingBlockingSubscription(opts: {
  customerId: string | null | undefined;
  profileSubscriptionId?: string | null | undefined;
}): Promise<Stripe.Subscription | null> {
  const { customerId, profileSubscriptionId } = opts;

  if (profileSubscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(profileSubscriptionId);
      if (isBlockingStripeSubscriptionStatus(subscription.status)) {
        return subscription;
      }
    } catch {
      // Fall through to customer-wide lookup.
    }
  }

  if (!customerId) return null;

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 10,
  });

  return (
    subscriptions.data.find((subscription) =>
      isBlockingStripeSubscriptionStatus(subscription.status)
    ) ?? null
  );
}
