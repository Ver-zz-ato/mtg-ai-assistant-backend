import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { stripe } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
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

    if (!profile.stripe_customer_id) {
      return NextResponse.json(
        { ok: false, error: 'No billing account found. Please upgrade first.' },
        { status: 400 }
      );
    }

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: returnUrl || 'https://app.manatap.ai/pricing',
    });

    console.info('Billing portal session created', {
      sessionId: session.id,
      customerId: profile.stripe_customer_id,
      userId: user.id,
    });

    return NextResponse.json({
      ok: true,
      url: session.url,
    });

  } catch (error: any) {
    console.error('Billing portal session creation failed:', error);
    
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to create billing portal session' },
      { status: 500 }
    );
  }
}