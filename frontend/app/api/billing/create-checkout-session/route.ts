import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { stripe } from '@/lib/stripe';
import { getProductIdForPlan, getPriceIdForProduct } from '@/lib/billing';
import {
  ensureStripeCustomerForUser,
  findExistingBlockingSubscription,
} from '@/lib/stripe/billing-state';

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

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { plan, successUrl, cancelUrl } = body;

    // Validate plan
    if (!plan || !['monthly', 'yearly'].includes(plan)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid plan. Must be "monthly" or "yearly".' },
        { status: 400 }
      );
    }

    // Get authenticated user
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Failed to fetch user profile:', profileError);
      return NextResponse.json(
        { ok: false, error: 'User profile not found' },
        { status: 404 }
      );
    }

    const { customerId, created, recoveredFrom } = await ensureStripeCustomerForUser({
      supabase,
      user,
      profile,
    });

    const existingSubscription = await findExistingBlockingSubscription({
      customerId,
      profileSubscriptionId: profile.stripe_subscription_id,
    });

    if (existingSubscription) {
      console.warn('Checkout blocked: active Stripe subscription already exists', {
        userId: user.id,
        customerId,
        subscriptionId: existingSubscription.id,
        status: existingSubscription.status,
      });
      return NextResponse.json(
        {
          ok: false,
          code: 'ALREADY_SUBSCRIBED',
          error: 'You already have an active subscription. Please manage billing instead.',
        },
        { status: 409 }
      );
    }

    // Resolve product ID and price ID
    const productId = getProductIdForPlan(plan);
    const priceId = await getPriceIdForProduct(productId);

    // Build URLs from canonical domain ONLY (never from req.headers.host)
    // This prevents www/non-www cookie mismatch issues
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 
      (process.env.NODE_ENV === 'production' 
        ? 'https://www.manatap.ai'
        : 'http://localhost:3000');

    const successUrlFinal = successUrl || `${siteUrl}/thank-you?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`;
    const cancelUrlFinal = cancelUrl || `${siteUrl}/pricing?status=cancel`;

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrlFinal,
      cancel_url: cancelUrlFinal,
      allow_promotion_codes: true,
      metadata: {
        app_user_id: user.id,
        plan: plan,
      },
    });

    // Log with diagnostic info (dev only)
    const isDev = process.env.NODE_ENV !== 'production';
    console.info('Checkout session created', {
      sessionId: session.id,
      customerId,
      userId: user.id,
      plan,
      priceId,
      customerResolution: created ? 'created' : recoveredFrom,
      ...(isDev && {
        success_url_host: new URL(successUrlFinal).host,
        cancel_url_host: new URL(cancelUrlFinal).host,
        site_url: siteUrl,
      }),
    });

    return NextResponse.json({
      ok: true,
      url: session.url,
    });

  } catch (error: unknown) {
    console.error('Checkout session creation failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to create checkout session';
    
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
