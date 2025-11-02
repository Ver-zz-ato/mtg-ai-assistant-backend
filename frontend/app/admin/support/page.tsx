'use client';
import React from 'react';
import { ELI5, HelpTip } from '@/components/AdminHelp';

export default function SupportPage(){
  const [q, setQ] = React.useState('');
  const [rows, setRows] = React.useState<any[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);
  const [actionBusy, setActionBusy] = React.useState<string | null>(null);

  async function search(){ setBusy(true); try { const r = await fetch(`/api/admin/users/search?q=${encodeURIComponent(q)}`); const j = await r.json(); if (!r.ok || j?.ok===false) throw new Error(j?.error||'search_failed'); setRows(j.users||[]);} catch(e:any){ alert(e?.message||'failed'); setRows([]);} finally{ setBusy(false);} }
  async function setPro(userId: string, pro: boolean){ try { const r = await fetch('/api/admin/users/pro', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ userId, pro }) }); const j = await r.json(); if(!r.ok||j?.ok===false) throw new Error(j?.error||'update_failed'); alert('Updated'); } catch(e:any){ alert(e?.message||'failed'); } }
  async function setBilling(userId: string, active: boolean){ try { const r = await fetch('/api/admin/users/billing', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ userId, active }) }); const j = await r.json(); if(!r.ok||j?.ok===false) throw new Error(j?.error||'update_failed'); alert('Updated'); } catch(e:any){ alert(e?.message||'failed'); } }

  async function resendVerification(userId: string) {
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
      // Refresh search to remove deleted user
      if (q) search();
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
        'Quickly find a user by email, id, or username.',
        'Toggle their Pro status if they need access or a refund fix.',
        'Future: GDPR actions (export/delete) and credit adjustments.'
      ]} />

      {/* User lookup */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">User Lookup (read‑only) <HelpTip text="Search users and toggle Pro. Other actions to be added here later (verification resend, GDPR)." /></div>
        <div className="flex gap-2">
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="email, id, username" className="flex-1 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm"/>
          <button onClick={search} disabled={busy} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm">Search</button>
        </div>
        <div className="overflow-auto max-h-80">
          <table className="min-w-full text-sm"><thead><tr><th className="text-left py-1 px-2">User</th><th className="text-left py-1 px-2">Email</th><th className="text-left py-1 px-2">ID</th><th className="text-left py-1 px-2">Pro</th><th className="text-left py-1 px-2">Billing</th><th className="text-left py-1 px-2">Select</th></tr></thead><tbody>
            {rows.map(u=> (
              <tr key={u.id} className="border-t border-neutral-900">
                <td className="py-1 px-2">{u.username||'—'}</td>
                <td className="py-1 px-2">{u.email||'—'}</td>
                <td className="py-1 px-2 font-mono text-xs">{u.id}</td>
                <td className="py-1 px-2"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!u.pro} onChange={e=>setPro(u.id, e.target.checked)}/> <span className="text-xs opacity-80">{u.pro?'Enabled':'Disabled'}</span></label></td>
                <td className="py-1 px-2"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!u.billing_active} onChange={e=>setBilling(u.id, e.target.checked)}/> <span className="text-xs opacity-80">{u.billing_active?'Active':'Off'}</span></label></td>
                <td className="py-1 px-2">
                  <button 
                    onClick={() => setSelectedUserId(u.id)}
                    className={`text-xs px-2 py-1 rounded ${selectedUserId === u.id ? 'bg-blue-600 text-white' : 'bg-neutral-800 hover:bg-neutral-700'}`}
                  >
                    {selectedUserId === u.id ? 'Selected' : 'Select'}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length===0 && <tr><td colSpan={6} className="py-3 text-center opacity-70">No results</td></tr>}
          </tbody></table>
        </div>
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
