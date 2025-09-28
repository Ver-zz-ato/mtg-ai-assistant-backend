"use client";
import React from "react";

export default function AdminAIUsagePage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [days, setDays] = React.useState(30);
  const [userId, setUserId] = React.useState("");
  const [threadId, setThreadId] = React.useState("");
  const [data, setData] = React.useState<any | null>(null);
  const [modelFilter, setModelFilter] = React.useState<string>("");

  async function load() {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const qs = new URLSearchParams({ days: String(days), limit: "10000" });
      if (userId.trim()) qs.set("userId", userId.trim());
      if (threadId.trim()) qs.set("threadId", threadId.trim());
      const res = await fetch(`/api/admin/ai-usage/summary?${qs.toString()}`, { cache: "no-store" });
      const j = await res.json().catch(()=>({ ok:false, error:"bad_json" }));
      if (!res.ok || j?.ok === false) throw new Error(j?.error || res.statusText);
      setData(j);
    } catch (e:any) {
      setError(e?.message || "forbidden or error");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const exportCsv = (rows: any[], headers: string[], rowMap: (r:any)=>any[]) => {
    const lines = [headers, ...rows.map(rowMap)];
    const csv = lines.map(r => r.map(v => '"'+String(v ?? '').replace(/"/g,'""')+'"').join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ai_usage.csv';
    a.click();
  };

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-semibold">Admin • AI Usage</h1>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end">
        <label className="text-sm">
          <div className="opacity-70 mb-1">Days</div>
          <input type="number" value={days} onChange={e=>setDays(parseInt(e.target.value||"30",10))}
            className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" />
        </label>
        <label className="text-sm sm:col-span-2">
          <div className="opacity-70 mb-1">Filter by User ID (optional)</div>
          <input value={userId} onChange={e=>setUserId(e.target.value)}
            placeholder="uuid..." className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" />
        </label>
        <label className="text-sm sm:col-span-1">
          <div className="opacity-70 mb-1">Filter by Thread ID (optional)</div>
          <input value={threadId} onChange={e=>setThreadId(e.target.value)}
            placeholder="uuid..." className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" />
        </label>
        <label className="text-sm sm:col-span-1">
          <div className="opacity-70 mb-1">Filter by Model (client)</div>
          <select value={modelFilter} onChange={e=>setModelFilter(e.target.value)} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1">
            <option value="">All</option>
            {(Array.from(new Set((data?.by_model || []).map((m:any) => String(m.model)))) as string[]).map((m) => (<option key={m} value={m}>{m}</option>))}
          </select>
        </label>
        <div className="sm:col-span-5 flex gap-2">
          <button onClick={load} disabled={loading} className="px-3 py-2 rounded bg-blue-700 hover:bg-blue-600 text-white text-sm disabled:opacity-60">Reload</button>
        </div>
      </div>

      {loading && (<div className="text-sm opacity-70">Loading…</div>)}
      {error && (<div className="text-sm text-red-400">{error}</div>)}

      {data && (
        <div className="space-y-6">
          <div className="rounded border border-neutral-800 p-3">
            <div className="font-medium mb-2">Totals (last {data.window_days} days)</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <div>Messages: <span className="font-mono">{data.totals.messages}</span></div>
              <div>Input tokens: <span className="font-mono">{data.totals.input_tokens}</span></div>
              <div>Output tokens: <span className="font-mono">{data.totals.output_tokens}</span></div>
              <div>Cost: <span className="font-mono">${data.totals.cost_usd}</span></div>
            </div>
          </div>

          <div className="rounded border border-neutral-800 p-3 overflow-x-auto">
            <div className="font-medium mb-2 flex items-center justify-between">
              <span>By model</span>
              <button onClick={() => {
                const rows = (data.by_model || []).filter((m:any)=> !modelFilter || m.model === modelFilter);
                exportCsv(rows, ['model','messages','input_tokens','output_tokens','cost_usd'], (m:any)=>[m.model,m.messages,m.input_tokens,m.output_tokens,m.cost_usd])
              }} className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs">Export CSV</button>
            </div>
            <table className="min-w-full text-sm">
              <thead><tr className="border-b border-neutral-800"><th className="text-left py-1 pr-3">Model</th><th className="text-right py-1 pr-3">Msgs</th><th className="text-right py-1 pr-3">In</th><th className="text-right py-1 pr-3">Out</th><th className="text-right py-1 pr-3">Cost</th></tr></thead>
              <tbody>
                {(data.by_model || []).filter((m:any)=> !modelFilter || m.model === modelFilter).map((m:any)=> (
                  <tr key={m.model} className="border-b border-neutral-900"><td className="py-1 pr-3">{m.model}</td><td className="py-1 pr-3 text-right">{m.messages}</td><td className="py-1 pr-3 text-right">{m.input_tokens}</td><td className="py-1 pr-3 text-right">{m.output_tokens}</td><td className="py-1 pr-3 text-right">${m.cost_usd}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded border border-neutral-800 p-3 overflow-x-auto">
            <div className="font-medium mb-2 flex items-center justify-between">
              <span>By day</span>
              <button onClick={() => exportCsv(data.by_day, ['date','messages','cost_usd'], (d:any)=>[d.date,d.messages,d.cost_usd])} className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs">Export CSV</button>
            </div>
            <table className="min-w-full text-sm">
              <thead><tr className="border-b border-neutral-800"><th className="text-left py-1 pr-3">Date</th><th className="text-right py-1 pr-3">Messages</th><th className="text-right py-1 pr-3">Cost</th></tr></thead>
              <tbody>
                {data.by_day.map((d:any)=> (
                  <tr key={d.date} className="border-b border-neutral-900"><td className="py-1 pr-3">{d.date}</td><td className="py-1 pr-3 text-right">{d.messages}</td><td className="py-1 pr-3 text-right">${d.cost_usd}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded border border-neutral-800 p-3 overflow-x-auto">
            <div className="font-medium mb-2 flex items-center justify-between">
              <span>Top users (by cost)</span>
              <button onClick={() => exportCsv(data.top_users, ['user_id','messages','input_tokens','output_tokens','cost_usd'], (u:any)=>[u.user_id,u.messages,u.input_tokens,u.output_tokens,u.cost_usd])} className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs">Export CSV</button>
            </div>
            <table className="min-w-full text-sm">
              <thead><tr className="border-b border-neutral-800"><th className="text-left py-1 pr-3">User</th><th className="text-right py-1 pr-3">Msgs</th><th className="text-right py-1 pr-3">In</th><th className="text-right py-1 pr-3">Out</th><th className="text-right py-1 pr-3">Cost</th></tr></thead>
              <tbody>
                {data.top_users.map((u:any)=> (
                  <tr key={u.user_id} className="border-b border-neutral-900 cursor-pointer" title="Filter by this user" onClick={() => { setUserId(u.user_id); setTimeout(load, 0); }}>
                    <td className="py-1 pr-3 font-mono">{u.user_id}</td>
                    <td className="py-1 pr-3 text-right">{u.messages}</td>
                    <td className="py-1 pr-3 text-right">{u.input_tokens}</td>
                    <td className="py-1 pr-3 text-right">{u.output_tokens}</td>
                    <td className="py-1 pr-3 text-right">${u.cost_usd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
