import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { getModelForTier } from '@/lib/ai/model-by-tier';
import { checkProStatus, getProStatusDetails } from '@/lib/server-pro-check';

export const dynamic = 'force-dynamic'; // Disable caching

/**
 * Pro status API — uses checkProStatus so website sees Pro from Supabase, metadata, or RevenueCat.
 * Aligns with backend gating (same source of truth).
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ ok: false, isPro: false, error: 'Unauthorized' }, { status: 401 });
    }

    const details = await getProStatusDetails(user.id);
    const isPro = details.isPro;

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();
    const hasBillingAccount = !!(profile as { stripe_customer_id?: string } | null)?.stripe_customer_id;

    const tierRes = getModelForTier({ isGuest: false, userId: user.id, isPro });

    return NextResponse.json({
      ok: true,
      isPro,
      hasBillingAccount,
      fromProfile: details.fromProfile,
      fromMetadata: details.fromMetadata,
      fromRevenueCat: details.fromRevenueCat,
      profileError: details.profileError ?? null,
      modelTier: tierRes.tier,
      modelLabel: tierRes.tierLabel,
      ...(tierRes.upgradeMessage != null && { upgradeMessage: tierRes.upgradeMessage }),
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error: any) {
    console.error('Pro status API error:', error);
    return NextResponse.json(
      { ok: false, isPro: false, error: error?.message || 'Failed to get Pro status' },
      { 
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}
