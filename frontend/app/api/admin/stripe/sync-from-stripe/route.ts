import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { getServerSupabase } from '@/lib/server-supabase';
import { getAdmin } from '@/app/api/_lib/supa';
import { stripe } from '@/lib/stripe';
import {
  derivePlanFromStripeSubscription,
  isStripeEntitlementStatus,
  needsStripeProfileRepair,
  type StripeEntitlementProfile,
} from '@/lib/stripe/reconciliation';
import { logAdminAction, readJsonBody, requireTypedConfirmation } from '@/lib/admin/danger-actions';

export const runtime = 'nodejs';

type AdminClient = SupabaseClient;

type StripeAuditRecord = {
  subscription_id: string;
  customer_id: string;
  customer_email: string | null;
  status: Stripe.Subscription.Status;
  plan: 'monthly' | 'yearly' | null;
  current_period_end: string | null;
  matched_user_id: string | null;
  matched_by: 'stripe_customer_id' | 'customer_metadata_app_user_id' | 'customer_email' | 'none';
  profile: {
    id: string;
    username?: string | null;
    is_pro?: boolean | null;
    pro_plan?: string | null;
    stripe_customer_id?: string | null;
    stripe_subscription_id?: string | null;
    pro_since?: string | null;
    pro_until?: string | null;
    updated_at?: string | null;
  } | null;
  needs_repair: boolean;
  can_repair: boolean;
  issues: string[];
};

type AdminUserLike = {
  id?: string;
  email?: string;
} | null | undefined;

type StripeProfileRow = StripeEntitlementProfile & {
  username?: string | null;
  pro_since?: string | null;
  pro_until?: string | null;
  updated_at?: string | null;
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isAdmin(user: AdminUserLike): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || '').split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || '').split(/[\s,]+/).filter(Boolean).map((s) => s.toLowerCase());
  const uid = String(user?.id || '');
  const email = String(user?.email || '').toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

async function getProfileById(admin: AdminClient, userId: string): Promise<StripeProfileRow | null> {
  const { data } = await admin
    .from('profiles')
    .select('id, username, is_pro, pro_plan, stripe_customer_id, stripe_subscription_id, pro_since, pro_until, updated_at')
    .eq('id', userId)
    .maybeSingle();
  return (data as StripeProfileRow | null) ?? null;
}

async function getProfileByStripeCustomerId(admin: AdminClient, customerId: string): Promise<StripeProfileRow | null> {
  const { data } = await admin
    .from('profiles')
    .select('id, username, is_pro, pro_plan, stripe_customer_id, stripe_subscription_id, pro_since, pro_until, updated_at')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  return (data as StripeProfileRow | null) ?? null;
}

async function getUserIdByEmail(admin: AdminClient, email: string | null): Promise<string | null> {
  if (!email) return null;
  const { data } = await admin.rpc('get_user_id_by_email', { p_email: email });
  return typeof data === 'string' && data ? data : null;
}

function buildIssues(record: {
  profile: StripeAuditRecord['profile'];
  canRepair: boolean;
  matchedBy: StripeAuditRecord['matched_by'];
  expected: { customerId: string; subscriptionId: string; plan: 'monthly' | 'yearly' | null };
}) {
  const issues: string[] = [];

  if (!record.profile) {
    issues.push(record.canRepair ? 'profile_missing' : 'no_user_match');
    return issues;
  }

  if (record.profile.is_pro !== true) issues.push('profile_not_pro');
  if (record.profile.stripe_customer_id !== record.expected.customerId) issues.push('stripe_customer_id_mismatch');
  if (record.profile.stripe_subscription_id !== record.expected.subscriptionId) issues.push('stripe_subscription_id_mismatch');
  if ((record.profile.pro_plan || null) !== record.expected.plan) issues.push('pro_plan_mismatch');
  if (record.matchedBy === 'customer_email') issues.push('email_fallback_match');
  return issues;
}

