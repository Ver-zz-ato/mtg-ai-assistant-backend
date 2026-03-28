import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getAdmin } from '@/app/api/_lib/supa';

/**
 * Pro entitlement identifiers in RevenueCat REST `subscriber.entitlements` keys.
 * Must stay aligned with mobile `ENTITLEMENT_IDS` in Manatap-APP `src/lib/purchases.ts`.
 * (Dashboard may use `Manatap.ai Pro` only — backend previously checked `pro` alone and missed active subs.)
 */
const REVENUECAT_PRO_ENTITLEMENT_IDS = ['pro', 'Manatap.ai Pro'] as const;

/**
 * Standardized Pro status check for server-side code.
 * Pro = true if EITHER:
 * - Supabase: profiles.is_pro or user_metadata (Stripe/web subscribers), OR
 * - RevenueCat: active "pro" entitlement (mobile/App Store/Play Store subscribers).
 * Uses service role for profile lookup when request has no cookie (e.g. mobile Bearer).
 */
export async function checkProStatus(userId: string): Promise<boolean> {
  try {
    // 1) Supabase: profile + optional session metadata
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user && user.id === userId) {
      const isProFromMetadata =
        user.user_metadata?.is_pro === true ||
        user.user_metadata?.pro === true;
      if (isProFromMetadata) return true;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_pro')
      .eq('id', userId)
      .single();

    if (profile?.is_pro === true) return true;

    // When there is no cookie session (e.g. mobile Bearer), cookie client may not see profile due to RLS. Try service role.
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (url && serviceKey) {
      const admin = createSupabaseClient(url, serviceKey, { auth: { persistSession: false } });
      const { data: adminProfile } = await admin
        .from('profiles')
        .select('is_pro')
        .eq('id', userId)
        .single();
      if (adminProfile?.is_pro === true) return true;
    }

    // 2) RevenueCat: mobile subscribers (app_user_id = Supabase user id when app calls Purchases.logIn(userId))
    const { fromRevenueCat } = await getRevenueCatSubscriberState(userId);
    if (fromRevenueCat) return true;

    return false;
  } catch (error) {
    console.error('Error checking Pro status:', error);
    return false;
  }
}

type RevenueCatSubscriberJson = {
  subscriber?: {
    entitlements?: Record<string, { expires_date?: string | null; product_identifier?: string } | undefined>;
  };
};

function parseProFromRevenueCatSubscriberJson(json: RevenueCatSubscriberJson | null | undefined): {
  fromRevenueCat: boolean;
  entitlementKeys: string[];
  matchedEntitlementId: string | null;
} {
  const entitlements = json?.subscriber?.entitlements;
  const entitlementKeys =
    entitlements && typeof entitlements === 'object' ? Object.keys(entitlements) : [];

  for (const id of REVENUECAT_PRO_ENTITLEMENT_IDS) {
    const ent = entitlements?.[id];
    if (!ent) continue;
    const expires = ent.expires_date;
    if (expires == null) {
      return { fromRevenueCat: true, entitlementKeys, matchedEntitlementId: id };
    }
    if (new Date(expires) > new Date()) {
      return { fromRevenueCat: true, entitlementKeys, matchedEntitlementId: id };
    }
  }
  return { fromRevenueCat: false, entitlementKeys, matchedEntitlementId: null };
}

export type RevenueCatSubscriberDebug = {
  secretConfigured: boolean;
  requestSent: boolean;
  httpStatus: number | null;
  queriedAppUserId: string;
  subscriberPresent: boolean;
  entitlementKeys: string[];
  matchedEntitlementId: string | null;
  fromRevenueCat: boolean;
  /** Non-secret: HTTP status, missing key, or fetch/parse error message */
  error?: string;
};

/**
 * Fetch RevenueCat subscriber and resolve Pro from REST `subscriber.entitlements`.
 * Requires REVENUECAT_SECRET_API_KEY (secret key from RevenueCat dashboard — same project as mobile public SDK).
 */
