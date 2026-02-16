/**
 * Syncs Stripe active subscriptions to our profiles.
 * For each active subscription, finds profile by customer email and updates stripe_subscription_id.
 * Use when Stripe API shows more subscriptions than our DB (webhook missed some).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { getAdmin } from '@/app/api/_lib/supa';
import { stripe } from '@/lib/stripe';
import { PRODUCT_TO_PLAN } from '@/lib/billing';

export const runtime = 'nodejs';

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "").split(/[\s,]+/).filter(Boolean).map(s => s.toLowerCase());
  const uid = String(user?.id || "");
  const email = String(user?.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: 'Missing service role' }, { status: 500 });
    }

    const synced: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    for await (const sub of stripe.subscriptions.list({ status: 'active', limit: 100 })) {
      if (sub.items?.data?.length === 0) continue;

      const customerId = sub.customer as string;
      let customerEmail: string | null = null;

      try {
        const customer = await stripe.customers.retrieve(customerId);
        if (customer && !customer.deleted) {
          customerEmail = (customer as any).email || null;
        }
      } catch (e) {
        errors.push(`Customer ${customerId}: ${(e as Error).message}`);
        continue;
      }

      if (!customerEmail) {
        skipped.push(`${sub.id} (no customer email)`);
        continue;
      }

      const item = sub.items.data[0];
      const productId = item?.price?.product as string;
      const plan = PRODUCT_TO_PLAN[productId] || (item?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly');

      const { data: userId } = await admin.rpc('get_user_id_by_email', { p_email: customerEmail });
      if (!userId) {
        skipped.push(`${sub.id} (${customerEmail} — no matching user)`);
        continue;
      }
      const { data: profile } = await admin
        .from('profiles')
        .select('id, stripe_subscription_id')
        .eq('id', userId)
        .maybeSingle();

      if (!profile) {
        skipped.push(`${sub.id} (${customerEmail} — no matching profile)`);
        continue;
      }

      if (profile.stripe_subscription_id === sub.id) {
        skipped.push(`${sub.id} (already synced)`);
        continue;
      }

      const { error } = await admin
        .from('profiles')
        .update({
          is_pro: true,
          pro_plan: plan,
          stripe_subscription_id: sub.id,
          stripe_customer_id: customerId,
          pro_since: new Date().toISOString(),
        })
        .eq('id', profile.id);

      if (error) {
        errors.push(`${sub.id}: ${error.message}`);
      } else {
        synced.push(`${profile.id} (${customerEmail})`);
      }
    }

    return NextResponse.json({
      ok: true,
      synced: synced.length,
      synced_ids: synced,
      skipped: skipped.length,
      errors: errors.length ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Stripe sync error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Sync failed' },
      { status: 500 }
    );
  }
}