async function collectStripeAudit(admin: AdminClient): Promise<{
  subscriptions: StripeAuditRecord[];
  summary: {
    stripe_entitlement_subscriptions: number;
    active: number;
    trialing: number;
    needs_repair: number;
    repairable: number;
    no_user_match: number;
    matched_by_customer_id: number;
    matched_by_metadata: number;
    matched_by_email: number;
  };
}> {
  const subscriptions: StripeAuditRecord[] = [];

  for (const status of ['active', 'trialing'] as const) {
    for await (const subscription of stripe.subscriptions.list({
      status,
      limit: 100,
      expand: ['data.customer'],
    })) {
      if (!isStripeEntitlementStatus(subscription.status)) continue;

      const customer =
        typeof subscription.customer === 'string'
          ? await stripe.customers.retrieve(subscription.customer)
          : subscription.customer;

      if (!customer || customer.deleted) {
        subscriptions.push({
          subscription_id: subscription.id,
          customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
          customer_email: null,
          status: subscription.status,
          plan: derivePlanFromStripeSubscription(subscription),
          current_period_end: null,
          matched_user_id: null,
          matched_by: 'none',
          profile: null,
          needs_repair: true,
          can_repair: false,
          issues: ['customer_missing'],
        });
        continue;
      }

      const customerId = customer.id;
      const customerEmail = (customer.email || '').trim() || null;
      const metadataUserId = String(customer.metadata?.app_user_id || '').trim() || null;
      const plan = derivePlanFromStripeSubscription(subscription);

      let matchedBy: StripeAuditRecord['matched_by'] = 'none';
      let matchedUserId: string | null = null;
      let profile = await getProfileByStripeCustomerId(admin, customerId);

      if (profile) {
        matchedBy = 'stripe_customer_id';
        matchedUserId = profile.id;
      } else if (metadataUserId) {
        const metadataProfile = await getProfileById(admin, metadataUserId);
        if (metadataProfile) {
          profile = metadataProfile;
          matchedBy = 'customer_metadata_app_user_id';
          matchedUserId = metadataProfile.id;
        }
      }

      if (!profile && customerEmail) {
        const userId = await getUserIdByEmail(admin, customerEmail);
        if (userId) {
          const emailProfile = await getProfileById(admin, userId);
          if (emailProfile) {
            profile = emailProfile;
            matchedBy = 'customer_email';
            matchedUserId = emailProfile.id;
          }
        }
      }

      const expected = {
        customerId,
        subscriptionId: subscription.id,
        plan,
      };

      const needsRepair = needsStripeProfileRepair(profile, expected);
      const canRepair = !!profile && !!matchedUserId;
      const subscriptionWithPeriod = subscription as Stripe.Subscription & {
        current_period_end?: number | null;
      };

      subscriptions.push({
        subscription_id: subscription.id,
        customer_id: customerId,
        customer_email: customerEmail,
        status: subscription.status,
        plan,
        current_period_end: subscriptionWithPeriod.current_period_end
          ? new Date(subscriptionWithPeriod.current_period_end * 1000).toISOString()
          : null,
        matched_user_id: matchedUserId,
        matched_by: matchedBy,
        profile,
        needs_repair: needsRepair,
        can_repair: canRepair,
        issues: buildIssues({ profile, canRepair, matchedBy, expected }),
      });
    }
  }

  return {
    subscriptions,
    summary: {
      stripe_entitlement_subscriptions: subscriptions.length,
      active: subscriptions.filter((sub) => sub.status === 'active').length,
      trialing: subscriptions.filter((sub) => sub.status === 'trialing').length,
      needs_repair: subscriptions.filter((sub) => sub.needs_repair).length,
      repairable: subscriptions.filter((sub) => sub.needs_repair && sub.can_repair).length,
      no_user_match: subscriptions.filter((sub) => sub.matched_by === 'none').length,
      matched_by_customer_id: subscriptions.filter((sub) => sub.matched_by === 'stripe_customer_id').length,
      matched_by_metadata: subscriptions.filter((sub) => sub.matched_by === 'customer_metadata_app_user_id').length,
      matched_by_email: subscriptions.filter((sub) => sub.matched_by === 'customer_email').length,
    },
  };
}

async function setUserMetadataPro(admin: AdminClient, userId: string) {
  try {
    const { data: userData } = await admin.auth.admin.getUserById(userId);
    if (!userData?.user) return;

    await admin.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...(userData.user.user_metadata || {}),
        pro: true,
        is_pro: true,
      },
    });
  } catch (error) {
    console.error('Failed to sync auth metadata during Stripe repair (non-fatal):', {
      userId,
      error,
    });
  }
}

export async function GET() {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: 'Missing service role' }, { status: 500 });
    }

    const audit = await collectStripeAudit(admin);

    return NextResponse.json({
      ok: true,
      ...audit,
    });
  } catch (error: unknown) {
    console.error('Stripe reconciliation audit failed:', error);
    return NextResponse.json(
      { ok: false, error: errorMessage(error, 'Failed to audit Stripe reconciliation') },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await readJsonBody(req);
    const confirmation = requireTypedConfirmation(req, body, 'SYNC STRIPE');
    if (confirmation) return confirmation;

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: 'Missing service role' }, { status: 500 });
    }

    await logAdminAction({ actorId: user.id, action: 'stripe_sync_started', target: 'active_and_trialing_subscriptions' });

    const audit = await collectStripeAudit(admin);
    const targets = audit.subscriptions.filter((subscription) => subscription.needs_repair && subscription.can_repair);

    const repaired: string[] = [];
    const skipped = audit.subscriptions
      .filter((subscription) => !subscription.needs_repair || !subscription.can_repair)
      .map((subscription) => {
        const who = subscription.customer_email || subscription.matched_user_id || subscription.subscription_id;
        return `${who} (${subscription.issues.join(',') || 'already_synced'})`;
      });
    const errors: string[] = [];

    for (const target of targets) {
      if (!target.profile || !target.matched_user_id) {
        skipped.push(`${target.subscription_id} (no matched profile)`);
        continue;
      }

      const updateData = {
        is_pro: true,
        pro_plan: target.plan,
        stripe_subscription_id: target.subscription_id,
        stripe_customer_id: target.customer_id,
        pro_since: target.profile.pro_since || new Date().toISOString(),
        pro_until: null,
      };

      const { error } = await admin
        .from('profiles')
        .update(updateData)
        .eq('id', target.profile.id);

      if (error) {
        errors.push(`${target.customer_email || target.profile.id}: ${error.message}`);
        continue;
      }

      await setUserMetadataPro(admin, target.profile.id);
      repaired.push(`${target.customer_email || target.profile.id} -> ${target.subscription_id}`);
    }

    await logAdminAction({
      actorId: user.id,
      action: 'stripe_sync_finished',
      target: 'active_and_trialing_subscriptions',
      payload: {
        repaired: repaired.length,
        skipped: skipped.length,
        errors: errors.length,
      },
    });

    return NextResponse.json({
      ok: true,
      repaired: repaired.length,
      repaired_ids: repaired,
      skipped: skipped.length,
      skipped_ids: skipped,
      errors,
      summary: audit.summary,
    });
  } catch (error: unknown) {
    console.error('Stripe sync error:', error);
    return NextResponse.json(
      { ok: false, error: errorMessage(error, 'Sync failed') },
      { status: 500 }
    );
  }
}
