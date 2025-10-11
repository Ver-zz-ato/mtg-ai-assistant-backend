import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getServerSupabase } from '@/lib/server-supabase';
import { PRODUCT_TO_PLAN } from '@/lib/billing';
import Stripe from 'stripe';

export const runtime = 'nodejs';

// This is critical for webhook signature verification - we need the raw body
export async function POST(req: NextRequest) {
  const body = await req.text(); // Get raw body as string
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    console.error('Missing Stripe signature header');
    return NextResponse.json(
      { error: 'Missing Stripe signature' },
      { status: 400 }
    );
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('Missing STRIPE_WEBHOOK_SECRET');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }

  // Log all events for debugging
  console.info('Stripe webhook event received', {
    type: event.type,
    id: event.id,
    created: event.created,
  });

  try {
    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event);
        break;
      
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event);
        break;
      
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event);
        break;
      
      case 'invoice.paid':
        console.info('Invoice paid', { invoiceId: event.data.object.id });
        // Just log for now - could track payment history
        break;
      
      case 'invoice.payment_failed':
        console.info('Invoice payment failed', { invoiceId: event.data.object.id });
        // Could send notification to user
        break;
      
      default:
        console.info('Unhandled webhook event type:', event.type);
        break;
    }

    return NextResponse.json({ received: true });

  } catch (error: any) {
    console.error('Webhook processing failed:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function handleCheckoutCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  
  console.info('Processing checkout session completed', {
    sessionId: session.id,
    customerId: session.customer,
    subscriptionId: session.subscription,
  });

  if (!session.customer || !session.subscription) {
    console.error('Missing customer or subscription in checkout session');
    return;
  }

  // Get subscription details to determine the plan
  const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
  const subscriptionItem = subscription.items.data[0];
  
  if (!subscriptionItem?.price?.product) {
    console.error('Missing product in subscription');
    return;
  }

  // Map product ID to plan
  const productId = subscriptionItem.price.product as string;
  const plan = PRODUCT_TO_PLAN[productId];
  
  if (!plan) {
    console.error('Unknown product ID:', productId);
    return;
  }

  // Find user by customer ID and update their profile
  const supabase = await getServerSupabase();
  
  const { data: profile, error: findError } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', session.customer)
    .single();

  if (findError || !profile) {
    console.error('Failed to find user profile for customer:', session.customer, findError);
    return;
  }

  // Update user profile with Pro status
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      is_pro: true,
      pro_plan: plan,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: session.customer,
      pro_since: new Date().toISOString(),
      pro_until: null, // Clear any previous end date
    })
    .eq('id', profile.id);

  if (updateError) {
    console.error('Failed to update user profile:', updateError);
    throw updateError;
  }

  console.info('User upgraded to Pro', {
    userId: profile.id,
    plan,
    subscriptionId: subscription.id,
  });
}

async function handleSubscriptionUpdated(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  
  console.info('Processing subscription updated', {
    subscriptionId: subscription.id,
    customerId: subscription.customer,
    status: subscription.status,
  });

  // Find user by customer ID
  const supabase = await getServerSupabase();
  
  const { data: profile, error: findError } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', subscription.customer)
    .single();

  if (findError || !profile) {
    console.error('Failed to find user profile for customer:', subscription.customer, findError);
    return;
  }

  if (subscription.status === 'active') {
    // Subscription is active - ensure user is Pro
    const subscriptionItem = subscription.items.data[0];
    const productId = subscriptionItem?.price?.product as string;
    const plan = productId ? PRODUCT_TO_PLAN[productId] : null;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        is_pro: true,
        pro_plan: plan,
        stripe_subscription_id: subscription.id,
        pro_until: null, // Clear any end date
      })
      .eq('id', profile.id);

    if (updateError) {
      console.error('Failed to update user profile to active:', updateError);
      throw updateError;
    }

    console.info('Subscription activated', { userId: profile.id, plan });

  } else if (subscription.status === 'canceled') {
    // Subscription cancelled - remove Pro status
    const cancelAt = subscription.cancel_at 
      ? new Date(subscription.cancel_at * 1000).toISOString()
      : new Date().toISOString();

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        is_pro: false,
        pro_until: cancelAt,
      })
      .eq('id', profile.id);

    if (updateError) {
      console.error('Failed to update user profile to canceled:', updateError);
      throw updateError;
    }

    console.info('Subscription canceled', { userId: profile.id, cancelAt });
  }
}

async function handleSubscriptionDeleted(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  
  console.info('Processing subscription deleted', {
    subscriptionId: subscription.id,
    customerId: subscription.customer,
  });

  // Find user by customer ID
  const supabase = await getServerSupabase();
  
  const { data: profile, error: findError } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', subscription.customer)
    .single();

  if (findError || !profile) {
    console.error('Failed to find user profile for customer:', subscription.customer, findError);
    return;
  }

  // Remove Pro status immediately
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      is_pro: false,
      pro_until: new Date().toISOString(),
    })
    .eq('id', profile.id);

  if (updateError) {
    console.error('Failed to update user profile for deleted subscription:', updateError);
    throw updateError;
  }

  console.info('Subscription deleted, user downgraded', { userId: profile.id });
}