async function getRevenueCatSubscriberState(appUserId: string): Promise<{
  fromRevenueCat: boolean;
  debug: RevenueCatSubscriberDebug;
}> {
  const secretKey = process.env.REVENUECAT_SECRET_API_KEY || process.env.REVENUECAT_SECRET_KEY;
  if (!secretKey?.trim()) {
    return {
      fromRevenueCat: false,
      debug: {
        secretConfigured: false,
        requestSent: false,
        httpStatus: null,
        queriedAppUserId: appUserId,
        subscriberPresent: false,
        entitlementKeys: [],
        matchedEntitlementId: null,
        fromRevenueCat: false,
        error: 'REVENUECAT_SECRET_API_KEY / REVENUECAT_SECRET_KEY not set',
      },
    };
  }

  const encodedId = encodeURIComponent(appUserId);
  const url = `https://api.revenuecat.com/v1/subscribers/${encodedId}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secretKey}` },
    });

    let json: RevenueCatSubscriberJson | null = null;
    try {
      json = (await res.json()) as RevenueCatSubscriberJson;
    } catch {
      json = null;
    }

    const subscriberPresent = json?.subscriber != null;
    const parsed = parseProFromRevenueCatSubscriberJson(json ?? undefined);

    const debug: RevenueCatSubscriberDebug = {
      secretConfigured: true,
      requestSent: true,
      httpStatus: res.status,
      queriedAppUserId: appUserId,
      subscriberPresent,
      entitlementKeys: parsed.entitlementKeys,
      matchedEntitlementId: parsed.matchedEntitlementId,
      fromRevenueCat: parsed.fromRevenueCat,
      error: !res.ok ? `HTTP ${res.status}` : undefined,
    };

    if (!res.ok) {
      return { fromRevenueCat: false, debug };
    }

    return { fromRevenueCat: parsed.fromRevenueCat, debug };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      fromRevenueCat: false,
      debug: {
        secretConfigured: true,
        requestSent: true,
        httpStatus: null,
        queriedAppUserId: appUserId,
        subscriberPresent: false,
        entitlementKeys: [],
        matchedEntitlementId: null,
        fromRevenueCat: false,
        error: message,
      },
    };
  }
}

/**
 * Get Pro status with detailed information (for debugging)
 */
