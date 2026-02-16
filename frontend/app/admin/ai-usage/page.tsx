"use client";
import React from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { getRouteContext, getCalledFromDisplay } from "@/lib/ai/route-to-page";
import { ELI5 } from "@/components/AdminHelp";

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

type Tab = "summary" | "requests" | "board";

export default function AdminAIUsagePage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [days, setDays] = React.useState(30);
  const [userId, setUserId] = React.useState("");
  const [threadId, setThreadId] = React.useState("");
  const [data, setData] = React.useState<any | null>(null);
  const [modelFilter, setModelFilter] = React.useState<string>("");
  const [building, setBuilding] = React.useState<boolean>(false);
  const [tab, setTab] = React.useState<Tab>("board");
  const [requests, setRequests] = React.useState<any[]>([]);
  const [requestsLoading, setRequestsLoading] = React.useState(false);
  const [requestDays, setRequestDays] = React.useState(7);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [requestSort, setRequestSort] = React.useState<"time" | "cost" | "tokens">("cost");
  const [requestRouteFilter, setRequestRouteFilter] = React.useState<string>("");

  // Board: new overview API
  const [overview, setOverview] = React.useState<any | null>(null);
  const [overviewLoading, setOverviewLoading] = React.useState(false);
  const [boardDays, setBoardDays] = React.useState(14);
  const [excludeLegacyCost, setExcludeLegacyCost] = React.useState(false);
  const [topDrivers, setTopDrivers] = React.useState<Record<string, Array<{ id: string; cost_usd: number; requests: number }>>>({});
  const [usageList, setUsageList] = React.useState<any[]>([]);
  const [usageListCursor, setUsageListCursor] = React.useState<string | null>(null);
  const [usageListLoading, setUsageListLoading] = React.useState(false);
  const [usageDetailId, setUsageDetailId] = React.useState<string | null>(null);
  const [usageDetail, setUsageDetail] = React.useState<any | null>(null);
  const [config, setConfig] = React.useState<any | null>(null);
  const [configLoading, setConfigLoading] = React.useState(false);
  const [recommendations, setRecommendations] = React.useState<any[]>([]);
  const [recommendationsTelemetryUnhealthy, setRecommendationsTelemetryUnhealthy] = React.useState<boolean>(false);
  const [recommendationsMessage, setRecommendationsMessage] = React.useState<string | null>(null);
  const [seriesView, setSeriesView] = React.useState<"daily" | "hourly">("daily");
  const [openaiData, setOpenaiData] = React.useState<any | null>(null);
  const [openaiLoading, setOpenaiLoading] = React.useState(false);

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

  async function loadRequests(offset = 0) {
    setRequestsLoading(true);
    try {
      const qs = new URLSearchParams({ days: String(requestDays), limit: "500", offset: String(offset) });
      if (userId.trim()) qs.set("userId", userId.trim());
      if (threadId.trim()) qs.set("threadId", threadId.trim());
      if (modelFilter) qs.set("model", modelFilter);
      if (requestRouteFilter) qs.set("route", requestRouteFilter);
      const res = await fetch(`/api/admin/ai-usage/requests?${qs.toString()}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({ ok: false }));
      if (!res.ok || !j?.ok) throw new Error(j?.error || "Failed to load requests");
      setRequests(j.requests || []);
    } catch (e: any) {
      setRequests([]);
    } finally {
      setRequestsLoading(false);
    }
  }

  React.useEffect(() => {
    if (tab === "requests") loadRequests();
  }, [tab, requestDays, userId, threadId, modelFilter, requestRouteFilter]);

  async function loadOverview() {
    setOverviewLoading(true);
    try {
      const qs = new URLSearchParams({ days: String(boardDays) });
      if (excludeLegacyCost) qs.set("exclude_legacy_cost", "true");
      const res = await fetch(`/api/admin/ai/overview?${qs}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({ ok: false }));
      if (j?.ok) setOverview(j); else setOverview(null);
    } catch { setOverview(null); } finally { setOverviewLoading(false); }
  }
  async function loadTopDrivers() {
    try {
      const qs = new URLSearchParams({ days: String(boardDays) });
      if (excludeLegacyCost) qs.set("exclude_legacy_cost", "true");
      const qsStr = qs.toString();
      const dims = ["user", "deck", "thread", "error_code"] as const;
      const out: Record<string, Array<{ id: string; cost_usd: number; requests: number }>> = {};
      for (const d of dims) {
        const r = await fetch(`/api/admin/ai/top?${qsStr}&dimension=${d}`, { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        out[d] = j?.items || [];
      }
      setTopDrivers(out);
    } catch { setTopDrivers({}); }
  }
  async function loadUsageList(cursor?: string | null) {
    setUsageListLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50", days: String(boardDays) });
      if (cursor) params.set("next_cursor", cursor);
      if (excludeLegacyCost) params.set("exclude_legacy_cost", "true");
      const res = await fetch(`/api/admin/ai/usage/list?${params}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (j?.ok) {
        if (!cursor) setUsageList(j.items || []); else setUsageList((prev) => [...prev, ...(j.items || [])]);
        setUsageListCursor(j.next_cursor || null);
      }
    } catch {} finally { setUsageListLoading(false); }
  }
  async function loadUsageDetail(id: string) {
    setUsageDetailId(id);
    try {
      const res = await fetch(`/api/admin/ai/usage/${id}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      setUsageDetail(j?.ok ? j : null);
    } catch { setUsageDetail(null); }
  }
  async function loadConfig() {
    setConfigLoading(true);
    try {
      const res = await fetch("/api/admin/ai/config", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      setConfig(j?.ok ? j : null);
    } catch { setConfig(null); } finally { setConfigLoading(false); }
  }
  async function loadRecommendations() {
    try {
      const res = await fetch(`/api/admin/ai/recommendations?days=${boardDays}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      setRecommendations(j?.ok ? j.recommendations || [] : []);
      setRecommendationsTelemetryUnhealthy(j?.telemetry_unhealthy ?? false);
      setRecommendationsMessage(j?.message ?? null);
    } catch {
      setRecommendations([]);
      setRecommendationsTelemetryUnhealthy(false);
      setRecommendationsMessage(null);
    }
  }
  async function loadOpenAIUsage() {
    setOpenaiLoading(true);
    try {
      const res = await fetch(`/api/admin/ai/openai-usage?days=${boardDays}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({ ok: false }));
      setOpenaiData(j?.ok ? j : null);
    } catch { setOpenaiData(null); } finally { setOpenaiLoading(false); }
  }

  React.useEffect(() => {
    if (tab === "board") {
      loadOverview();
      loadTopDrivers();
      loadUsageList();
      loadConfig();
      loadRecommendations();
      loadOpenAIUsage();
    }
  }, [tab, boardDays, excludeLegacyCost]);

  React.useEffect(() => {
    if (tab !== "board") return;
    const t = setInterval(loadOverview, 60_000);
    return () => clearInterval(t);
  }, [tab, boardDays, excludeLegacyCost]);

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
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">AI Usage</h1>
            <p className="text-xs text-neutral-500 mt-0.5">OpenAI spend by route, model, and user</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading} className="px-3 py-1.5 rounded-md bg-neutral-700 hover:bg-neutral-600 text-sm disabled:opacity-50">
              {loading ? "Loading…" : "Refresh"}
            </button>
            <details className="relative">
              <summary className="list-none px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-sm cursor-pointer text-neutral-300">
                Other actions
              </summary>
              <div className="absolute right-0 top-full mt-1 w-56 rounded-md border border-neutral-700 bg-neutral-900 py-1 shadow-lg z-10">
                <button type="button" onClick={async () => {
                  const key = prompt("CRON_KEY:");
                  if (!key) return;
                  const r = await fetch("/api/cron/prewarm-scryfall", { method: "POST", headers: { "x-cron-key": key } });
                  const j = await r.json().catch(() => ({}));
                  alert(r.ok && j?.ok ? `Prewarmed ${j.warmed} names` : j?.error || "Failed");
                }} className="block w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-800">Prewarm Scryfall</button>
                <button type="button" onClick={async () => {
                  if (!confirm("Build today’s price snapshot?")) return;
                  setBuilding(true);
                  try {
                    const r = await fetch("/api/admin/price/snapshot/build", { method: "POST" });
                    const j = await r.json().catch(() => ({}));
                    alert(r.ok && j?.ok ? `Done: ${j.inserted} rows` : j?.error || "Failed");
                  } finally { setBuilding(false); }
                }} className="block w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-800">Price snapshot (today)</button>
                <button type="button" onClick={async () => {
                  if (!confirm("Build FULL snapshot (can take a while)?")) return;
                  setBuilding(true);
                  try {
                    const r = await fetch("/api/admin/price/snapshot/bulk", { method: "POST" });
                    const j = await r.json().catch(() => ({}));
                    alert(r.ok && j?.ok ? `Done: ${j.inserted} rows` : j?.error || "Failed");
                  } finally { setBuilding(false); }
                }} className="block w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-800">Price snapshot (full)</button>
              </div>
            </details>
            {building && <span className="text-xs text-neutral-500">Building…</span>}
          </div>
        </header>

        <ELI5 heading="AI Usage" items={[
          'Our estimate: from our ai_usage table (we log each request). OpenAI actual: from their API when available.',
          'If OpenAI actual shows $0, we fall back to estimating from token usage. Check OPENAI_ADMIN_API_KEY.',
          'Use for: cost tracking, spotting expensive routes, debugging model usage.'
        ]} />

        {loading && <div className="text-sm text-neutral-500">Loading…</div>}
        {error && <div className="rounded-md bg-red-950/50 border border-red-900/50 px-3 py-2 text-sm text-red-300">{error}</div>}

        {/* Hero metrics */}
        {data?.recent_days_cost != null && data?.totals != null && !loading && (
          <section className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-neutral-900/80 border border-neutral-700/80 p-5">
              <div className="text-[11px] uppercase tracking-widest text-neutral-500">Today</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-white">${data.recent_days_cost.today_usd ?? "0"}</div>
            </div>
            <div className="rounded-xl bg-neutral-900/80 border border-neutral-700/80 p-5">
              <div className="text-[11px] uppercase tracking-widest text-neutral-500">Last 3 days</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-white">${data.recent_days_cost.last_3_days}</div>
            </div>
            <div className="rounded-xl bg-neutral-900/80 border border-neutral-700/80 p-5">
              <div className="text-[11px] uppercase tracking-widest text-neutral-500">Last {data.window_days} days</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-white">${data.totals.cost_usd}</div>
              <div className="mt-0.5 text-xs text-neutral-500">{data.totals.messages} requests · {data.distinct_users ?? "—"} unique users</div>
            </div>
          </section>
        )}

        {/* Filters — one compact row */}
        <section className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-neutral-500">Filters:</span>
          <input type="number" value={days} onChange={e => setDays(parseInt(e.target.value || "30", 10))} className="w-14 bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm" title="Days" />
          <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="User ID" className="w-40 bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm placeholder:text-neutral-600" />
          <input value={threadId} onChange={e => setThreadId(e.target.value)} placeholder="Thread ID" className="w-40 bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm placeholder:text-neutral-600" />
          <select value={modelFilter} onChange={e => setModelFilter(e.target.value)} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm">
            <option value="">All models</option>
            {(Array.from(new Set((data?.by_model || []).map((m: any) => String(m.model)))) as string[]).map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </section>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-neutral-800">
          <button onClick={() => setTab("board")} className={`px-4 py-2 text-sm font-medium rounded-t border border-b-0 transition-colors ${tab === "board" ? "bg-neutral-800 border-neutral-700 text-white" : "border-transparent text-neutral-400 hover:text-white"}`}>
            Board
          </button>
          <button onClick={() => setTab("summary")} className={`px-4 py-2 text-sm font-medium rounded-t border border-b-0 transition-colors ${tab === "summary" ? "bg-neutral-800 border-neutral-700 text-white" : "border-transparent text-neutral-400 hover:text-white"}`}>
            Summary
          </button>
          <button onClick={() => setTab("requests")} className={`px-4 py-2 text-sm font-medium rounded-t border border-b-0 transition-colors ${tab === "requests" ? "bg-neutral-800 border-neutral-700 text-white" : "border-transparent text-neutral-400 hover:text-white"}`}>
            Request log
          </button>
        </div>

        {/* Tab content */}
      {tab === "board" && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm flex items-center gap-1">
              <span className="opacity-70">Days</span>
              <input type="number" min={1} max={90} value={boardDays} onChange={e => setBoardDays(parseInt(e.target.value || "14", 10))} className="w-16 bg-neutral-950 border border-neutral-700 rounded px-2 py-1" />
            </label>
            <label className="text-sm flex items-center gap-1.5 cursor-pointer" title="Older cost records may be inflated due to historical unit bug. Exclude them from totals.">
              <input type="checkbox" checked={excludeLegacyCost} onChange={e => setExcludeLegacyCost(e.target.checked)} className="rounded" />
              <span className="opacity-70">Exclude legacy cost rows</span>
            </label>
            <button onClick={() => { loadOverview(); loadTopDrivers(); loadUsageList(); loadRecommendations(); loadOpenAIUsage(); }} disabled={overviewLoading} className="px-3 py-1.5 rounded bg-neutral-700 hover:bg-neutral-600 text-sm disabled:opacity-50">Refresh</button>
          </div>
          {overviewLoading && !overview && <div className="text-sm text-neutral-500">Loading overview…</div>}
          {overview?.totals && (
            <>
              <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="rounded-xl bg-neutral-900/80 border border-neutral-700/80 p-4" title="Older cost records may be inflated due to historical unit bug. Use 'Exclude legacy cost rows' to filter them.">
                  <div className="text-[11px] uppercase tracking-widest text-neutral-500">Total cost</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-white">${overview.totals.total_cost_usd?.toFixed(4) ?? "0"}</div>
                </div>
                <div className="rounded-xl bg-neutral-900/80 border border-neutral-700/80 p-4">
                  <div className="text-[11px] uppercase tracking-widest text-neutral-500">Requests</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-white">{overview.totals.total_requests ?? 0}</div>
                </div>
                <div className="rounded-xl bg-neutral-900/80 border border-neutral-700/80 p-4">
                  <div className="text-[11px] uppercase tracking-widest text-neutral-500">Avg cost/req</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-white">${overview.totals.avg_cost?.toFixed(4) ?? "0"}</div>
                </div>
                <div className="rounded-xl bg-neutral-900/80 border border-neutral-700/80 p-4">
                  <div className="text-[11px] uppercase tracking-widest text-neutral-500">P95 latency</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-white">{overview.totals.p95_latency_ms != null ? `${overview.totals.p95_latency_ms} ms` : "—"}</div>
                </div>
                <div className="rounded-xl bg-neutral-900/80 border border-neutral-700/80 p-4">
                  <div className="text-[11px] uppercase tracking-widest text-neutral-500">Tokens in/out</div>
                  <div className="mt-1 text-sm font-mono tabular-nums text-white">{overview.totals.total_tokens_in ?? 0} / {overview.totals.total_tokens_out ?? 0}</div>
                </div>
              </section>
              <section className="rounded-xl border border-emerald-900/50 overflow-hidden bg-emerald-950/20 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-emerald-200">OpenAI actual (from API)</h2>
                  <button onClick={loadOpenAIUsage} disabled={openaiLoading} className="text-xs px-2 py-1 rounded bg-emerald-900/50 hover:bg-emerald-800/50 disabled:opacity-50">
                    {openaiLoading ? "Loading…" : "Refresh"}
                  </button>
                </div>
                {openaiLoading && !openaiData && <div className="text-sm text-neutral-500">Loading from OpenAI…</div>}
                {!openaiLoading && openaiData?.error && (
                  <div className="text-sm text-amber-300">{openaiData.error}</div>
                )}
                {!openaiLoading && openaiData?.totals && (
                  <div className="space-y-3">
                    {openaiData.cost_source === 'estimated_from_tokens' && (
                      <div className="text-xs text-amber-400/90 bg-amber-950/30 rounded px-2 py-1">
                        OpenAI Costs API returned $0 (common: delayed billing). Showing estimated cost from token usage.
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <div className="text-[11px] uppercase text-neutral-500">
                          Cost {openaiData.cost_source === 'estimated_from_tokens' ? '(est. from tokens)' : '(actual)'}
                        </div>
                        <div className="text-lg font-semibold text-emerald-300">${openaiData.totals.cost_usd?.toFixed(4) ?? "0"}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase text-neutral-500">Requests</div>
                        <div className="text-lg font-semibold tabular-nums">{openaiData.totals.requests ?? 0}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase text-neutral-500">Tokens in</div>
                        <div className="text-sm font-mono tabular-nums">{openaiData.totals.input_tokens?.toLocaleString() ?? 0}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase text-neutral-500">Tokens out</div>
                        <div className="text-sm font-mono tabular-nums">{openaiData.totals.output_tokens?.toLocaleString() ?? 0}</div>
                      </div>
                    </div>
                    {overview?.totals?.total_cost_usd != null && (
                      <div className="text-xs text-neutral-400">
                        Our estimate: ${overview.totals.total_cost_usd?.toFixed(4)} vs OpenAI actual: ${openaiData.totals.cost_usd?.toFixed(4)}
                        {Math.abs((overview.totals.total_cost_usd ?? 0) - (openaiData.totals.cost_usd ?? 0)) > 0.01 && (
                          <span className="text-amber-400 ml-1">(diff: ${((overview.totals.total_cost_usd ?? 0) - (openaiData.totals.cost_usd ?? 0)).toFixed(4)})</span>
                        )}
                      </div>
                    )}
                    {(openaiData.by_model?.length ?? 0) > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-neutral-400 cursor-pointer hover:text-neutral-300">By model (OpenAI)</summary>
                        <table className="min-w-full text-xs mt-1">
                          <tbody>
                            {(openaiData.by_model || []).slice(0, 8).map((m: any) => (
                              <tr key={m.model} className="border-t border-neutral-800/50">
                                <td className="py-0.5 font-mono">{m.model ?? "—"}</td>
                                <td className="py-0.5 text-right tabular-nums">{m.requests ?? 0} req</td>
                                <td className="py-0.5 text-right tabular-nums">{(m.input_tokens ?? 0).toLocaleString()} in</td>
                                <td className="py-0.5 text-right tabular-nums">{(m.output_tokens ?? 0).toLocaleString()} out</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </details>
                    )}
                  </div>
                )}
              </section>
              <section className="rounded-xl border border-neutral-800 overflow-hidden bg-neutral-900/40 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-neutral-200">Time series</h2>
                  <button onClick={() => setSeriesView(s => s === "daily" ? "hourly" : "daily")} className="text-xs px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700">{seriesView === "daily" ? "Hourly" : "Daily"}</button>
                </div>
                <div className="h-64">
                  {(seriesView === "daily" ? overview.series_daily : overview.series_hourly)?.length > 0 && (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={seriesView === "daily" ? overview.series_daily : overview.series_hourly} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                        <XAxis dataKey={seriesView === "daily" ? "date" : "hour"} tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Area type="monotone" dataKey="cost_usd" stroke="#3b82f6" fill="#3b82f6/30" name="Cost USD" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </section>
              <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl border border-neutral-800 overflow-hidden bg-neutral-900/40">
                  <div className="px-4 py-2 border-b border-neutral-800 text-sm font-semibold text-neutral-200">By model</div>
                  <div className="overflow-x-auto max-h-48 overflow-y-auto">
                    <table className="min-w-full text-sm">
                      <tbody>
                        {(overview.by_model || []).slice(0, 10).map((m: any) => (
                          <tr key={m.id} className="border-b border-neutral-800/80 hover:bg-neutral-800/30 cursor-pointer" onClick={() => { setModelFilter(m.id); setTab("requests"); }}>
                            <td className="px-4 py-1.5 font-mono text-xs">{m.id}</td>
                            <td className="px-4 py-1.5 text-right tabular-nums">{m.requests}</td>
                            <td className="px-4 py-1.5 text-right font-mono">${m.cost_usd}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="rounded-xl border border-neutral-800 overflow-hidden bg-neutral-900/40">
                  <div className="px-4 py-2 border-b border-neutral-800 text-sm font-semibold text-neutral-200">By route</div>
                  <div className="overflow-x-auto max-h-48 overflow-y-auto">
                    <table className="min-w-full text-sm">
                      <tbody>
                        {(overview.by_route || []).slice(0, 10).map((r: any) => (
                          <tr key={r.id} className="border-b border-neutral-800/80 hover:bg-neutral-800/30 cursor-pointer" onClick={() => { setRequestRouteFilter(r.id); setTab("requests"); }}>
                            <td className="px-4 py-1.5 font-mono text-xs">{r.id}</td>
                            <td className="px-4 py-1.5 text-right tabular-nums">{r.total_requests}</td>
                            <td className="px-4 py-1.5 text-right font-mono">${r.total_cost_usd}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="rounded-xl border border-neutral-800 overflow-hidden bg-neutral-900/40">
                  <div className="px-4 py-2 border-b border-neutral-800 text-sm font-semibold text-neutral-200">By request kind</div>
                  <div className="overflow-x-auto max-h-48 overflow-y-auto">
                    <table className="min-w-full text-sm">
                      <tbody>
                        {(overview.by_request_kind || []).slice(0, 10).map((k: any) => (
                          <tr key={k.id} className="border-b border-neutral-800/80 hover:bg-neutral-800/30">
                            <td className="px-4 py-1.5 font-mono text-xs">{k.id}</td>
                            <td className="px-4 py-1.5 text-right tabular-nums">{k.requests}</td>
                            <td className="px-4 py-1.5 text-right font-mono">${k.cost_usd}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
              <section className="rounded-xl border border-neutral-800 overflow-hidden bg-neutral-900/40 p-4">
                <h2 className="text-sm font-semibold text-neutral-200 mb-3">Top cost drivers</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {["user", "deck", "thread", "error_code"].map(dim => (
                    <div key={dim}>
                      <div className="text-xs uppercase text-neutral-500 mb-1">{dim}</div>
                      <ul className="text-sm space-y-1 max-h-32 overflow-y-auto">
                        {(topDrivers[dim] || []).slice(0, 5).map((x: any) => (
                          <li key={x.id} className="flex justify-between font-mono text-xs truncate">
                            <span className="truncate max-w-[100px]" title={x.id}>{x.id === "null" ? "—" : x.id}</span>
                            <span>${x.cost_usd}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
          <section className="rounded-xl border border-neutral-800 overflow-hidden bg-neutral-900/40">
            <div className="px-4 py-2 border-b border-neutral-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-200">Usage log</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const params = new URLSearchParams({ limit: "2000", days: String(boardDays) });
                    const res = await fetch(`/api/admin/ai/usage/list?${params}`, { cache: "no-store" });
                    const j = await res.json().catch(() => ({}));
                    const rows = j?.ok ? (j.items || []) : [];
                    if (rows.length === 0) { alert("No rows to export."); return; }
                    const allKeys = [...new Set(rows.flatMap((r: any) => Object.keys(r)))].sort() as string[];
                    const headers = allKeys;
                    const lines = [headers, ...rows.map((r: any) => headers.map((h: string) => r[h]))];
                    const csv = lines.map(row => row.map((v: unknown) => '"' + String(v ?? "").replace(/"/g, '""') + '"').join(",")).join("\r\n");
                    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `ai_usage_${boardDays}d_${new Date().toISOString().slice(0,10)}.csv`; a.click();
                  }}
                  className="text-xs px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600"
                >
                  Export full CSV
                </button>
                <button onClick={() => loadUsageList()} disabled={usageListLoading} className="text-xs px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50">Reload</button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              {usageListLoading && usageList.length === 0 && <div className="p-4 text-sm text-neutral-500">Loading…</div>}
              {!usageListLoading && usageList.length === 0 && <div className="p-4 text-sm text-neutral-500">No rows.</div>}
              {usageList.length > 0 && (
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-neutral-900"><tr className="border-b border-neutral-800"><th className="text-left px-2 py-1">Time</th><th className="text-left px-2 py-1">Route</th><th className="text-left px-2 py-1">Called from</th><th className="text-left px-2 py-1">Model</th><th className="text-right px-2 py-1">Cost</th><th className="text-left px-2 py-1"></th></tr></thead>
                  <tbody>
                    {usageList.map((r: any) => {
                      const ctx = getRouteContext(r.route);
                      const calledFrom = getCalledFromDisplay(r.route, r.source_page);
                      return (
                      <tr key={r.id} className="border-b border-neutral-800/80 hover:bg-neutral-800/30 cursor-pointer" onClick={() => loadUsageDetail(r.id)}>
                        <td className="px-2 py-1 text-xs whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleString() : ""}</td>
                        <td className="px-2 py-1 font-mono text-xs">{r.route ?? "—"}</td>
                        <td className="px-2 py-1 text-xs text-neutral-400" title={r.source_page ? `${calledFrom} (${r.source_page})` : ctx?.description}>{calledFrom}</td>
                        <td className="px-2 py-1 font-mono text-xs">{r.model ?? "—"}</td>
                        <td className="px-2 py-1 text-right font-mono">${r.cost_usd}</td>
                        <td className="px-2 py-1"><span className="text-blue-400 text-xs">Details</span></td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              )}
            </div>
            {usageListCursor && <button onClick={() => loadUsageList(usageListCursor)} disabled={usageListLoading} className="w-full py-2 text-sm text-neutral-400 hover:text-white border-t border-neutral-800">Load more</button>}
          </section>
          {usageDetailId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setUsageDetailId(null)}>
              <div className="bg-neutral-900 border border-neutral-700 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto p-4 shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-3"><h3 className="font-semibold">Usage detail</h3><button onClick={() => setUsageDetailId(null)} className="text-neutral-400 hover:text-white">×</button></div>
                {usageDetail?.row && (
                  <>
                    <div className="mb-3 p-2 rounded bg-neutral-800/50 text-sm">
                      <span className="text-neutral-500">Cost: </span><span className="font-mono">${Number(usageDetail.row.cost_usd || 0).toFixed(4)}</span>
                      {process.env.NODE_ENV === "development" && (
                        <span className="ml-2 text-xs text-neutral-500" title="Dev: raw cost_usd from API">(raw: {String(usageDetail.row.cost_usd)})</span>
                      )}
                      <span className="text-neutral-500 ml-3">per request</span>
                      <span className="text-neutral-500 ml-2">({usageDetail.row.input_tokens ?? 0} in / {usageDetail.row.output_tokens ?? 0} out tokens, {usageDetail.row.model ?? "—"})</span>
                    </div>
                    {(usageDetail.route_context || usageDetail.row.source_page || (usageDetail.row.route && getRouteContext(usageDetail.row.route))) && (
                      <div className="mb-3 p-2 rounded bg-blue-950/30 border border-blue-800/50 text-sm">
                        <div className="text-xs font-medium text-blue-300 uppercase tracking-wide mb-1">Called from (site location)</div>
                        <div className="font-medium text-blue-200">{getCalledFromDisplay(usageDetail.row.route, usageDetail.row.source_page) || (usageDetail.route_context || getRouteContext(usageDetail.row.route))?.page || usageDetail.row.route || "—"}</div>
                        <div className="text-xs text-neutral-400 mt-0.5">{usageDetail.row.source_page ? `source_page: ${usageDetail.row.source_page}` : (usageDetail.route_context || getRouteContext(usageDetail.row.route))?.description}</div>
                      </div>
                    )}
                  </>
                )}
                {usageDetail?.prompt_preview ? (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-1">What was asked</div>
                    <pre className="text-sm bg-neutral-950 p-3 rounded border border-neutral-700 whitespace-pre-wrap overflow-x-auto max-h-40 overflow-y-auto">{usageDetail.prompt_preview}</pre>
                  </div>
                ) : (
                  <div className="mb-3 text-xs text-neutral-500">No prompt preview — older rows or fallback inserts may not store it. New requests should include it.</div>
                )}
                {usageDetail?.response_preview ? (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-1">AI response (preview)</div>
                    <pre className="text-sm bg-neutral-950 p-3 rounded border border-neutral-700 whitespace-pre-wrap overflow-x-auto max-h-40 overflow-y-auto">{usageDetail.response_preview}</pre>
                  </div>
                ) : usageDetail?.prompt_preview && (
                  <div className="mb-3 text-xs text-neutral-500">No response preview stored.</div>
                )}
                {usageDetail?.cost_reasons && <p className="text-sm text-neutral-400 mb-2">{usageDetail.cost_reasons}</p>}
                {usageDetail?.row && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-2">All fields</div>
                    <div className="overflow-x-auto max-h-64 overflow-y-auto rounded border border-neutral-800">
                      <table className="min-w-full text-xs">
                        <tbody>
                          {Object.entries(usageDetail.row)
                            .filter(([, v]) => v != null && v !== "")
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([k, v]) => (
                              <tr key={k} className="border-b border-neutral-800/80">
                                <td className="py-1 pr-2 font-mono text-neutral-500 align-top">{k}</td>
                                <td className="py-1 break-all">
                                  {typeof v === "object" ? JSON.stringify(v) : String(v)}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {usageDetail?.row && (
                  <details className="mt-2">
                    <summary className="text-xs text-neutral-500 cursor-pointer hover:text-neutral-400">Raw row (JSON)</summary>
                    <pre className="text-xs overflow-x-auto bg-neutral-950 p-2 rounded border border-neutral-800 whitespace-pre-wrap mt-1 max-h-48 overflow-y-auto">{JSON.stringify(usageDetail.row, null, 2)}</pre>
                  </details>
                )}
              </div>
            </div>
          )}
          <section className="rounded-xl border border-neutral-800 overflow-hidden bg-neutral-900/40 p-4">
            <h2 className="text-sm font-semibold text-neutral-200 mb-2">Config switchboard</h2>
            {configLoading && !config && <div className="text-sm text-neutral-500">Loading config…</div>}
            {config?.config && (
              <div className="space-y-2 text-sm">
                <p className="text-xs text-neutral-500">Flags (apply via POST /api/admin/ai/config with body {"{ updates: { flags: { ... } } }"})</p>
                <pre className="bg-neutral-950 p-2 rounded border border-neutral-800 text-xs overflow-x-auto">{JSON.stringify(config.config.flags, null, 2)}</pre>
                {config.last_updated?.length > 0 && <p className="text-xs text-neutral-500">Last updated: {config.last_updated.map((u: any) => `${u.key} by ${u.by}`).join("; ")}</p>}
              </div>
            )}
          </section>
          <section className="rounded-xl border border-neutral-800 overflow-hidden bg-neutral-900/40 p-4">
            <h2 className="text-sm font-semibold text-neutral-200 mb-2">Recommendations</h2>
            {recommendationsTelemetryUnhealthy && recommendationsMessage && (
              <p className="text-sm text-amber-200/90">{recommendationsMessage}</p>
            )}
            {!recommendationsTelemetryUnhealthy && recommendations.length === 0 && !recommendationsMessage && <p className="text-sm text-neutral-500">None or load recommendations.</p>}
            {!recommendationsTelemetryUnhealthy && recommendations.length > 0 && (
            <ul className="space-y-2 text-sm">
              {recommendations.map((rec: any, i: number) => (
                <li key={i} className="flex items-start justify-between gap-2">
                  <span className="text-neutral-300">{rec.text}</span>
                  {rec.suggested_key && <button type="button" onClick={() => alert("Apply: " + JSON.stringify(rec.suggested_value))} className="text-xs px-2 py-1 rounded bg-blue-800 hover:bg-blue-700 shrink-0">Apply switch</button>}
                </li>
              ))}
            </ul>
            )}
          </section>
        </div>
      )}

      {tab === "requests" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm flex items-center gap-1">
              <span className="opacity-70">Days</span>
              <input type="number" min={1} max={90} value={requestDays} onChange={e => setRequestDays(parseInt(e.target.value || "7", 10))} className="w-16 bg-neutral-950 border border-neutral-700 rounded px-2 py-1" />
            </label>
            <label className="text-sm flex items-center gap-1">
              <span className="opacity-70">Sort by</span>
              <select value={requestSort} onChange={e => setRequestSort(e.target.value as "time" | "cost" | "tokens")} className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1">
                <option value="cost">Cost (highest first)</option>
                <option value="time">Time (newest first)</option>
                <option value="tokens">Input tokens (highest first)</option>
              </select>
            </label>
            <label className="text-sm flex items-center gap-1">
              <span className="opacity-70">Route</span>
              <select
                value={requestRouteFilter}
                onChange={e => setRequestRouteFilter(e.target.value)}
                className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1 max-w-[140px]"
              >
                <option value="">All</option>
                <option value="chat">chat</option>
                <option value="chat_stream">chat_stream</option>
                <option value="deck_analyze">deck_analyze</option>
                <option value="deck_analyze_slot_planning">deck_analyze_slot_planning</option>
                <option value="deck_analyze_slot_candidates">deck_analyze_slot_candidates</option>
                <option value="swap_why">swap_why</option>
                <option value="swap_suggestions">swap_suggestions</option>
                <option value="deck_scan">deck_scan</option>
                <option value="deck_compare">deck_compare</option>
                <option value="reprint_risk">reprint_risk</option>
                <option value="suggestion_why">suggestion_why</option>
                <option value="debug_ping">debug_ping</option>
              </select>
            </label>
            <button onClick={() => loadRequests()} disabled={requestsLoading} className="px-3 py-1.5 rounded bg-blue-700 hover:bg-blue-600 text-white text-sm disabled:opacity-60">Reload requests</button>
            <button
              onClick={() => {
                const baseKeys = ["id", "created_at", "route", "route_page", "user_id", "user_email", "user_display_name", "thread_id", "deck_id", "model", "model_tier", "prompt_path", "format_key", "input_tokens", "output_tokens", "cost_usd", "legacy_cost", "corrected_cost_estimate", "pricing_version", "deck_size", "context_source", "summary_tokens_estimate", "deck_hash", "layer0_mode", "layer0_reason", "request_kind", "has_deck_context", "deck_card_count", "used_v2_summary", "used_two_stage", "planner_model", "planner_tokens_in", "planner_tokens_out", "planner_cost_usd", "stop_sequences_enabled", "max_tokens_config", "response_truncated", "user_tier", "is_guest", "latency_ms", "cache_hit", "cache_kind", "error_code", "prompt_tier", "system_prompt_token_estimate", "prompt_preview", "response_preview"];
                const rowKeys = [...new Set(baseKeys.filter((k, i, a) => a.indexOf(k) === i).concat(...requests.map((r: any) => Object.keys(r))))];
                const lines = [rowKeys, ...requests.map((r: any) => rowKeys.map(k => {
                  if (k === "route_page") return (getRouteContext(r.route)?.page ?? r.route ?? "") + " | " + (getRouteContext(r.route)?.description ?? "");
                  const v = r[k];
                  if (k === "prompt_preview" || k === "response_preview") return (v ?? "").slice(0, 5000);
                  return v;
                }))];
                const csv = lines.map(row => row.map((v: unknown) => '"' + String(v ?? "").replace(/"/g, '""') + '"').join(",")).join("\r\n");
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `ai_usage_requests_${requestDays}d_${new Date().toISOString().slice(0,10)}.csv`; a.click();
              }}
              className="px-3 py-1.5 rounded bg-neutral-700 hover:bg-neutral-600 text-sm"
            >
              Export request log CSV (all columns)
            </button>
          </div>
          <div className="rounded-lg border border-neutral-800 overflow-hidden">
            <div className="px-3 py-2 border-b border-neutral-800 text-sm font-medium text-neutral-300">Requests · click Details for input/output</div>
            {requestsLoading && <div className="text-sm opacity-70 py-4">Loading…</div>}
            {!requestsLoading && requests.length === 0 && <div className="text-sm opacity-70 py-4">No requests in range.</div>}
            {!requestsLoading && requests.length > 0 && (() => {
              const sorted = [...requests].sort((a: any, b: any) => {
                if (requestSort === "cost") return (Number(b.cost_usd) || 0) - (Number(a.cost_usd) || 0);
                if (requestSort === "tokens") return (Number(b.input_tokens) || 0) - (Number(a.input_tokens) || 0);
                return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
              });
              const costHighlight = 0.05;
              return (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-800">
                    <th className="text-left py-1 pr-2">Time</th>
                    <th className="text-left py-1 pr-2">User</th>
                    <th className="text-left py-1 pr-2">Route</th>
                    <th className="text-left py-1 pr-2">Called from</th>
                    <th className="text-left py-1 pr-2">Model</th>
                    <th className="text-left py-1 pr-2">Tier</th>
                    <th className="text-right py-1 pr-2">Cost</th>
                    <th className="text-right py-1 pr-2">In / Out</th>
                    <th className="text-left py-1 pr-2">Prompt path</th>
                    <th className="text-left py-1 pr-2 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r: any) => {
                    const cost = Number(r.cost_usd) || 0;
                    const isExpensive = cost >= costHighlight;
                    return (
                    <React.Fragment key={r.id}>
                      <tr className={`border-b border-neutral-900 hover:bg-neutral-900/50 ${isExpensive ? "bg-amber-950/40 border-l-2 border-l-amber-600" : ""}`}>
                        <td className="py-1 pr-2 whitespace-nowrap text-xs">{r.created_at ? new Date(r.created_at).toLocaleString() : ""}</td>
                        <td className="py-1 pr-2 max-w-[120px] truncate" title={r.user_email || r.user_id}>{r.user_email || r.user_display_name || (r.user_id ? String(r.user_id).slice(0, 8) + "…" : "—")}</td>
                        <td className="py-1 pr-2 font-mono text-xs">{r.route ?? "chat"}</td>
                        <td className="py-1 pr-2 text-xs text-neutral-400 max-w-[140px] truncate" title={r.source_page ? `${getCalledFromDisplay(r.route, r.source_page)} (${r.source_page})` : getRouteContext(r.route)?.description}>{getCalledFromDisplay(r.route, r.source_page)}</td>
                        <td className="py-1 pr-2">{r.model ?? "—"}</td>
                        <td className="py-1 pr-2">{r.model_tier ?? "—"}</td>
                        <td className={`py-1 pr-2 text-right font-mono ${isExpensive ? "text-amber-300 font-semibold" : ""}`}>${r.cost_usd}</td>
                        <td className="py-1 pr-2 text-right">{r.input_tokens} / {r.output_tokens}</td>
                        <td className="py-1 pr-2 max-w-[180px] truncate text-xs opacity-80">{r.prompt_path ?? "—"}</td>
                        <td className="py-1 pr-2">
                          <button type="button" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)} className="text-xs text-blue-400 hover:underline">
                            {expandedId === r.id ? "Hide" : "Details"}
                          </button>
                        </td>
                      </tr>
                      {expandedId === r.id && (
                        <tr className="border-b border-neutral-900 bg-neutral-900/70">
                          <td colSpan={10} className="py-2 pr-2 align-top">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                              <div>
                                <div className="font-medium text-neutral-400 mb-1">Input (preview)</div>
                                <pre className="whitespace-pre-wrap break-words max-h-40 overflow-y-auto rounded bg-neutral-950 p-2 border border-neutral-800">
                                  {r.prompt_preview || <span className="opacity-70">No preview (recorded before this feature or not stored)</span>}
                                </pre>
                              </div>
                              <div>
                                <div className="font-medium text-neutral-400 mb-1">Output (preview)</div>
                                <pre className="whitespace-pre-wrap break-words max-h-40 overflow-y-auto rounded bg-neutral-950 p-2 border border-neutral-800">
                                  {r.response_preview || <span className="opacity-70">No preview (recorded before this feature or not stored)</span>}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              );
            })()}
          </div>
        </div>
      )}

      {data && tab === "summary" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="rounded-xl border border-neutral-800 overflow-hidden bg-neutral-900/40">
              <div className="px-4 py-2.5 border-b border-neutral-800 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-200">By route</h2>
                <button onClick={() => exportCsv(data.by_route || [], ["route","messages","input_tokens","output_tokens","cost_usd"], (r: any) => [r.route,r.messages,r.input_tokens,r.output_tokens,r.cost_usd])} className="text-xs text-neutral-400 hover:text-white">Export</button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead><tr className="border-b border-neutral-800 text-neutral-500 text-left"><th className="px-4 py-2 font-medium">Route</th><th className="px-4 py-2 text-right">Req</th><th className="px-4 py-2 text-right">Cost</th></tr></thead>
                  <tbody>
                    {(data.by_route || []).map((r: any) => (
                      <tr key={r.route} className="border-b border-neutral-800/80 hover:bg-neutral-800/30">
                        <td className="px-4 py-2 font-mono text-xs">{r.route}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{r.messages}</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums">${r.cost_usd}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-xl border border-neutral-800 overflow-hidden bg-neutral-900/40">
              <div className="px-4 py-2.5 border-b border-neutral-800 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-200">By model</h2>
                <button onClick={() => exportCsv((data.by_model || []).filter((m: any) => !modelFilter || m.model === modelFilter), ["model","messages","input_tokens","output_tokens","cost_usd"], (m: any) => [m.model,m.messages,m.input_tokens,m.output_tokens,m.cost_usd])} className="text-xs text-neutral-400 hover:text-white">Export</button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead><tr className="border-b border-neutral-800 text-neutral-500 text-left"><th className="px-4 py-2 font-medium">Model</th><th className="px-4 py-2 text-right">Req</th><th className="px-4 py-2 text-right">Cost</th></tr></thead>
                  <tbody>
                    {(data.by_model || []).filter((m: any) => !modelFilter || m.model === modelFilter).map((m: any) => (
                      <tr key={m.model} className="border-b border-neutral-800/80 hover:bg-neutral-800/30">
                        <td className="px-4 py-2">{m.model}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{m.messages}</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums">${m.cost_usd}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="rounded-xl border border-neutral-800 overflow-hidden bg-neutral-900/40">
              <div className="px-4 py-2.5 border-b border-neutral-800 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-200">By day</h2>
                <button onClick={() => exportCsv(data.by_day, ["date","messages","cost_usd"], (d: any) => [d.date,d.messages,d.cost_usd])} className="text-xs text-neutral-400 hover:text-white">Export</button>
              </div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-neutral-900"><tr className="border-b border-neutral-800 text-neutral-500 text-left"><th className="px-4 py-2 font-medium">Date</th><th className="px-4 py-2 text-right">Req</th><th className="px-4 py-2 text-right">Cost</th></tr></thead>
                  <tbody>
                    {data.by_day.map((d: any) => (
                      <tr key={d.date} className="border-b border-neutral-800/80 hover:bg-neutral-800/30">
                        <td className="px-4 py-2">{d.date}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{d.messages}</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums">${d.cost_usd}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-xl border border-neutral-800 overflow-hidden bg-neutral-900/40">
              <div className="px-4 py-2.5 border-b border-neutral-800 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-200">Top users</h2>
                <button onClick={() => exportCsv(data.top_users, ["user_id","messages","input_tokens","output_tokens","cost_usd"], (u: any) => [u.user_id,u.messages,u.input_tokens,u.output_tokens,u.cost_usd])} className="text-xs text-neutral-400 hover:text-white">Export</button>
              </div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-neutral-900"><tr className="border-b border-neutral-800 text-neutral-500 text-left"><th className="px-4 py-2 font-medium">User</th><th className="px-4 py-2 text-right">Req</th><th className="px-4 py-2 text-right">Cost</th></tr></thead>
                  <tbody>
                    {data.top_users.map((u: any) => (
                      <tr key={u.user_id} className="border-b border-neutral-800/80 hover:bg-neutral-800/30 cursor-pointer" onClick={() => { setUserId(u.user_id); setTimeout(load, 0); }} title="Click to filter by this user">
                        <td className="px-4 py-2 font-mono text-xs truncate max-w-[180px]" title={u.user_id}>{u.user_id}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{u.messages}</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums">${u.cost_usd}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <details className="rounded-xl border border-neutral-800 overflow-hidden bg-neutral-900/40">
            <summary className="px-4 py-2.5 border-b border-neutral-800 cursor-pointer text-sm font-medium text-neutral-300 hover:text-white">Price snapshots &amp; tools</summary>
            <div className="p-4 space-y-4">
              <SnapshotInfo />
              <SnapshotRows />
            </div>
          </details>
        </div>
      )}

      </div>
    </div>
  );
}
