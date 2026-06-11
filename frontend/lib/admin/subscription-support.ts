import { getAdmin } from '@/app/api/_lib/supa';
import { getEntitlementDebugForAdmin } from '@/lib/server-pro-check';

const OPS_BILLING_ACTIONS = [
  'ops_revenuecat_webhook_processed',
  'ops_entitlement_granted',
  'ops_entitlement_revoked',
  'ops_entitlement_revoke_skipped',
  'ops_stripe_webhook_processed',
] as const;

export type RevenueCatAdminSubscriberSummary = {
  originalAppUserId: string | null;
  firstSeen: string | null;
  managementUrl: string | null;
  entitlements: Array<{
    id: string;
    productId: string | null;
    expiresDate: string | null;
    active: boolean;
  }>;
  subscriptions: Array<{
    productId: string;
    store: string | null;
    expiresDate: string | null;
    isSandbox: boolean | null;
    unsubscribeDetectedAt: string | null;
    billingIssuesDetectedAt: string | null;
  }>;
  fetchError?: string;
};

export type BillingAuditEvent = {
  created_at: string;
  action: string;
  source: string | null;
  status: string | null;
  reason: string | null;
  store: string | null;
  environment: string | null;
  eventId: string | null;
  isTransfer: boolean;
  isTransferRevoke: boolean;
};

function isEntitlementActive(expiresDate: string | null | undefined): boolean {
  if (!expiresDate) return true;
  const until = new Date(expiresDate);
  return !Number.isFinite(until.getTime()) || until.getTime() > Date.now();
}

export async function fetchRevenueCatSubscriberAdminSummary(
  userId: string
): Promise<RevenueCatAdminSubscriberSummary> {
  const secretKey = process.env.REVENUECAT_SECRET_API_KEY || process.env.REVENUECAT_SECRET_KEY;
  if (!secretKey?.trim()) {
    return {
      originalAppUserId: null,
      firstSeen: null,
      managementUrl: null,
      entitlements: [],
      subscriptions: [],
      fetchError: 'REVENUECAT_SECRET_API_KEY not configured',
    };
  }

  try {
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secretKey}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      return {
        originalAppUserId: null,
        firstSeen: null,
        managementUrl: null,
        entitlements: [],
        subscriptions: [],
        fetchError: `RevenueCat HTTP ${res.status}`,
      };
    }

    const json = (await res.json()) as {
      subscriber?: {
        original_app_user_id?: string;
        first_seen?: string;
        management_url?: string;
        entitlements?: Record<
          string,
          { product_identifier?: string; expires_date?: string | null } | undefined
        >;
        subscriptions?: Record<
          string,
          {
            store?: string;
            expires_date?: string | null;
            is_sandbox?: boolean;
            unsubscribe_detected_at?: string | null;
            billing_issues_detected_at?: string | null;
          }
        >;
      };
    };

    const sub = json.subscriber;
    const entitlements = Object.entries(sub?.entitlements ?? {}).map(([id, ent]) => ({
      id,
      productId: ent?.product_identifier ?? null,
      expiresDate: ent?.expires_date ?? null,
      active: isEntitlementActive(ent?.expires_date),
    }));

    const subscriptions = Object.entries(sub?.subscriptions ?? {}).map(([productId, row]) => ({
      productId,
      store: row?.store ?? null,
      expiresDate: row?.expires_date ?? null,
      isSandbox: row?.is_sandbox ?? null,
      unsubscribeDetectedAt: row?.unsubscribe_detected_at ?? null,
      billingIssuesDetectedAt: row?.billing_issues_detected_at ?? null,
    }));

    return {
      originalAppUserId: sub?.original_app_user_id ?? null,
      firstSeen: sub?.first_seen ?? null,
      managementUrl: sub?.management_url ?? null,
      entitlements,
      subscriptions,
    };
  } catch (e: unknown) {
    return {
      originalAppUserId: null,
      firstSeen: null,
      managementUrl: null,
      entitlements: [],
      subscriptions: [],
      fetchError: e instanceof Error ? e.message : String(e),
    };
  }
}

function parseBillingAuditRow(row: {
  created_at: string;
  action: string;
  payload: Record<string, unknown> | null;
}): BillingAuditEvent {
  const payload = row.payload ?? {};
  const source = typeof payload.source === 'string' ? payload.source : null;
  const reason = typeof payload.reason === 'string' ? payload.reason : null;
  return {
    created_at: row.created_at,
    action: row.action,
    source,
    status: typeof payload.status === 'string' ? payload.status : null,
    reason,
    store: typeof payload.rc_store === 'string' ? payload.rc_store : null,
    environment: typeof payload.rc_environment === 'string' ? payload.rc_environment : null,
    eventId: typeof payload.event_id === 'string' ? payload.event_id : null,
    isTransfer: source === 'TRANSFER',
    isTransferRevoke: reason === 'transfer_revoke' || reason?.startsWith('transfer_revoke_') === true,
  };
}

export async function getSubscriptionSupportForAdmin(userId: string) {
  const admin = getAdmin();
  if (!admin) {
    throw new Error('Admin client required');
  }

  const [debug, revenueCat, authResult, auditResult] = await Promise.all([
    getEntitlementDebugForAdmin(userId),
    fetchRevenueCatSubscriberAdminSummary(userId),
    admin.auth.admin.getUserById(userId),
    admin
      .from('admin_audit')
      .select('created_at, action, target, payload')
      .in('action', [...OPS_BILLING_ACTIONS])
      .or(`target.eq.${userId},payload->>user_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  const authUser = authResult.data?.user;
  const identities =
    authUser?.identities?.map((identity) => ({
      provider: identity.provider,
      id: identity.id,
      created_at: identity.created_at ?? null,
    })) ?? [];

  const billingEvents = (auditResult.data ?? []).map((row) =>
    parseBillingAuditRow(row as { created_at: string; action: string; payload: Record<string, unknown> | null })
  );

  const revenueCatProjectId = process.env.REVENUECAT_PROJECT_ID?.trim() || null;
  const revenueCatCustomerUrl = revenueCatProjectId
    ? `https://app.revenuecat.com/projects/${encodeURIComponent(revenueCatProjectId)}/customers/${encodeURIComponent(userId)}`
    : null;

  return {
    userId,
    email: authUser?.email ?? null,
    created_at: authUser?.created_at ?? null,
    last_sign_in_at: authUser?.last_sign_in_at ?? null,
    identities,
    debug,
    revenueCat,
    billingEvents,
    revenueCatCustomerUrl,
  };
}
