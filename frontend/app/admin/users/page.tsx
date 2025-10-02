"use client";
import React from "react";
import { ELI5, HelpTip } from "@/components/AdminHelp";

function norm(s:string){return String(s||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();}

type UserRow = { id: string; email: string|null; username: string|null; avatar: string|null; pro: boolean };

export default function AdminUsersPage(){
  const [q, setQ] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [rows, setRows] = React.useState<UserRow[]>([]);

  async function load(){
    setLoading(true);
    try{
      const r = await fetch(`/api/admin/users/search?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok || j?.ok===false) throw new Error(j?.error || r.statusText);
      setRows((j.users||[]) as UserRow[]);
    } catch(e:any){
      alert(e?.message || 'failed');
      setRows([]);
    } finally { setLoading(false); }
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

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-semibold">Admin • Users</h1>
      <ELI5 heading="Users" items={["Search by email, id, or username.", "Flip a user\'s Pro flag on/off when support needs to grant or revoke access."]} />

      <div className="flex gap-2 items-end">
        <label className="text-sm flex-1">
          <div className="opacity-70 mb-1">Search (email, id, username)</div>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="davy@… or uuid or username"
            className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" />
        </label>
        <button onClick={load} disabled={loading} className="px-3 py-2 rounded bg-blue-700 hover:bg-blue-600 text-white text-sm disabled:opacity-60">Search</button>
      </div>

      <div className="rounded border border-neutral-800 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-800">
              <th className="text-left py-2 px-3">User</th>
              <th className="text-left py-2 px-3">Email</th>
              <th className="text-left py-2 px-3">ID</th>
              <th className="text-center py-2 px-3">Pro</th>
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
                    <span className="text-xs opacity-80">{u.pro ? 'Enabled' : 'Disabled'}</span>
                  </label>
                </td>
              </tr>
            ))}
            {rows.length===0 && !loading && (
              <tr><td colSpan={4} className="py-6 text-center text-sm opacity-70">No results</td></tr>
            )}
            {loading && (
              <tr><td colSpan={4} className="py-6 text-center text-sm opacity-70">Loading…</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
