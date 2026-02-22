"use client";
import React from "react";
import { ELI5 } from "@/components/AdminHelp";

type UserRow = { id: string; email: string|null; username: string|null; avatar: string|null; pro: boolean; pro_plan?: string|null; billing_active?: boolean };

export default function AdminUsersPage(){
  const [q, setQ] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [rows, setRows] = React.useState<UserRow[]>([]);
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(false);

  async function load(reset = true){
    setLoading(true);
    if (reset) setPage(1);
    try{
      const params = new URLSearchParams({ q, page: "1", perPage: "50" });
      const r = await fetch(`/api/admin/users/search?${params}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok || j?.ok===false) throw new Error(j?.error || r.statusText);
      setRows((j.users||[]) as UserRow[]);
      setHasMore(!!j.hasMore);
    } catch(e:any){
      alert(e?.message || 'failed');
      setRows([]);
    } finally { setLoading(false); }
  }

  async function loadMore(){
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try{
      const params = new URLSearchParams({ q, page: String(nextPage), perPage: "50" });
      const r = await fetch(`/api/admin/users/search?${params}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok || j?.ok===false) throw new Error(j?.error || r.statusText);
      setRows(prev => [...prev, ...(j.users||[])]);
      setHasMore(!!j.hasMore);
      setPage(nextPage);
    } catch(e:any){
      alert(e?.message || 'failed');
    } finally { setLoadingMore(false); }
  }

  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function setPro(userId: string, pro: boolean){
    const prev = rows.slice();
    setRows(rows => rows.map(r => r.id===userId? { ...r, pro }: r));
    try{
      const r = await fetch('/api/admin/users/pro', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ userId, pro }) });
      const j = await r.json();
      if (!r.ok || j?.ok===false) throw new Error(j?.error || 'update_failed');
    } catch(e:any){
      alert(e?.message || 'update failed');
      setRows(prev);
    }
  }

  async function setBilling(userId: string, active: boolean){
    const prev = rows.slice();
    setRows(rows => rows.map(r => r.id===userId? { ...r, billing_active: active }: r));
    try{
      const r = await fetch('/api/admin/users/billing', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ userId, active }) });
      const j = await r.json();
      if (!r.ok || j?.ok===false) throw new Error(j?.error || 'update_failed');
    } catch(e:any){
      alert(e?.message || 'update failed');
      setRows(prev);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-semibold">Admin • Users</h1>
      <ELI5 
        heading="User Management" 
        items={[
          "🔍 Search by email, username, or user ID",
          "✅ Pro Toggle: Manually grant/revoke Pro status (sets pro_plan='manual')",
          "💳 Billing Toggle: Enable/disable billing features per user",
          "📊 Shows Pro plan type: (Manual), (Monthly), or (Yearly)",
          "⏱️ When to use: Customer support requests, VIP access, testing",
          "🔄 How often: As needed for support tickets",
          "💡 Pro status is stored in both profiles.is_pro (database) and user_metadata.pro (auth)"
        ]} 
      />

      <div className="flex gap-2 items-end">
        <label className="text-sm flex-1">
          <div className="opacity-70 mb-1">Search (email, id, username)</div>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="davy@… or uuid or username"
            className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" />
        </label>
        <button onClick={() => load()} disabled={loading} className="px-3 py-2 rounded bg-blue-700 hover:bg-blue-600 text-white text-sm disabled:opacity-60">Search</button>
      </div>

      <div className="rounded border border-neutral-800 overflow-auto max-h-[60vh]">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-800">
              <th className="text-left py-2 px-3">User</th>
              <th className="text-left py-2 px-3">Email</th>
              <th className="text-left py-2 px-3">ID</th>
              <th className="text-center py-2 px-3">Pro</th>
              <th className="text-center py-2 px-3">Billing</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(u => (
              <tr key={u.id} className="border-b border-neutral-900">
                <td className="py-2 px-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <img src={u.avatar || '/next.svg'} alt="avatar" className="w-7 h-7 rounded-full bg-neutral-800 object-cover" />
                    <div className="flex flex-col min-w-0">
                      <div className="truncate">{u.username || '—'}</div>
                    </div>
                  </div>
                </td>
                <td className="py-2 px-3">{u.email || '—'}</td>
                <td className="py-2 px-3 font-mono text-xs">{u.id}</td>
                <td className="py-2 px-3 text-center">
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={!!u.pro} onChange={e=>setPro(u.id, e.target.checked)} />
                    <div className="flex flex-col items-start">
                      <span className="text-xs opacity-80">{u.pro ? 'Enabled' : 'Disabled'}</span>
                      {u.pro && u.pro_plan && (
                        <span className="text-[10px] opacity-60 uppercase">({u.pro_plan})</span>
                      )}
                    </div>
                  </label>
                </td>
                <td className="py-2 px-3 text-center">
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={!!u.billing_active} onChange={e=>setBilling(u.id, e.target.checked)} />
                    <span className="text-xs opacity-80">{u.billing_active ? 'Active' : 'Off'}</span>
                  </label>
                </td>
              </tr>
            ))}
            {rows.length===0 && !loading && (
              <tr><td colSpan={5} className="py-6 text-center text-sm opacity-70">No results</td></tr>
            )}
            {loading && (
              <tr><td colSpan={5} className="py-6 text-center text-sm opacity-70">Loading…</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {hasMore && !loading && (
        <div className="flex justify-center pt-2">
          <button onClick={loadMore} disabled={loadingMore} className="px-4 py-2 rounded bg-neutral-700 hover:bg-neutral-600 text-sm disabled:opacity-50">
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
