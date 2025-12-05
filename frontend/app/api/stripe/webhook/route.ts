import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getServerSupabase } from '@/lib/server-supabase';
import { PRODUCT_TO_PLAN } from '@/lib/billing';
import Stripe from 'stripe';

export const runtime = 'nodejs';

// Track processed event IDs to ensure idempotency (in-memory for now)
// In production, consider using Redis or database for distributed systems
const processedEvents = new Set<string>();
const MAX_CACHE_SIZE = 1000;

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

  // Idempotency check - prevent duplicate processing
  if (processedEvents.has(event.id)) {
    console.info('Duplicate event ignored', { eventId: event.id, type: event.type });
    return NextResponse.json({ received: true, duplicate: true });
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
      
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event);
        break;
      
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event);
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
        await handleInvoicePaymentFailed(event);
        break;
      
      default:
        console.info('Unhandled webhook event type:', event.type);
        break;
    }

    // Mark event as processed (with size limit to prevent memory leak)
    if (processedEvents.size >= MAX_CACHE_SIZE) {
      // Clear old events when cache is full
      const firstEvent = processedEvents.values().next().value;
      if (firstEvent) {
        processedEvents.delete(firstEvent);
      }
    }
    processedEvents.add(event.id);

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
  
  let profile: { id: string } | null = null;
  
  // Try lookup by stripe_customer_id first
  const { data: profileByCustomer, error: findError } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', session.customer)
    .single();

  if (profileByCustomer) {
    profile = profileByCustomer;
  } else {
    // Fallback: Look up by user ID from session metadata (in case customer ID wasn't saved yet)
    const userId = (session.metadata as any)?.app_user_id;
    if (userId) {
      const { data: profileById, error: findByIdError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .single();
      
      if (profileById) {
        profile = profileById;
        console.info('Found user by metadata.app_user_id fallback', { userId, customerId: session.customer });
      } else {
        console.error('Failed to find user by ID fallback:', userId, findByIdError);
      }
    }
  }

  if (!profile) {
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

  // CRITICAL: Also update user_metadata for consistency
  const { getAdmin } = await import('@/app/api/_lib/supa');
  const admin = getAdmin();
  if (admin) {
    try {
      const { data: userData } = await admin.auth.admin.getUserById(profile.id);
      if (userData?.user) {
        const currentMetadata = userData.user.user_metadata || {};
        await admin.auth.admin.updateUserById(profile.id, {
          user_metadata: {
            ...currentMetadata,
            pro: true,
            is_pro: true,
          }
        });
        console.info('Updated user_metadata for Pro user');
      }
    } catch (metaError) {
      console.error('Failed to update user_metadata (non-fatal):', metaError);
      // Don't throw - profile update succeeded, metadata is just for caching
    }
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

    // Update user_metadata
    const { getAdmin } = await import('@/app/api/_lib/supa');
    const admin = getAdmin();
    if (admin) {
      try {
        const { data: userData } = await admin.auth.admin.getUserById(profile.id);
        if (userData?.user) {
          await admin.auth.admin.updateUserById(profile.id, {
            user_metadata: { ...userData.user.user_metadata, pro: true, is_pro: true }
          });
        }
      } catch (e) {
        console.error('Failed to update user_metadata (non-fatal):', e);
      }
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

    // Update user_metadata
    const { getAdmin } = await import('@/app/api/_lib/supa');
    const admin = getAdmin();
    if (admin) {
      try {
        const { data: userData } = await admin.auth.admin.getUserById(profile.id);
        if (userData?.user) {
          await admin.auth.admin.updateUserById(profile.id, {
            user_metadata: { ...userData.user.user_metadata, pro: false, is_pro: false }
          });
        }
      } catch (e) {
        console.error('Failed to update user_metadata (non-fatal):', e);
      }
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

  // Update user_metadata
  const { getAdmin } = await import('@/app/api/_lib/supa');
  const admin = getAdmin();
  if (admin) {
    try {
      const { data: userData } = await admin.auth.admin.getUserById(profile.id);
      if (userData?.user) {
        await admin.auth.admin.updateUserById(profile.id, {
          user_metadata: { ...userData.user.user_metadata, pro: false, is_pro: false }
        });
      }
    } catch (e) {
      console.error('Failed to update user_metadata (non-fatal):', e);
    }
  }

  console.info('Subscription deleted, user downgraded', { userId: profile.id });
}

async function handlePaymentIntentSucceeded(event: Stripe.Event) {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  
  console.info('Processing payment intent succeeded', {
    paymentIntentId: paymentIntent.id,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    customerId: paymentIntent.customer,
  });

  // Payment intent succeeded - could be used for one-time payments
  // For subscriptions, we rely on checkout.session.completed and invoice events
  // This is mainly for logging and analytics
}

async function handleInvoicePaymentSucceeded(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  
  // Access subscription through the invoice object (using any to work around type issues)
  const invoiceData = invoice as any;
  const subscriptionId = typeof invoiceData.subscription === 'string' 
    ? invoiceData.subscription 
    : invoiceData.subscription?.id;
  
  console.info('Processing invoice payment succeeded', {
    invoiceId: invoice.id,
    subscriptionId,
    customerId: invoice.customer,
    amountPaid: invoice.amount_paid,
    currency: invoice.currency,
  });

  // Invoice paid successfully - subscription is active
  // For recurring subscriptions, this fires after the initial checkout
  if (!subscriptionId || !invoice.customer) {
    console.info('Invoice not associated with subscription, skipping');
    return;
  }

  // Find user by customer ID
  const supabase = await getServerSupabase();
  
  const { data: profile, error: findError } = await supabase
    .from('profiles')
    .select('id, is_pro')
    .eq('stripe_customer_id', invoice.customer)
    .single();

  if (findError || !profile) {
    console.error('Failed to find user profile for customer:', invoice.customer, findError);
    return;
  }

  // Ensure user is marked as Pro (in case webhook ordering issues)
  if (!profile.is_pro) {
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        is_pro: true,
        pro_until: null, // Clear any end date
      })
      .eq('id', profile.id);

    if (updateError) {
      console.error('Failed to update user profile on invoice payment:', updateError);
      throw updateError;
    }

    console.info('User Pro status confirmed via invoice payment', { userId: profile.id });
  } else {
    console.info('User already Pro, invoice payment logged', { userId: profile.id });
  }
}

async function handleInvoicePaymentFailed(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  
  // Access subscription through the invoice object (using any to work around type issues)
  const invoiceData = invoice as any;
  const subscriptionId = typeof invoiceData.subscription === 'string' 
    ? invoiceData.subscription 
    : invoiceData.subscription?.id;
  
  console.error('Invoice payment failed', {
    invoiceId: invoice.id,
    subscriptionId,
    customerId: invoice.customer,
    attemptCount: invoice.attempt_count,
    nextPaymentAttempt: invoice.next_payment_attempt,
  });

  // Payment failed - could notify user or take action after too many attempts
  // Stripe automatically handles retry logic, so we mainly log this
  
  if (!invoice.customer) {
    return;
  }

  // Find user to potentially send notification
  const supabase = await getServerSupabase();
  
  const { data: profile, error: findError } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', invoice.customer)
    .single();

  if (findError || !profile) {
    console.error('Failed to find user profile for failed payment:', invoice.customer, findError);
    return;
  }

  // TODO: Send email notification to user about failed payment
  // TODO: If attempt_count >= 3, consider additional actions
  
  console.info('Payment failure logged for user', {
    userId: profile.id,
    attemptCount: invoice.attempt_count,
  });
}