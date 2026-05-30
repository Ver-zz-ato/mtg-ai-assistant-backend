import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { stripe } from '@/lib/stripe';
import { ensureStripeCustomerForUser } from '@/lib/stripe/billing-state';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    // CSRF protection: Validate Origin header
    const { validateOrigin } = await import('@/lib/api/csrf');
    if (!validateOrigin(req)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid origin. This request must come from the same site.' },
        { status: 403 }
      );
    }

    // Parse request body for custom return URL
    const body = await req.json().catch(() => ({}));
    const { returnUrl } = body;

    // Get authenticated user
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get user profile with Stripe customer ID
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('Failed to fetch user profile:', profileError);
      return NextResponse.json(
        { ok: false, error: 'User profile not found' },
        { status: 404 }
      );
    }

    const { customerId, created } = await ensureStripeCustomerForUser({
      supabase,
      user,
      profile,
    });

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || 'https://app.manatap.ai/pricing',
    });

    console.info('Billing portal session created', {
      sessionId: session.id,
      customerId,
      userId: user.id,
      customerResolution: created ? 'created' : 'reused',
    });

    return NextResponse.json({
      ok: true,
      url: session.url,
    });

  } catch (error: unknown) {
    console.error('Billing portal session creation failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to create billing portal session';
    
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
