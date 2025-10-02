"use client";
import React from "react";
import { ELI5, HelpTip } from "@/components/AdminHelp";

function norm(s:string){return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();}

function SnapshotInfo(){
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState<Array<{ snapshot_date: string; currency: string; count: number }>>([]);
  React.useEffect(() => { (async () => {
    try {
      setLoading(true);
      // Read latest date per currency and counts
      const res = await fetch('/api/admin/ai-usage/summary', { cache: 'no-store' });
      // piggyback auth session; we’ll read snapshot info with a light client query to a public endpoint next
    } finally { setLoading(false); }
  })(); }, []);
  React.useEffect(() => { (async () => {
    try {
      // Use a small helper request to fetch snapshot stats via the database directly on the client (public RLS)
      const url = '/api/cards/search'; // any authenticated endpoint to ensure cookies are present; fallback to anon supabase below if needed
      // Try reading via Supabase anon client
      // Defer to anon supabase to keep this simple and self-contained
      const { createClient } = await import('@supabase/supabase-js');
      const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
      const { data: dates } = await supa
        .from('price_snapshots')
        .select('snapshot_date, currency, unit')
        .order('snapshot_date', { ascending: false })
        .limit(5000);
      const map = new Map<string, { snapshot_date: string; count: number }>();
      for (const r of (dates||[])){
        const key = String(r.currency||'USD').toUpperCase();
        if (!map.has(key)) map.set(key, { snapshot_date: r.snapshot_date, count: 0 });
        const cur = map.get(key)!; if (cur.snapshot_date === r.snapshot_date) cur.count += 1;
      }
      const arr: any[] = [];
      for (const [currency, v] of map.entries()) arr.push({ currency, snapshot_date: v.snapshot_date, count: v.count });
      setRows(arr.sort((a,b)=>a.currency.localeCompare(b.currency)));
    } catch { setRows([]); }
  })(); }, []);

  return (
    <div className="rounded border border-neutral-800 p-3">
      <div className="font-medium mb-2">Price snapshot status</div>
      {loading && (<div className="text-xs opacity-70">Loading…</div>)}
      {!loading && rows.length===0 && (<div className="text-xs opacity-70">No snapshots found.</div>)}
      {!loading && rows.length>0 && (
        <ul className="text-sm space-y-1">
          {rows.map(r => (
            <li key={r.currency} className="flex items-center justify-between">
              <span>{r.currency}</span>
              <span className="opacity-80">{r.snapshot_date} • rows: <span className="font-mono">{r.count}</span></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SnapshotRows(){
  const [currency, setCurrency] = React.useState('USD');
  const [rows, setRows] = React.useState<Array<{ name_norm: string; unit: number }>>([]);
  const [date, setDate] = React.useState<string>('');
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => { (async () => {
    try {
      setLoading(true);
      const { createClient } = await import('@supabase/supabase-js');
      const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
      const { data: d0 } = await supa
        .from('price_snapshots')
        .select('snapshot_date')
        .eq('currency', currency)
        .order('snapshot_date', { ascending: false })
        .limit(1);
      const latest = (d0 as any[])?.[0]?.snapshot_date || null; setDate(latest||'');
      if (!latest) { setRows([]); return; }
      const { data } = await supa
        .from('price_snapshots')
        .select('name_norm, unit')
        .eq('currency', currency)
        .eq('snapshot_date', latest)
        .order('unit', { ascending: false })
        .limit(50);
      setRows((data as any[]) || []);
    } catch { setRows([]); } finally { setLoading(false); }
  })(); }, [currency]);
  const exportCsv = () => {
    const headers = ['name_norm','unit'];
    const lines = [headers, ...rows.map(r=>[r.name_norm, r.unit])];
    const csv = lines.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `snapshot_${currency}_${date||'na'}.csv`; a.click();
  };
  return (
    <div className="rounded border border-neutral-800 p-3">
      <div className="font-medium mb-2 flex items-center justify-between">
        <span>Latest snapshot rows</span>
        <div className="flex items-center gap-2 text-xs">
          <label className="opacity-70">Currency</label>
          <select value={currency} onChange={e=>setCurrency(e.target.value)} className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1">
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
          <button onClick={exportCsv} className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs">Export CSV</button>
        </div>
      </div>
      {loading && (<div className="text-xs opacity-70">Loading…</div>)}
      {!loading && rows.length===0 && (<div className="text-xs opacity-70">No snapshot rows.</div>)}
      {!loading && rows.length>0 && (
        <table className="min-w-full text-sm">
          <thead><tr className="border-b border-neutral-800"><th className="text-left py-1 pr-3">Name</th><th className="text-right py-1 pr-3">Unit</th></tr></thead>
          <tbody>
            {rows.map(r=> (<tr key={r.name_norm} className="border-b border-neutral-900"><td className="py-1 pr-3">{r.name_norm}</td><td className="py-1 pr-3 text-right">{r.unit}</td></tr>))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function AdminAIUsagePage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [days, setDays] = React.useState(30);
  const [userId, setUserId] = React.useState("");
  const [threadId, setThreadId] = React.useState("");
  const [data, setData] = React.useState<any | null>(null);
  const [modelFilter, setModelFilter] = React.useState<string>("");
  const [building, setBuilding] = React.useState<boolean>(false);

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
      <ELI5 heading="AI Usage" items={[
        'See message/token/cost totals over a time window.',
        'Slice by model/day/user; export CSVs.',
        'Warm Scryfall cache and build price snapshots when needed.'
      ]} />

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
          <button onClick={async()=>{
            try {
              const key = prompt('Enter CRON_KEY to prewarm Scryfall cache (admin only):');
              if (!key) return;
              const r = await fetch('/api/cron/prewarm-scryfall', { method: 'POST', headers: { 'x-cron-key': key } });
              const j = await r.json().catch(()=>({}));
              if (!r.ok || j?.ok===false) throw new Error(j?.error || 'Prewarm failed');
              alert(`Prewarmed ${j.warmed} names`);
            } catch (e:any) {
              alert(e?.message || 'Prewarm failed');
            }
          }} className="px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-sm">Prewarm Scryfall cache</button>
          <button onClick={async()=>{
            try {
              if (!confirm('Build today\'s price snapshot from Scryfall for names in your decks?')) return;
              setBuilding(true);
              const r = await fetch('/api/admin/price/snapshot/build', { method:'POST' });
              const j = await r.json().catch(()=>({}));
              if (!r.ok || j?.ok===false) throw new Error(j?.error || 'Snapshot failed');
              alert(`Snapshot done: ${j.inserted} rows on ${j.snapshot_date}`);
            } catch (e:any) { alert(e?.message || 'Snapshot failed'); } finally { setBuilding(false); }
          }} className="px-3 py-2 rounded bg-purple-700 hover:bg-purple-600 text-white text-sm">Build price snapshot (today)</button>
          <button onClick={async()=>{
            try {
              if (!confirm('Build FULL snapshot from Scryfall bulk (can take a while)?')) return;
              setBuilding(true);
              const r = await fetch('/api/admin/price/snapshot/bulk', { method:'POST' });
              const j = await r.json().catch(()=>({}));
              if (!r.ok || j?.ok===false) throw new Error(j?.error || 'Bulk snapshot failed');
              alert(`Bulk snapshot done: ${j.inserted} rows on ${j.snapshot_date}`);
            } catch (e:any) { alert(e?.message || 'Bulk snapshot failed'); } finally { setBuilding(false); }
          }} className="px-3 py-2 rounded bg-fuchsia-700 hover:bg-fuchsia-600 text-white text-sm">Build FULL snapshot (ALL cards)</button>
        </div>
      </div>

      {loading && (<div className="text-sm opacity-70">Loading…</div>)}
      {error && (<div className="text-sm text-red-400">{error}</div>)}

      <div className="rounded border border-neutral-800 p-3 bg-neutral-950/50">
        <div className="font-semibold mb-1">What can I do here?</div>
        <ul className="list-disc pl-5 text-sm space-y-1">
          <li><b>Reload</b>: refreshes the usage tables below (messages, tokens, cost).</li>
          <li><b>Prewarm Scryfall cache</b>: warms card images/details for popular/recent decks so pages load faster and hit Scryfall less. You’ll be asked for <code>CRON_KEY</code> — use the same value set in your environment.</li>
          <li><b>Build price snapshot</b>: creates a daily snapshot of card prices used for per-card and total estimates.</li>
          <li><b>By model / day / users</b>: simple summaries to spot heavy usage.</li>
        </ul>
        {building && (<div className="mt-2 text-xs opacity-80">Building snapshot…</div>)}
      </div>

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

          {/* Snapshot prices panel (latest date per currency) */}
          <SnapshotInfo />
          <SnapshotRows />

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
