import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/** Pro entitlement identifier in RevenueCat (must match mobile app). */
const REVENUECAT_ENTITLEMENT_ID = 'pro';

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
    const fromRevenueCat = await checkRevenueCatPro(userId);
    if (fromRevenueCat) return true;

    return false;
  } catch (error) {
    console.error('Error checking Pro status:', error);
    return false;
  }
}

/**
 * Check RevenueCat for active "pro" entitlement.
 * Requires REVENUECAT_SECRET_API_KEY (secret key from RevenueCat dashboard).
 */
async function checkRevenueCatPro(appUserId: string): Promise<boolean> {
  const secretKey = process.env.REVENUECAT_SECRET_API_KEY || process.env.REVENUECAT_SECRET_KEY;
  if (!secretKey?.trim()) return false;

  try {
    const encodedId = encodeURIComponent(appUserId);
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodedId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!res.ok) return false;

    const json = (await res.json()) as {
      subscriber?: {
        entitlements?: Record<
          string,
          { expires_date?: string | null; product_identifier?: string }
        >;
      };
    };
    const ent = json.subscriber?.entitlements?.[REVENUECAT_ENTITLEMENT_ID];
    if (!ent) return false;
    const expires = ent.expires_date;
    if (expires == null) return true; // lifetime
    return new Date(expires) > new Date();
  } catch {
    return false;
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

    const fromRevenueCat = await checkRevenueCatPro(userId);

    return {
      isPro: isProFromProfile || isProFromMetadata || fromRevenueCat,
      fromProfile: isProFromProfile,
      fromMetadata: isProFromMetadata,
      fromRevenueCat,
      profileError,
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
