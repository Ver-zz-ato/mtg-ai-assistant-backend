'use client';
import React from 'react';
import { ELI5, HelpTip } from '@/components/AdminHelp';

export default function SupportPage(){
  const [q, setQ] = React.useState('');
  const [rows, setRows] = React.useState<any[]>([]);
  const [busy, setBusy] = React.useState(false);

  async function search(){ setBusy(true); try { const r = await fetch(`/api/admin/users/search?q=${encodeURIComponent(q)}`); const j = await r.json(); if (!r.ok || j?.ok===false) throw new Error(j?.error||'search_failed'); setRows(j.users||[]);} catch(e:any){ alert(e?.message||'failed'); setRows([]);} finally{ setBusy(false);} }
  async function setPro(userId: string, pro: boolean){ try { const r = await fetch('/api/admin/users/pro', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ userId, pro }) }); const j = await r.json(); if(!r.ok||j?.ok===false) throw new Error(j?.error||'update_failed'); alert('Updated'); } catch(e:any){ alert(e?.message||'failed'); } }
  async function setBilling(userId: string, active: boolean){ try { const r = await fetch('/api/admin/users/billing', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ userId, active }) }); const j = await r.json(); if(!r.ok||j?.ok===false) throw new Error(j?.error||'update_failed'); alert('Updated'); } catch(e:any){ alert(e?.message||'failed'); } }

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
          <table className="min-w-full text-sm"><thead><tr><th className="text-left py-1 px-2">User</th><th className="text-left py-1 px-2">Email</th><th className="text-left py-1 px-2">ID</th><th className="text-left py-1 px-2">Pro</th><th className="text-left py-1 px-2">Billing</th></tr></thead><tbody>
            {rows.map(u=> (
              <tr key={u.id} className="border-t border-neutral-900"><td className="py-1 px-2">{u.username||'—'}</td><td className="py-1 px-2">{u.email||'—'}</td><td className="py-1 px-2 font-mono text-xs">{u.id}</td><td className="py-1 px-2"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!u.pro} onChange={e=>setPro(u.id, e.target.checked)}/> <span className="text-xs opacity-80">{u.pro?'Enabled':'Disabled'}</span></label></td><td className="py-1 px-2"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!u.billing_active} onChange={e=>setBilling(u.id, e.target.checked)}/> <span className="text-xs opacity-80">{u.billing_active?'Active':'Off'}</span></label></td></tr>
            ))}
            {rows.length===0 && <tr><td colSpan={4} className="py-3 text-center opacity-70">No results</td></tr>}
          </tbody></table>
        </div>
      </section>

      {/* Placeholders for GDPR and credits */}
      <section className="rounded border border-neutral-800 p-3">
        <div className="font-medium">Account Actions & GDPR</div>
        <div className="text-sm opacity-70">Coming soon — buttons to resend verification, issue credits, and start GDPR export/delete jobs.</div>
      </section>
    </div>
  );
}
