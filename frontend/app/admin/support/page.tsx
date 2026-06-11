'use client';
import React from 'react';
import { ELI5, HelpTip } from '@/components/AdminHelp';
import { track } from '@/lib/analytics/track';
import { useAuth } from '@/lib/auth-context';
import { useProStatus } from '@/hooks/useProStatus';

type Notice = { type: 'success' | 'error' | 'info'; message: string };
type ModerationActionType = 'warn' | 'ban' | 'unban' | 'note';
type SortKey =
  | 'username'
  | 'email'
  | 'created_at'
  | 'last_sign_in_at'
  | 'deck_count'
  | 'pro'
  | 'billing_active'
  | 'stripe_subscription_id';
type SortDirection = 'asc' | 'desc';
type SubscriptionSupportData = {
  userId: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  identities: Array<{ provider: string; id: string; created_at: string | null }>;
  revenueCatCustomerUrl: string | null;
  debug: {
    finalIsPro: boolean;
    fromProfile: boolean;
    fromRevenueCat: boolean;
    fromMetadata: boolean;
    sources: string[];
    mismatchFlags: string[];
    profile: {
      is_pro: boolean;
      pro_until: string | null;
      pro_plan: string | null;
      has_stripe_customer: boolean;
      has_stripe_subscription: boolean;
      stripe_subscription_status?: string;
    };
    revenueCatDebug: {
      secretConfigured: boolean;
      httpStatus: number | null;
      subscriberPresent: boolean;
      fromRevenueCat: boolean;
      entitlementKeys: string[];
      matchedEntitlementId: string | null;
      error?: string;
    };
  };
  revenueCat: {
    originalAppUserId: string | null;
    firstSeen: string | null;
    managementUrl: string | null;
    fetchError?: string;
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
  };
  billingEvents: Array<{
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
  }>;
};

type ModerationData = {
  status: {
    user_id: string;
    warning_count: number;
    is_banned: boolean;
    banned_until: string | null;
    last_action_type: ModerationActionType | null;
    last_reason: string | null;
    last_note: string | null;
    updated_at: string | null;
    updated_by: string | null;
    active_ban: boolean;
  };
  recentActions: Array<{
    id: string;
    action_type: ModerationActionType;
    reason: string;
    details: string | null;
    banned_until: string | null;
    created_at: string;
    actor: { id: string; email: string | null; username: string | null } | null;
  }>;
  recentReports: Array<{
    id: string;
    subject_type: string;
    resource_type: string | null;
    reason: string;
    details: string | null;
    status: string;
    created_at: string;
    reporter: { id: string; email: string | null; username: string | null } | null;
  }>;
  reportCounts: {
    open: number;
    reviewed: number;
    resolved: number;
    dismissed: number;
    total: number;
  };
};

function fmt(d: string | null) {
  if (!d) return '-';
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}

