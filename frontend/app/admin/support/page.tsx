'use client';
import React from 'react';
import { ELI5, HelpTip } from '@/components/AdminHelp';
import { track } from '@/lib/analytics/track';
import { useAuth } from '@/lib/auth-context';
import { useProStatus } from '@/hooks/useProStatus';

type Notice = { type: 'success' | 'error' | 'info'; message: string };
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
          'Scrollable list of users with detailed info: email, decks, Pro status, Stripe, last sign-in.',
          'Search by email, id, or username. Toggle Pro/Billing for access or refund fixes.',
          'Select a user for account actions: generate a verification link, export data, or delete account.',
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
        <div className="font-medium">Account Actions & GDPR</div>
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
                <div>Tier: <span className="text-neutral-100">{selectedUser.pro ? `Pro${selectedUser.pro_plan ? ` (${selectedUser.pro_plan})` : ''}` : 'Free'}</span></div>
                <div>Decks: <span className="text-neutral-100">{selectedUser.deck_count ?? 0}</span></div>
              </div>
            )}

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

            <div className="text-xs text-red-400 border-t border-neutral-800 pt-2 mt-2">
              Warning: Delete Account permanently removes all user data including decks, collections, chat history, and profile. This cannot be undone.
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
