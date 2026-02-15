/**
 * Fetches active subscriptions directly from Stripe API (source of truth).
 * Use this to compare with our profiles — if Stripe has more, webhook sync may have failed.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { stripe } from '@/lib/stripe';

export const runtime = 'nodejs';

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "").split(/[\s,]+/).filter(Boolean).map(s => s.toLowerCase());
  const uid = String(user?.id || "");
  const email = String(user?.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const subs: any[] = [];
    for await (const sub of stripe.subscriptions.list({
      status: 'active',
      limit: 100,
      expand: ['data.customer', 'data.items.data.price.product'],
    })) {
      const s = sub as any;
      const customer = sub.customer as any;
      const email = typeof customer === 'object' ? customer?.email : null;
      const item = sub.items?.data?.[0];
      const interval = item?.price?.recurring?.interval || null;
      subs.push({
        id: sub.id,
        customer_id: sub.customer,
        customer_email: email,
        status: sub.status,
        current_period_end: s.current_period_end,
        interval,
        created: sub.created,
      });
    }

    // Also get trialing
    for await (const sub of stripe.subscriptions.list({
      status: 'trialing',
      limit: 100,
      expand: ['data.customer'],
    })) {
      const s = sub as any;
      const customer = sub.customer as any;
      const email = typeof customer === 'object' ? customer?.email : null;
      const item = sub.items?.data?.[0];
      const interval = item?.price?.recurring?.interval || null;
      subs.push({
        id: sub.id,
        customer_id: sub.customer,
        customer_email: email,
        status: sub.status,
        current_period_end: s.current_period_end,
        interval,
        created: sub.created,
      });
    }

    return NextResponse.json({
      ok: true,
      count: subs.length,
      subscriptions: subs,
    });
  } catch (error: any) {
    console.error('Stripe subscriptions fetch error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to fetch from Stripe' },
      { status: 500 }
    );
  }
}
