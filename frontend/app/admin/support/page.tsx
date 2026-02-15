'use client';
import React from 'react';
import { ELI5, HelpTip } from '@/components/AdminHelp';
import { track } from '@/lib/analytics/track';
import { useAuth } from '@/lib/auth-context';
import { useProStatus } from '@/hooks/useProStatus';

function fmt(d: string | null) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

export default function SupportPage(){
  const [q, setQ] = React.useState('');
  const [rows, setRows] = React.useState<any[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(false);
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);
  const [actionBusy, setActionBusy] = React.useState<string | null>(null);
  const { user } = useAuth();
  const { isPro } = useProStatus();

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
      else setRows(prev => [...prev, ...users]);
      setHasMore(!!j.hasMore);
      setPage(pageNum);
    } catch (e: any) {
      alert(e?.message || 'Failed');
      if (pageNum === 1) setRows([]);
    } finally {
      setBusy(false);
    }
  }

  function search() { loadUsers(q, 1); }

  React.useEffect(() => {
    loadUsers('', 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setPro(userId: string, pro: boolean){ try { const r = await fetch('/api/admin/users/pro', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ userId, pro }) }); const j = await r.json(); if(!r.ok||j?.ok===false) throw new Error(j?.error||'update_failed'); alert('Updated'); loadUsers(q, 1); } catch(e:any){ alert(e?.message||'failed'); } }
  async function setBilling(userId: string, active: boolean){ try { const r = await fetch('/api/admin/users/billing', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ userId, active }) }); const j = await r.json(); if(!r.ok||j?.ok===false) throw new Error(j?.error||'update_failed'); alert('Updated'); loadUsers(q, 1); } catch(e:any){ alert(e?.message||'failed'); } }

  async function resendVerification(userId: string) {
    // Track UI click
    track('ui_click', {
      area: 'admin',
      action: 'resend_verification',
      job: 'resend_verification',
      target_user_id: userId,
    }, {
      userId: user?.id || null,
      isPro: isPro,
    });
    
    setActionBusy('resend');
    try {
      const r = await fetch('/api/admin/users/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || 'resend_failed');
      alert(j?.message || 'Verification email sent');
    } catch (e: any) {
      alert(e?.message || 'Failed to resend verification');
    } finally {
      setActionBusy(null);
    }
  }

  async function exportGDPR(userId: string) {
    // Track UI click
    track('ui_click', {
      area: 'admin',
      action: 'gdpr_export',
      job: 'gdpr_export',
      target_user_id: userId,
    }, {
      userId: user?.id || null,
      isPro: isPro,
    });
    
    setActionBusy('export');
    try {
      const r = await fetch('/api/admin/users/gdpr-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || 'export_failed');
      
      // Download JSON file
      const blob = new Blob([JSON.stringify(j.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = j.filename || `gdpr-export-${userId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      alert('GDPR export downloaded');
    } catch (e: any) {
      alert(e?.message || 'Failed to export data');
    } finally {
      setActionBusy(null);
    }
  }

  async function deleteGDPR(userId: string) {
    // Track UI click
    track('ui_click', {
      area: 'admin',
      action: 'gdpr_delete',
      job: 'gdpr_delete',
      target_user_id: userId,
    }, {
      userId: user?.id || null,
      isPro: isPro,
    });
    
    const confirm1 = prompt('Type "DELETE" to confirm GDPR account deletion:');
    if (confirm1 !== 'DELETE') {
      if (confirm1 !== null) alert('Deletion cancelled');
      return;
    }
    
    if (!confirm('⚠️ Are you absolutely sure? This will permanently delete the account and ALL associated data. This action CANNOT be undone.')) {
      return;
    }

    setActionBusy('delete');
    try {
      const r = await fetch('/api/admin/users/gdpr-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, confirm: 'DELETE' })
      });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || 'delete_failed');
      alert(j?.message || 'Account deleted');
      loadUsers(q, 1);
    } catch (e: any) {
      alert(e?.message || 'Failed to delete account');
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div className="text-xl font-semibold">User Support</div>
      <ELI5 heading="User Support" items={[
        'Scrollable list of users with detailed info: email, decks, Pro status, Stripe, last sign-in.',
        'Search by email, id, or username. Toggle Pro/Billing for access or refund fixes.',
        'Select a user for GDPR actions: resend verification, export data, or delete account.'
      ]} />

      {/* User lookup */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">User List <HelpTip text="Users load on page open. Search filters across recent signups. Toggle Pro/Billing, then select for GDPR actions." /></div>
        <div className="flex flex-wrap gap-2 items-center">
          <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&search()} placeholder="email, id, username" className="flex-1 min-w-[200px] bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm"/>
          <button onClick={search} disabled={busy} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm">Search</button>
          {!q && (
            <button onClick={()=>loadUsers('', page+1)} disabled={busy||!hasMore} className="px-3 py-1.5 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-sm">Load more</button>
          )}
        </div>
        <div className="overflow-auto max-h-[60vh] border border-neutral-800 rounded">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-neutral-900 z-10">
              <tr>
                <th className="text-left py-2 px-2 font-medium">User</th>
                <th className="text-left py-2 px-2 font-medium">Email</th>
                <th className="text-left py-2 px-2 font-medium">Created</th>
                <th className="text-left py-2 px-2 font-medium">Last sign-in</th>
                <th className="text-left py-2 px-2 font-medium">Decks</th>
                <th className="text-left py-2 px-2 font-medium">Pro</th>
                <th className="text-left py-2 px-2 font-medium">Billing</th>
                <th className="text-left py-2 px-2 font-medium">Stripe</th>
                <th className="text-left py-2 px-2 font-medium">Select</th>
              </tr>
            </thead>
            <tbody>
            {rows.map(u=> (
              <tr key={u.id} className="border-t border-neutral-800 hover:bg-neutral-900/50">
                <td className="py-1.5 px-2">{u.username || u.display_name || '—'}</td>
                <td className="py-1.5 px-2 text-neutral-300">{u.email||'—'}</td>
                <td className="py-1.5 px-2 text-xs text-neutral-500">{fmt(u.created_at)}</td>
                <td className="py-1.5 px-2 text-xs text-neutral-500">{fmt(u.last_sign_in_at)}</td>
                <td className="py-1.5 px-2 tabular-nums">{u.deck_count ?? 0}</td>
                <td className="py-1.5 px-2">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={!!u.pro} onChange={e=>setPro(u.id, e.target.checked)} className="rounded"/>
                    <span className="text-xs">{u.pro?'Pro':'Free'}</span>
                  </label>
                </td>
                <td className="py-1.5 px-2">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={!!u.billing_active} onChange={e=>setBilling(u.id, e.target.checked)} className="rounded"/>
                    <span className="text-xs">{u.billing_active?'On':'Off'}</span>
                  </label>
                </td>
                <td className="py-1.5 px-2 text-xs font-mono text-neutral-500">{u.stripe_subscription_id ? '✓' : '—'}</td>
                <td className="py-1.5 px-2">
                  <button
                    onClick={() => setSelectedUserId(u.id)}
                    className={`text-xs px-2 py-1 rounded ${selectedUserId === u.id ? 'bg-blue-600 text-white' : 'bg-neutral-800 hover:bg-neutral-700'}`}
                  >
                    {selectedUserId === u.id ? 'Selected' : 'Select'}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length===0 && !busy && <tr><td colSpan={9} className="py-6 text-center text-neutral-500">No users found</td></tr>}
            {rows.length===0 && busy && <tr><td colSpan={9} className="py-6 text-center text-neutral-500">Loading…</td></tr>}
          </tbody>
          </table>
        </div>
        <div className="text-xs text-neutral-500">Showing {rows.length} users {hasMore && !q && '· Click "Load more" for next page'}</div>
      </section>

      {/* Account Actions & GDPR */}
      <section className="rounded border border-neutral-800 p-3 space-y-3">
        <div className="font-medium">Account Actions & GDPR</div>
        {!selectedUserId ? (
          <div className="text-sm opacity-70">Select a user from search results above to perform actions.</div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-neutral-400">
              Selected: <span className="font-mono">{selectedUserId}</span>
              <button 
                onClick={() => setSelectedUserId(null)}
                className="ml-2 text-blue-400 hover:text-blue-300 text-xs underline"
              >
                Clear
              </button>
            </div>
            
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => resendVerification(selectedUserId)}
                disabled={actionBusy !== null}
                className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-sm"
              >
                {actionBusy === 'resend' ? 'Sending...' : 'Resend Verification Email'}
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
            
            <div className="text-xs text-red-400 border-t border-neutral-800 pt-2 mt-2">
              ⚠️ Delete Account permanently removes all user data including decks, collections, chat history, and profile. Cannot be undone.
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