export async function getProStatusDetails(userId: string): Promise<{
  isPro: boolean;
  fromProfile: boolean;
  fromMetadata: boolean;
  fromRevenueCat: boolean;
  profileError?: string;
}> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let isProFromProfile = false;
    let isProFromMetadata = false;
    let profileError: string | undefined;

    if (user && user.id === userId) {
      isProFromMetadata =
        user.user_metadata?.is_pro === true ||
        user.user_metadata?.pro === true;
    }

    const { data: profile, error: pe } = await supabase
      .from('profiles')
      .select('is_pro')
      .eq('id', userId)
      .single();
    isProFromProfile = profile?.is_pro === true;
    profileError = pe?.message;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
    if (!isProFromProfile && url && serviceKey) {
      const admin = createSupabaseClient(url, serviceKey, { auth: { persistSession: false } });
      const { data: adminProfile } = await admin.from('profiles').select('is_pro').eq('id', userId).single();
      if (adminProfile?.is_pro === true) isProFromProfile = true;
    }

    const { fromRevenueCat } = await getRevenueCatSubscriberState(userId);
    const isPro = isProFromProfile || isProFromMetadata || fromRevenueCat;

    if (process.env.NODE_ENV !== 'production' && process.env.DEBUG_ENTITLEMENTS === '1') {
      console.debug('[entitlements] getProStatusDetails', {
        userId: userId.slice(0, 8) + '…',
        isPro,
        fromProfile: isProFromProfile,
        fromMetadata: isProFromMetadata,
        fromRevenueCat,
      });
    }

    return {
      isPro,
      fromProfile: isProFromProfile,
      fromMetadata: isProFromMetadata,
      fromRevenueCat,
      profileError: profileError ?? undefined,
    };
  } catch (error: unknown) {
    return {
      isPro: false,
      fromProfile: false,
      fromMetadata: false,
      fromRevenueCat: false,
      profileError: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Admin-only: full entitlement debug for any user. Uses admin client. */
export async function getEntitlementDebugForAdmin(userId: string): Promise<{
  userId: string;
  profile: {
    is_pro: boolean;
    pro_until: string | null;
    pro_plan: string | null;
    has_stripe_customer: boolean;
    has_stripe_subscription: boolean;
    stripe_subscription_status?: 'active' | 'trialing' | 'past_due' | 'canceled' | 'none';
  };
  metadata: { is_pro: boolean; pro: boolean };
  fromProfile: boolean;
  fromMetadata: boolean;
  fromRevenueCat: boolean;
  finalIsPro: boolean;
  sources: string[];
  mismatchFlags: string[];
  revenueCatDebug: RevenueCatSubscriberDebug;
}> {
  const admin = getAdmin();
  if (!admin) {
    throw new Error('Admin client required');
  }

  const mismatchFlags: string[] = [];
  const sources: string[] = [];

  const { data: profileRow, error: profileError } = await admin
    .from('profiles')
    .select('is_pro, pro_until, pro_plan, stripe_customer_id, stripe_subscription_id')
    .eq('id', userId)
    .single();

  const profile = profileRow as {
    is_pro?: boolean;
    pro_until?: string | null;
    pro_plan?: string | null;
    stripe_customer_id?: string | null;
    stripe_subscription_id?: string | null;
  } | null;

  const hasStripeCustomer = !!(profile?.stripe_customer_id);
  const hasStripeSubscription = !!(profile?.stripe_subscription_id);
  let stripeStatus: 'active' | 'trialing' | 'past_due' | 'canceled' | 'none' = 'none';
  if (profile?.stripe_subscription_id && process.env.STRIPE_SECRET_KEY) {
    try {
      const { stripe } = await import('@/lib/stripe');
      const sub = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
      stripeStatus = sub.status as 'active' | 'trialing' | 'past_due' | 'canceled';
    } catch (e) {
      stripeStatus = 'none';
      if (process.env.NODE_ENV !== 'production' && process.env.DEBUG_ENTITLEMENTS === '1') {
        console.debug('[entitlements] Stripe retrieve failed (admin debug)', { userId: userId.slice(0, 8) + '…' });
      }
    }
  }

  const now = new Date();
  let isProFromProfile = profile?.is_pro === true;
  const proUntil = profile?.pro_until;
  if (proUntil && isProFromProfile) {
    const until = new Date(proUntil);
    if (Number.isFinite(until.getTime()) && until.getTime() < now.getTime()) {
      isProFromProfile = false;
      mismatchFlags.push('profile.is_pro=true but pro_until expired');
    }
  }

  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const metadata = (authUser?.user?.user_metadata || {}) as { is_pro?: boolean; pro?: boolean };
  const isProFromMetadata = metadata?.is_pro === true || metadata?.pro === true;

  const { fromRevenueCat, debug: revenueCatDebug } = await getRevenueCatSubscriberState(userId);

  console.log('[admin/entitlements/debug] RevenueCat', {
    userId: userId.slice(0, 8) + '…',
    secretConfigured: revenueCatDebug.secretConfigured,
    requestSent: revenueCatDebug.requestSent,
    httpStatus: revenueCatDebug.httpStatus,
    queriedAppUserId: revenueCatDebug.queriedAppUserId,
    subscriberPresent: revenueCatDebug.subscriberPresent,
    entitlementKeys: revenueCatDebug.entitlementKeys,
    matchedEntitlementId: revenueCatDebug.matchedEntitlementId,
    fromRevenueCat: revenueCatDebug.fromRevenueCat,
    error: revenueCatDebug.error,
  });

  const finalIsPro = isProFromProfile || isProFromMetadata || fromRevenueCat;
  if (isProFromProfile) sources.push('profile');
  if (isProFromMetadata) sources.push('metadata');
  if (fromRevenueCat) sources.push('revenuecat');

  if (profile?.is_pro === true && !finalIsPro) {
    mismatchFlags.push('profile.is_pro=true but final=false (expired pro_until?)');
  }
  if (isProFromProfile !== isProFromMetadata) {
    mismatchFlags.push('profile vs metadata mismatch');
  }
  const stripeSaysActive = stripeStatus === 'active' || stripeStatus === 'trialing';
  if (stripeSaysActive && !finalIsPro) {
    mismatchFlags.push('Stripe active but final isPro=false');
  }
  if (finalIsPro && !stripeSaysActive && !fromRevenueCat && !isProFromProfile && isProFromMetadata) {
    mismatchFlags.push('Pro from metadata only (possible stale)');
  }

  return {
    userId,
    profile: {
      is_pro: profile?.is_pro ?? false,
      pro_until: profile?.pro_until ?? null,
      pro_plan: profile?.pro_plan ?? null,
      has_stripe_customer: hasStripeCustomer,
      has_stripe_subscription: hasStripeSubscription,
      stripe_subscription_status: hasStripeSubscription ? stripeStatus : undefined,
    },
    metadata: {
      is_pro: isProFromMetadata,
      pro: metadata?.pro === true,
    },
    fromProfile: isProFromProfile,
    fromMetadata: isProFromMetadata,
    fromRevenueCat,
    finalIsPro,
    sources,
    mismatchFlags,
    revenueCatDebug,
  };
}
