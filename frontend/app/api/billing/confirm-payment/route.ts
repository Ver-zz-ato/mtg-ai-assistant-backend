import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { stripe } from '@/lib/stripe';
import { PRODUCT_TO_PLAN } from '@/lib/billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // Disable caching

/**
 * Immediate Pro status sync endpoint
 * Called when user returns from Stripe checkout to instantly update Pro status
 * This bypasses webhook delays for immediate user experience
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: 'session_id required' },
        { status: 400 }
      );
    }

    // Get authenticated user
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    const isDev = process.env.NODE_ENV !== 'production';
    
    if (authError || !user) {
      const errorResponse = {
        ok: false,
        code: 'AUTH_REQUIRED',
        error: 'Authentication required',
        ...(isDev && { authError: authError?.message }),
      };
      return NextResponse.json(errorResponse, { 
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    // Retrieve checkout session from Stripe
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['subscription', 'customer'],
      });
      
      // Log session details (always log for debugging)
      console.log('[confirm-payment] 🔍 Session retrieved', {
        sessionId: session.id,
        sessionStatus: session.status,
        paymentStatus: session.payment_status,
        customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
        metadata: session.metadata,
        subscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id,
        sessionMode: sessionId.startsWith('cs_test_') ? 'test' : sessionId.startsWith('cs_live_') ? 'live' : 'unknown',
      });
    } catch (stripeError: any) {
      console.error('Failed to retrieve checkout session:', stripeError);
      const errorResponse = {
        ok: false,
        code: 'INVALID_SESSION',
        error: 'Invalid session ID',
        ...(isDev && { 
          stripeError: stripeError.message,
          sessionId,
        }),
      };
      return NextResponse.json(errorResponse, { 
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    // Verify payment was successful
    if (session.payment_status !== 'paid' || session.status !== 'complete') {
      const errorResponse = {
        ok: false,
        code: 'PAYMENT_NOT_COMPLETE',
        error: 'Payment not completed',
        payment_status: session.payment_status,
        status: session.status,
      };
      return NextResponse.json(errorResponse, { 
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    // Verify this session belongs to the authenticated user
    // Check via customer ID or metadata
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    const sessionUserId = (session.metadata as any)?.app_user_id;

    if (!customerId && !sessionUserId) {
      const errorResponse = {
        ok: false,
        code: 'SESSION_MISSING_INFO',
        error: 'Session missing customer/user info',
        ...(isDev && {
          sessionCustomer: session.customer,
          sessionMetadata: session.metadata,
        }),
      };
      return NextResponse.json(errorResponse, { 
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    // Verify user matches
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      const errorResponse = {
        ok: false,
        code: 'PROFILE_NOT_FOUND',
        error: 'User profile not found',
        ...(isDev && { profileError: profileError?.message, userId: user.id }),
      };
      return NextResponse.json(errorResponse, { 
        status: 404,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    // Verify ownership: either customer ID matches OR metadata user ID matches
    const customerMatches = profile.stripe_customer_id === customerId;
    const userMatches = sessionUserId === user.id;

    // Log ownership check details (always log for debugging)
    console.log('[confirm-payment] 🔍 Ownership check', {
      authenticatedUserId: user.id,
      sessionCustomerId: customerId,
      profileCustomerId: profile.stripe_customer_id,
      sessionUserId,
      customerMatches,
      userMatches,
      ownershipVerified: customerMatches || userMatches,
    });

    if (!customerMatches && !userMatches) {
      console.error('Session ownership mismatch', {
        sessionCustomerId: customerId,
        profileCustomerId: profile.stripe_customer_id,
        sessionUserId,
        authenticatedUserId: user.id,
      });
      const errorResponse = {
        ok: false,
        code: 'OWNERSHIP_MISMATCH',
        error: 'Session does not belong to authenticated user',
        ...(isDev && {
          sessionCustomerId: customerId,
          profileCustomerId: profile.stripe_customer_id,
          sessionUserId,
          authenticatedUserId: user.id,
        }),
      };
      return NextResponse.json(errorResponse, { 
        status: 403,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    // Get subscription details
    const subscriptionId = typeof session.subscription === 'string' 
      ? session.subscription 
      : session.subscription?.id;

    if (!subscriptionId) {
      return NextResponse.json(
        { ok: false, error: 'No subscription found in session' },
        { status: 400 }
      );
    }

    // Retrieve subscription to get plan details
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const subscriptionItem = subscription.items.data[0];
    const productId = subscriptionItem?.price?.product as string;
    const plan = productId ? PRODUCT_TO_PLAN[productId] : null;

    if (!plan && productId) {
      console.error('Unknown product ID in checkout session:', productId, {
        availableProducts: Object.keys(PRODUCT_TO_PLAN),
        subscriptionId,
        customerId,
        sessionId,
      });
    }

    // Update user profile with Pro status IMMEDIATELY
    const updateData = {
      is_pro: true,
      pro_plan: plan || null,
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId || profile.stripe_customer_id,
      pro_since: new Date().toISOString(),
      pro_until: null,
    };

    const { error: updateError } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', user.id);

    if (updateError) {
      console.error('Failed to update user profile:', {
        error: updateError,
        userId: user.id,
        updateData,
      });
      return NextResponse.json(
        { ok: false, error: 'Failed to update Pro status' },
        { status: 500 }
      );
    }

    // CRITICAL: Also update user_metadata for consistency
    const { getAdmin } = await import('@/app/api/_lib/supa');
    const admin = getAdmin();
    if (admin) {
      try {
        const { data: userData } = await admin.auth.admin.getUserById(user.id);
        if (userData?.user) {
          const currentMetadata = userData.user.user_metadata || {};
          await admin.auth.admin.updateUserById(user.id, {
            user_metadata: {
              ...currentMetadata,
              pro: true,
              is_pro: true,
            }
          });
          console.info('Updated user_metadata for Pro user (immediate sync)');
        }
      } catch (metaError) {
        console.error('Failed to update user_metadata (non-fatal):', metaError);
        // Don't fail the request - profile update succeeded
      }
    }

    console.info('User Pro status updated immediately via checkout session', {
      userId: user.id,
      plan,
      subscriptionId,
      sessionId,
    });

    return NextResponse.json({
      ok: true,
      isPro: true,
      plan,
      subscriptionId,
      message: 'Pro status updated successfully',
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });

  } catch (error: any) {
    console.error('Confirm payment error:', error);
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      { 
        ok: false,
        code: 'INTERNAL_ERROR',
        error: error.message || 'Failed to confirm payment',
        ...(isDev && { stack: error.stack }),
      },
      { 
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}