export default function SupportPage() {
  const [q, setQ] = React.useState('');
  const [rows, setRows] = React.useState<any[]>([]);
  const [sortKey, setSortKey] = React.useState<SortKey>('created_at');
  const [sortDirection, setSortDirection] = React.useState<SortDirection>('desc');
  const [busy, setBusy] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(false);
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);
  const [actionBusy, setActionBusy] = React.useState<string | null>(null);
  const [toggleBusyKey, setToggleBusyKey] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const [verificationLink, setVerificationLink] = React.useState<string | null>(null);
  const [moderationData, setModerationData] = React.useState<ModerationData | null>(null);
  const [moderationBusy, setModerationBusy] = React.useState(false);
  const [subscriptionData, setSubscriptionData] = React.useState<SubscriptionSupportData | null>(null);
  const [subscriptionBusy, setSubscriptionBusy] = React.useState(false);
  const [moderationReason, setModerationReason] = React.useState('');
  const [moderationDetails, setModerationDetails] = React.useState('');
  const [moderationBanDuration, setModerationBanDuration] = React.useState<'7' | '30' | 'permanent'>('7');
  const { user } = useAuth();
  const { isPro } = useProStatus();

  const selectedUser = React.useMemo(
    () => rows.find((row) => row.id === selectedUserId) || null,
    [rows, selectedUserId]
  );
  const sortedRows = React.useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1;
    const getDisplayUser = (row: any) => row.username || row.display_name || '';
    const getTime = (value: string | null | undefined) => {
      if (!value) return 0;
      const ts = new Date(value).getTime();
      return Number.isFinite(ts) ? ts : 0;
    };

    return [...rows].sort((a, b) => {
      let left: string | number | boolean = '';
      let right: string | number | boolean = '';

      switch (sortKey) {
        case 'username':
          left = getDisplayUser(a).toLowerCase();
          right = getDisplayUser(b).toLowerCase();
          break;
        case 'email':
          left = String(a.email || '').toLowerCase();
          right = String(b.email || '').toLowerCase();
          break;
        case 'created_at':
          left = getTime(a.created_at);
          right = getTime(b.created_at);
          break;
        case 'last_sign_in_at':
          left = getTime(a.last_sign_in_at);
          right = getTime(b.last_sign_in_at);
          break;
        case 'deck_count':
          left = Number(a.deck_count || 0);
          right = Number(b.deck_count || 0);
          break;
        case 'pro':
          left = !!a.pro;
          right = !!b.pro;
          break;
        case 'billing_active':
          left = !!a.billing_active;
          right = !!b.billing_active;
          break;
        case 'stripe_subscription_id':
          left = !!a.stripe_subscription_id;
          right = !!b.stripe_subscription_id;
          break;
      }

      if (left < right) return -1 * direction;
      if (left > right) return 1 * direction;
      return String(a.email || '').localeCompare(String(b.email || ''));
    });
  }, [rows, sortDirection, sortKey]);

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === 'username' || nextKey === 'email' ? 'asc' : 'desc');
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return ' ';
    return sortDirection === 'asc' ? '▲' : '▼';
  }

  function patchRow(userId: string, patch: Record<string, unknown>) {
    setRows((prev) => prev.map((row) => (row.id === userId ? { ...row, ...patch } : row)));
  }

  function buildBanUntil(duration: '7' | '30' | 'permanent') {
    if (duration === 'permanent') return null;
    const days = Number(duration);
    const next = new Date();
    next.setDate(next.getDate() + days);
    return next.toISOString();
  }

  async function loadUsers(searchQuery?: string, pageNum = 1) {
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery != null) params.set('q', searchQuery);
      params.set('page', String(pageNum));
      params.set('perPage', '50');
      const r = await fetch(`/api/admin/users/search?${params}`);
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || 'load_failed');
      const users = j.users || [];
      if (pageNum === 1) setRows(users);
      else setRows((prev) => [...prev, ...users]);
      setHasMore(!!j.hasMore);
      setPage(pageNum);
      if (pageNum === 1) setVerificationLink(null);
    } catch (e: any) {
      setNotice({ type: 'error', message: e?.message || 'Failed to load users.' });
      if (pageNum === 1) setRows([]);
    } finally {
      setBusy(false);
    }
  }

  function search() {
    setNotice(null);
    loadUsers(q, 1);
  }

  React.useEffect(() => {
    loadUsers('', 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSubscription(userId: string) {
    setSubscriptionBusy(true);
    try {
      const params = new URLSearchParams({ userId });
      const r = await fetch(`/api/admin/users/subscription-support?${params.toString()}`);
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || 'subscription_load_failed');
      setSubscriptionData(j.support as SubscriptionSupportData);
    } catch (e: any) {
      setSubscriptionData(null);
      setNotice({ type: 'error', message: e?.message || 'Failed to load subscription details.' });
    } finally {
      setSubscriptionBusy(false);
    }
  }

  async function loadModeration(userId: string) {
    setModerationBusy(true);
    try {
      const params = new URLSearchParams({ userId });
      const r = await fetch(`/api/admin/users/moderation?${params.toString()}`);
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || 'moderation_load_failed');
      setModerationData(j);
      setModerationReason('');
      setModerationDetails('');
    } catch (e: any) {
      setModerationData(null);
      setNotice({ type: 'error', message: e?.message || 'Failed to load moderation details.' });
    } finally {
      setModerationBusy(false);
    }
  }

  React.useEffect(() => {
    if (!selectedUserId) {
      setModerationData(null);
      setSubscriptionData(null);
      return;
    }
    loadSubscription(selectedUserId);
    loadModeration(selectedUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId]);

  async function runModerationAction(actionType: ModerationActionType) {
    if (!selectedUserId) return;
    if (!moderationReason.trim() || moderationReason.trim().length < 3) {
      setNotice({ type: 'info', message: 'Add a short moderation reason first.' });
      return;
    }
    setModerationBusy(true);
    setNotice(null);
    try {
      const r = await fetch('/api/admin/users/moderation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUserId,
          actionType,
          reason: moderationReason,
          details: moderationDetails,
          bannedUntil: actionType === 'ban' ? buildBanUntil(moderationBanDuration) : null,
        }),
      });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || 'moderation_update_failed');
      setNotice({ type: 'success', message: `${actionType} saved.` });
      await loadModeration(selectedUserId);
    } catch (e: any) {
      setNotice({ type: 'error', message: e?.message || 'Failed to save moderation action.' });
    } finally {
      setModerationBusy(false);
    }
  }

  async function setPro(userId: string, pro: boolean) {
    const current = rows.find((r) => r.id === userId);
    setToggleBusyKey(`pro:${userId}`);
    setNotice(null);
    setVerificationLink(null);
    patchRow(userId, { pro });
    try {
      const r = await fetch('/api/admin/users/pro', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, pro }),
      });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || 'update_failed');
      patchRow(userId, {
        pro: j?.profile?.is_pro ?? pro,
        pro_plan: j?.profile?.pro_plan ?? (pro ? 'manual' : null),
        pro_since: j?.profile?.pro_since ?? current?.pro_since ?? null,
      });
      setNotice({ type: 'success', message: `Pro status updated for ${current?.email || userId}.` });
      if (selectedUserId === userId) await loadSubscription(userId);
      await loadUsers(q, 1);
    } catch (e: any) {
      patchRow(userId, {
        pro: !!current?.pro,
        pro_plan: current?.pro_plan ?? null,
        pro_since: current?.pro_since ?? null,
      });
      setNotice({ type: 'error', message: e?.message || 'Failed to update Pro status.' });
    } finally {
      setToggleBusyKey(null);
    }
  }

  async function setBilling(userId: string, active: boolean) {
    const current = rows.find((r) => r.id === userId);
    setToggleBusyKey(`billing:${userId}`);
    setNotice(null);
    patchRow(userId, { billing_active: active });
    try {
      const r = await fetch('/api/admin/users/billing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, active }),
      });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || 'update_failed');
      setNotice({ type: 'success', message: `Billing flag updated for ${current?.email || userId}.` });
      await loadUsers(q, 1);
    } catch (e: any) {
      patchRow(userId, { billing_active: !!current?.billing_active });
      setNotice({ type: 'error', message: e?.message || 'Failed to update billing flag.' });
    } finally {
      setToggleBusyKey(null);
    }
  }

  async function resendVerification(userId: string) {
    track(
      'ui_click',
      {
        area: 'admin',
        action: 'resend_verification',
        job: 'resend_verification',
        target_user_id: userId,
      },
      {
        userId: user?.id || null,
        isPro: isPro,
      }
    );

    setActionBusy('resend');
    setNotice(null);
    try {
      const r = await fetch('/api/admin/users/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || 'resend_failed');
      setVerificationLink(j?.action_link || null);
      setNotice({ type: 'success', message: j?.message || 'Verification link generated.' });
    } catch (e: any) {
      setVerificationLink(null);
      setNotice({ type: 'error', message: e?.message || 'Failed to generate verification link.' });
    } finally {
      setActionBusy(null);
    }
  }

  async function exportGDPR(userId: string) {
    track(
      'ui_click',
      {
        area: 'admin',
        action: 'gdpr_export',
        job: 'gdpr_export',
        target_user_id: userId,
      },
      {
        userId: user?.id || null,
        isPro: isPro,
      }
    );

    setActionBusy('export');
    setNotice(null);
    try {
      const r = await fetch('/api/admin/users/gdpr-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || 'export_failed');

      const blob = new Blob([JSON.stringify(j.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = j.filename || `gdpr-export-${userId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setNotice({ type: 'success', message: 'GDPR export downloaded.' });
    } catch (e: any) {
      setNotice({ type: 'error', message: e?.message || 'Failed to export data.' });
    } finally {
      setActionBusy(null);
    }
  }

  async function deleteGDPR(userId: string) {
    track(
      'ui_click',
      {
        area: 'admin',
        action: 'gdpr_delete',
        job: 'gdpr_delete',
        target_user_id: userId,
      },
      {
        userId: user?.id || null,
        isPro: isPro,
      }
    );

    const confirm1 = prompt('Type "DELETE" to confirm GDPR account deletion:');
    if (confirm1 !== 'DELETE') {
      if (confirm1 !== null) setNotice({ type: 'info', message: 'Deletion cancelled.' });
      return;
    }

    if (!confirm('Are you absolutely sure? This will permanently delete the account and all associated data. This action cannot be undone.')) {
      return;
    }

    setActionBusy('delete');
    setNotice(null);
    try {
      const r = await fetch('/api/admin/users/gdpr-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, confirm: 'DELETE' }),
      });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || 'delete_failed');
      setVerificationLink(null);
      setNotice({ type: 'success', message: j?.message || 'Account deleted.' });
      if (selectedUserId === userId) setSelectedUserId(null);
      await loadUsers(q, 1);
    } catch (e: any) {
      setNotice({ type: 'error', message: e?.message || 'Failed to delete account.' });
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div className="text-xl font-semibold">User Support</div>
      <ELI5
        heading="User Support"
        items={[
          'Scrollable list of users with email, decks, Pro status (profile + RevenueCat), Stripe, last sign-in.',
          'Select a user to load subscription support: live RevenueCat entitlements, store subs, TRANSFER/webhook history, mismatch flags.',
          'Toggle manual Pro or billing flags for refunds; use moderation and GDPR actions below.',
        ]}
      />

      {notice && (
        <div
          className={`rounded border px-3 py-2 text-sm ${
            notice.type === 'success'
              ? 'border-emerald-700 bg-emerald-950/40 text-emerald-200'
              : notice.type === 'error'
                ? 'border-red-700 bg-red-950/40 text-red-200'
                : 'border-blue-700 bg-blue-950/40 text-blue-200'
          }`}
        >
          {notice.message}
        </div>
      )}

      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">
          User List{' '}
          <HelpTip text="Users load on page open. Search filters across recent signups. Toggle Pro/Billing, then select for account actions." />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="email, id, username"
            className="flex-1 min-w-[200px] bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm"
          />
          <button onClick={search} disabled={busy} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm">
            Search
          </button>
          {!q && (
            <button
              onClick={() => loadUsers('', page + 1)}
              disabled={busy || !hasMore}
              className="px-3 py-1.5 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-sm"
            >
              Load more
            </button>
          )}
        </div>
        <div className="overflow-auto max-h-[60vh] border border-neutral-800 rounded">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-neutral-900 z-10">
              <tr>
                <th className="text-left py-2 px-2 font-medium">
                  <button type="button" onClick={() => toggleSort('username')} className="inline-flex items-center gap-1 hover:text-white">
                    User <span className="text-[10px] text-neutral-500">{sortIndicator('username')}</span>
                  </button>
                </th>
                <th className="text-left py-2 px-2 font-medium">
                  <button type="button" onClick={() => toggleSort('email')} className="inline-flex items-center gap-1 hover:text-white">
                    Email <span className="text-[10px] text-neutral-500">{sortIndicator('email')}</span>
                  </button>
                </th>
                <th className="text-left py-2 px-2 font-medium">
                  <button type="button" onClick={() => toggleSort('created_at')} className="inline-flex items-center gap-1 hover:text-white">
                    Created <span className="text-[10px] text-neutral-500">{sortIndicator('created_at')}</span>
                  </button>
                </th>
                <th className="text-left py-2 px-2 font-medium">
                  <button type="button" onClick={() => toggleSort('last_sign_in_at')} className="inline-flex items-center gap-1 hover:text-white">
                    Last sign-in <span className="text-[10px] text-neutral-500">{sortIndicator('last_sign_in_at')}</span>
                  </button>
                </th>
                <th className="text-left py-2 px-2 font-medium">
                  <button type="button" onClick={() => toggleSort('deck_count')} className="inline-flex items-center gap-1 hover:text-white">
                    Decks <span className="text-[10px] text-neutral-500">{sortIndicator('deck_count')}</span>
                  </button>
                </th>
                <th className="text-left py-2 px-2 font-medium">
                  <button type="button" onClick={() => toggleSort('pro')} className="inline-flex items-center gap-1 hover:text-white">
                    Pro <span className="text-[10px] text-neutral-500">{sortIndicator('pro')}</span>
                  </button>
                </th>
                <th className="text-left py-2 px-2 font-medium">
                  <button type="button" onClick={() => toggleSort('billing_active')} className="inline-flex items-center gap-1 hover:text-white">
                    Billing <span className="text-[10px] text-neutral-500">{sortIndicator('billing_active')}</span>
                  </button>
                </th>
                <th className="text-left py-2 px-2 font-medium">
                  <button type="button" onClick={() => toggleSort('stripe_subscription_id')} className="inline-flex items-center gap-1 hover:text-white">
                    Stripe <span className="text-[10px] text-neutral-500">{sortIndicator('stripe_subscription_id')}</span>
                  </button>
                </th>
                <th className="text-left py-2 px-2 font-medium">Select</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((u) => (
                <tr key={u.id} className="border-t border-neutral-800 hover:bg-neutral-900/50">
                  <td className="py-1.5 px-2">{u.username || u.display_name || '-'}</td>
                  <td className="py-1.5 px-2 text-neutral-300">{u.email || '-'}</td>
                  <td className="py-1.5 px-2 text-xs text-neutral-500">{fmt(u.created_at)}</td>
                  <td className="py-1.5 px-2 text-xs text-neutral-500">{fmt(u.last_sign_in_at)}</td>
                  <td className="py-1.5 px-2 tabular-nums">{u.deck_count ?? 0}</td>
                  <td className="py-1.5 px-2">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!u.pro}
                        disabled={toggleBusyKey === `pro:${u.id}`}
                        onChange={(e) => setPro(u.id, e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-xs">{u.pro ? 'Pro' : 'Free'}</span>
                      {u.pro && u.pro_plan ? (
                        <span className="text-[10px] text-amber-300 uppercase tracking-wide">{u.pro_plan}</span>
                      ) : null}
                    </label>
                  </td>
                  <td className="py-1.5 px-2">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!u.billing_active}
                        disabled={toggleBusyKey === `billing:${u.id}`}
                        onChange={(e) => setBilling(u.id, e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-xs">{u.billing_active ? 'On' : 'Off'}</span>
                    </label>
                  </td>
                  <td className="py-1.5 px-2 text-xs font-mono text-neutral-500">{u.stripe_subscription_id ? 'yes' : '-'}</td>
                  <td className="py-1.5 px-2">
                    <button
                      onClick={() => {
                        setSelectedUserId(u.id);
                        setVerificationLink(null);
                        setNotice(null);
                      }}
                      className={`text-xs px-2 py-1 rounded ${selectedUserId === u.id ? 'bg-blue-600 text-white' : 'bg-neutral-800 hover:bg-neutral-700'}`}
                    >
                      {selectedUserId === u.id ? 'Selected' : 'Select'}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !busy && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-neutral-500">
                    No users found
                  </td>
                </tr>
              )}
              {rows.length === 0 && busy && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-neutral-500">
                    Loading...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-neutral-500">
          Showing {rows.length} users {hasMore && !q && '- click "Load more" for the next page'}
        </div>
      </section>

      <section className="rounded border border-neutral-800 p-3 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="font-medium">Account Actions, GDPR & Moderation</div>
          <a href="/admin/moderation" className="text-sm text-blue-400 hover:text-blue-300 underline">
            Open moderation queue
          </a>
        </div>
        {!selectedUserId ? (
          <div className="text-sm opacity-70">Select a user from search results above to perform actions.</div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-neutral-400">
              Selected: <span className="font-mono">{selectedUserId}</span>
              {selectedUser?.email ? <span className="ml-2 text-neutral-300">{selectedUser.email}</span> : null}
              <button onClick={() => setSelectedUserId(null)} className="ml-2 text-blue-400 hover:text-blue-300 text-xs underline">
                Clear
              </button>
            </div>

            {selectedUser && (
              <div className="grid gap-2 rounded border border-neutral-800 bg-neutral-950/40 p-3 text-xs text-neutral-300 sm:grid-cols-2">
                <div>Username: <span className="text-neutral-100">{selectedUser.username || selectedUser.display_name || '-'}</span></div>
                <div>Last sign-in: <span className="text-neutral-100">{fmt(selectedUser.last_sign_in_at)}</span></div>
                <div>List tier: <span className="text-neutral-100">{selectedUser.pro ? `Pro${selectedUser.pro_plan ? ` (${selectedUser.pro_plan})` : ''}` : 'Free'}</span></div>
                <div>Decks: <span className="text-neutral-100">{selectedUser.deck_count ?? 0}</span></div>
                {selectedUser.pro_until ? (
                  <div className="sm:col-span-2">Profile pro_until: <span className="text-neutral-100">{fmt(selectedUser.pro_until)}</span></div>
                ) : null}
              </div>
            )}

            <div className="rounded border border-amber-900/50 bg-amber-950/20 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="font-medium text-sm text-amber-100">
                  Subscriptions & entitlements{' '}
                  <HelpTip text="Live RevenueCat + Supabase profile resolution, store subscriptions, and recent TRANSFER / EXPIRATION / RENEWAL webhook audit rows." />
                </div>
                {selectedUserId ? (
                  <button
                    type="button"
                    onClick={() => loadSubscription(selectedUserId)}
                    disabled={subscriptionBusy}
                    className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-60 text-xs"
                  >
                    {subscriptionBusy ? 'Refreshing…' : 'Refresh'}
                  </button>
                ) : null}
              </div>

              {subscriptionBusy && !subscriptionData ? (
                <div className="text-sm text-neutral-400">Loading subscription details…</div>
              ) : subscriptionData ? (
                <div className="space-y-3 text-xs text-neutral-300">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 font-medium ${
                        subscriptionData.debug.finalIsPro
                          ? 'bg-emerald-900/60 text-emerald-200'
                          : 'bg-neutral-800 text-neutral-300'
                      }`}
                    >
                      Effective: {subscriptionData.debug.finalIsPro ? 'Pro' : 'Free'}
                    </span>
                    {subscriptionData.debug.sources.length > 0 ? (
                      <span className="text-neutral-500">
                        Sources: {subscriptionData.debug.sources.join(', ')}
                      </span>
                    ) : (
                      <span className="text-neutral-500">No active entitlement sources</span>
                    )}
                    {subscriptionData.revenueCatCustomerUrl ? (
                      <a
                        href={subscriptionData.revenueCatCustomerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:text-blue-300 underline"
                      >
                        Open in RevenueCat
                      </a>
                    ) : null}
                  </div>

                  {subscriptionData.debug.mismatchFlags.length > 0 ? (
                    <div className="rounded border border-amber-700/60 bg-amber-950/30 p-2 space-y-1">
                      <div className="font-medium text-amber-200">Mismatch flags</div>
                      {subscriptionData.debug.mismatchFlags.map((flag) => (
                        <div key={flag} className="text-amber-100/90">
                          • {flag}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded border border-neutral-800 bg-neutral-950/50 p-2">
                      <div className="font-medium text-neutral-100 mb-1">Supabase profile</div>
                      <div>is_pro: {subscriptionData.debug.profile.is_pro ? 'true' : 'false'}</div>
                      <div>pro_plan: {subscriptionData.debug.profile.pro_plan || '-'}</div>
                      <div>pro_until: {fmt(subscriptionData.debug.profile.pro_until)}</div>
                      <div>
                        Stripe:{' '}
                        {subscriptionData.debug.profile.has_stripe_subscription
                          ? subscriptionData.debug.profile.stripe_subscription_status || 'linked'
                          : 'none'}
                      </div>
                    </div>
                    <div className="rounded border border-neutral-800 bg-neutral-950/50 p-2">
                      <div className="font-medium text-neutral-100 mb-1">RevenueCat API</div>
                      <div>RC active: {subscriptionData.debug.fromRevenueCat ? 'yes' : 'no'}</div>
                      <div>HTTP: {subscriptionData.debug.revenueCatDebug.httpStatus ?? '-'}</div>
                      <div>Subscriber: {subscriptionData.debug.revenueCatDebug.subscriberPresent ? 'yes' : 'no'}</div>
                      <div>
                        Entitlements:{' '}
                        {subscriptionData.debug.revenueCatDebug.entitlementKeys.length
                          ? subscriptionData.debug.revenueCatDebug.entitlementKeys.join(', ')
                          : 'none'}
                      </div>
                      {subscriptionData.debug.revenueCatDebug.error ? (
                        <div className="text-red-300 mt-1">{subscriptionData.debug.revenueCatDebug.error}</div>
                      ) : null}
                    </div>
                    <div className="rounded border border-neutral-800 bg-neutral-950/50 p-2">
                      <div className="font-medium text-neutral-100 mb-1">Auth providers</div>
                      {subscriptionData.identities.length === 0 ? (
                        <div className="text-neutral-500">No linked identities</div>
                      ) : (
                        subscriptionData.identities.map((identity) => (
                          <div key={identity.id}>
                            {identity.provider} · {fmt(identity.created_at)}
                          </div>
                        ))
                      )}
                      {subscriptionData.revenueCat.originalAppUserId ? (
                        <div className="mt-1 text-neutral-500 break-all">
                          RC original id: {subscriptionData.revenueCat.originalAppUserId}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {subscriptionData.revenueCat.fetchError ? (
                    <div className="text-red-300">RevenueCat detail fetch: {subscriptionData.revenueCat.fetchError}</div>
                  ) : null}

                  {subscriptionData.revenueCat.subscriptions.length > 0 ? (
                    <div className="rounded border border-neutral-800 bg-neutral-950/40 p-2 space-y-2">
                      <div className="font-medium text-neutral-100">Store subscriptions (RevenueCat)</div>
                      {subscriptionData.revenueCat.subscriptions.map((sub) => (
                        <div key={sub.productId} className="rounded border border-neutral-800 p-2">
                          <div className="flex flex-wrap gap-x-3 gap-y-1">
                            <span className="text-neutral-100 font-mono">{sub.productId}</span>
                            <span className="uppercase text-[10px] tracking-wide text-neutral-500">
                              {sub.store || 'store?'}
                              {sub.isSandbox ? ' · sandbox' : ''}
                            </span>
                          </div>
                          <div>Expires: {fmt(sub.expiresDate)}</div>
                          {sub.unsubscribeDetectedAt ? (
                            <div className="text-amber-200">Cancelled: {fmt(sub.unsubscribeDetectedAt)}</div>
                          ) : null}
                          {sub.billingIssuesDetectedAt ? (
                            <div className="text-red-300">Billing issue: {fmt(sub.billingIssuesDetectedAt)}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-neutral-500">No store subscription rows in RevenueCat for this customer.</div>
                  )}

                  {subscriptionData.revenueCat.entitlements.length > 0 ? (
                    <div className="rounded border border-neutral-800 bg-neutral-950/40 p-2 space-y-1">
                      <div className="font-medium text-neutral-100">Entitlements</div>
                      {subscriptionData.revenueCat.entitlements.map((ent) => (
                        <div key={ent.id} className="flex flex-wrap gap-2">
                          <span className={ent.active ? 'text-emerald-300' : 'text-neutral-500'}>
                            {ent.id} — {ent.active ? 'active' : 'inactive'}
                          </span>
                          {ent.productId ? <span className="text-neutral-500">{ent.productId}</span> : null}
                          {ent.expiresDate ? <span>until {fmt(ent.expiresDate)}</span> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="rounded border border-neutral-800 bg-neutral-950/40 p-2 space-y-2">
                    <div className="font-medium text-neutral-100">Recent billing webhooks (audit)</div>
                    {subscriptionData.billingEvents.length === 0 ? (
                      <div className="text-neutral-500">No RevenueCat/Stripe ops events logged for this user.</div>
                    ) : (
                      <div className="overflow-auto max-h-48">
                        <table className="min-w-full text-[11px]">
                          <thead>
                            <tr className="text-neutral-500 text-left">
                              <th className="py-1 pr-2">When</th>
                              <th className="py-1 pr-2">Event</th>
                              <th className="py-1 pr-2">Store</th>
                              <th className="py-1 pr-2">Status</th>
                              <th className="py-1 pr-2">Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {subscriptionData.billingEvents.map((ev) => (
                              <tr
                                key={`${ev.created_at}-${ev.eventId || ev.source}-${ev.reason}`}
                                className={`border-t border-neutral-800 ${
                                  ev.isTransfer ? 'bg-violet-950/30' : ev.isTransferRevoke ? 'bg-red-950/20' : ''
                                }`}
                              >
                                <td className="py-1 pr-2 whitespace-nowrap">{fmt(ev.created_at)}</td>
                                <td className="py-1 pr-2">
                                  {ev.isTransfer ? '🔁 TRANSFER' : ev.source || ev.action}
                                </td>
                                <td className="py-1 pr-2">
                                  {ev.store || '-'}
                                  {ev.environment ? (
                                    <span className="text-neutral-500"> · {ev.environment}</span>
                                  ) : null}
                                </td>
                                <td className="py-1 pr-2">{ev.status || '-'}</td>
                                <td className="py-1 pr-2 text-neutral-400">
                                  {ev.reason || '-'}
                                  {ev.eventId ? (
                                    <span className="block font-mono text-[10px] text-neutral-600">{ev.eventId}</span>
                                  ) : null}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-neutral-400">Subscription details unavailable.</div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => resendVerification(selectedUserId)}
                disabled={actionBusy !== null}
                className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-sm"
              >
                {actionBusy === 'resend' ? 'Generating...' : 'Generate Verification Link'}
              </button>

              <button
                onClick={() => exportGDPR(selectedUserId)}
                disabled={actionBusy !== null}
                className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-500 disabled:opacity-60 disabled:cursor-not-allowed text-sm"
              >
                {actionBusy === 'export' ? 'Exporting...' : 'Export GDPR Data'}
              </button>

              <button
                onClick={() => deleteGDPR(selectedUserId)}
                disabled={actionBusy !== null}
                className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 disabled:opacity-60 disabled:cursor-not-allowed text-sm"
              >
                {actionBusy === 'delete' ? 'Deleting...' : 'Delete Account (GDPR)'}
              </button>
            </div>

            {verificationLink && (
              <div className="rounded border border-neutral-800 bg-neutral-950/50 p-3 space-y-2">
                <div className="text-xs text-neutral-300">Manual verification/sign-in link</div>
                <div className="break-all rounded bg-neutral-900 px-2 py-2 text-xs text-neutral-400">{verificationLink}</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(verificationLink);
                        setNotice({ type: 'success', message: 'Verification link copied.' });
                      } catch {
                        setNotice({ type: 'error', message: 'Could not copy verification link.' });
                      }
                    }}
                    className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-xs"
                  >
                    Copy Link
                  </button>
                  <a
                    href={verificationLink}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-xs"
                  >
                    Open Link
                  </a>
                </div>
              </div>
            )}

            <div className="rounded border border-neutral-800 bg-neutral-950/40 p-3 space-y-3">
              <div className="font-medium text-sm">Moderation</div>
              {moderationBusy && !moderationData ? (
                <div className="text-sm text-neutral-400">Loading moderation details...</div>
              ) : moderationData ? (
                <>
                  <div className="grid gap-2 text-xs text-neutral-300 sm:grid-cols-2 lg:grid-cols-4">
                    <div>Warnings: <span className="text-neutral-100">{moderationData.status.warning_count}</span></div>
                    <div>Ban: <span className="text-neutral-100">{moderationData.status.active_ban ? (moderationData.status.banned_until ? `Until ${fmt(moderationData.status.banned_until)}` : 'Permanent') : 'Not banned'}</span></div>
                    <div>Open reports: <span className="text-neutral-100">{moderationData.reportCounts.open}</span></div>
                    <div>Total reports: <span className="text-neutral-100">{moderationData.reportCounts.total}</span></div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="space-y-2">
                      <label className="block text-xs text-neutral-400">Moderation reason</label>
                      <input
                        value={moderationReason}
                        onChange={(e) => setModerationReason(e.target.value)}
                        className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                        placeholder="Harassment in public comments"
                      />
                      <label className="block text-xs text-neutral-400">Internal detail</label>
                      <textarea
                        value={moderationDetails}
                        onChange={(e) => setModerationDetails(e.target.value)}
                        rows={4}
                        className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                        placeholder="What happened, what warning was sent, any follow-up..."
                      />
                      <div className="flex flex-wrap gap-2 items-center">
                        <select
                          value={moderationBanDuration}
                          onChange={(e) => setModerationBanDuration(e.target.value as '7' | '30' | 'permanent')}
                          className="rounded border border-neutral-700 bg-neutral-950 px-2 py-2 text-sm"
                        >
                          <option value="7">Ban 7d</option>
                          <option value="30">Ban 30d</option>
                          <option value="permanent">Permanent ban</option>
                        </select>
                        <button
                          onClick={() => runModerationAction('warn')}
                          disabled={moderationBusy}
                          className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-sm"
                        >
                          Warn
                        </button>
                        <button
                          onClick={() => runModerationAction('note')}
                          disabled={moderationBusy}
                          className="px-3 py-1.5 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-60 text-sm"
                        >
                          Add note
                        </button>
                        <button
                          onClick={() => runModerationAction('ban')}
                          disabled={moderationBusy}
                          className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 disabled:opacity-60 text-sm"
                        >
                          Ban
                        </button>
                        <button
                          onClick={() => runModerationAction('unban')}
                          disabled={moderationBusy}
                          className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 text-sm"
                        >
                          Unban
                        </button>
                      </div>
                    </div>

                    <div className="rounded border border-neutral-800 bg-neutral-950/40 p-3 text-xs text-neutral-300 space-y-2">
                      <div className="font-medium text-neutral-100">Recent reports</div>
                      {moderationData.recentReports.length === 0 ? (
                        <div className="text-neutral-500">No reports for this user yet.</div>
                      ) : (
                        moderationData.recentReports.slice(0, 5).map((report) => (
                          <div key={report.id} className="rounded border border-neutral-800 p-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-neutral-100">{report.reason}</span>
                              <span className="uppercase tracking-wide text-[10px] text-neutral-500">{report.status}</span>
                            </div>
                            <div className="text-neutral-500 mt-1">{report.subject_type} · {report.resource_type || 'n/a'}</div>
                            <div className="text-neutral-500">{fmt(report.created_at)}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded border border-neutral-800 bg-neutral-950/40 p-3 text-xs text-neutral-300 space-y-2">
                      <div className="font-medium text-neutral-100">Recent actions</div>
                      {moderationData.recentActions.length === 0 ? (
                        <div className="text-neutral-500">No moderation actions yet.</div>
                      ) : (
                        moderationData.recentActions.slice(0, 5).map((action) => (
                          <div key={action.id} className="rounded border border-neutral-800 p-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="uppercase tracking-wide text-neutral-100">{action.action_type}</span>
                              <span className="text-neutral-500">{fmt(action.created_at)}</span>
                            </div>
                            <div className="mt-1">{action.reason}</div>
                            {action.details ? <div className="mt-1 text-neutral-500">{action.details}</div> : null}
                          </div>
                        ))
                      )}
                    </div>
                    <div className="rounded border border-neutral-800 bg-neutral-950/40 p-3 text-xs text-neutral-300">
                      <div className="font-medium text-neutral-100 mb-2">Last moderation state</div>
                      <div>Last action: <span className="text-neutral-100">{moderationData.status.last_action_type || '-'}</span></div>
                      <div className="mt-1">Last reason: <span className="text-neutral-100">{moderationData.status.last_reason || '-'}</span></div>
                      <div className="mt-1">Updated: <span className="text-neutral-100">{fmt(moderationData.status.updated_at)}</span></div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-sm text-neutral-400">Moderation details unavailable.</div>
              )}
            </div>

            <div className="text-xs text-red-400 border-t border-neutral-800 pt-2 mt-2">
              Warning: Delete Account permanently removes all user data including decks, collections, chat history, and profile. This cannot be undone.
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
