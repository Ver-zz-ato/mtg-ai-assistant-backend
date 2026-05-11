"use client";

import React from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ELI5 } from "@/components/AdminHelp";
import { getAppFeaturePageLabel } from "@/lib/ai/app-feature-labels";
import { AI_USAGE_SOURCE_MANATAP_APP } from "@/lib/ai/manatap-client-origin";

type SeriesView = "daily" | "hourly";
type ExportKind = "csv" | "json";

const PAGE_LIMIT = 200;

function money(n: unknown): string {
  const v = Number(n) || 0;
  if (v === 0) return "$0";
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}

function pct(n: unknown): string {
  if (n == null || Number.isNaN(Number(n))) return "-";
  return `${Math.round(Number(n) * 1000) / 10}%`;
}

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (!/[",\n\r]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportRows(filenameBase: string, rows: Array<Record<string, unknown>>, kind: ExportKind) {
  if (kind === "json") {
    downloadText(`${filenameBase}.json`, JSON.stringify(rows, null, 2), "application/json;charset=utf-8");
    return;
  }
  const columns = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((k) => set.add(k));
    return set;
  }, new Set<string>()));
  const csv = [
    columns.map(csvEscape).join(","),
    ...rows.map((row) => columns.map((c) => csvEscape(row[c])).join(",")),
  ].join("\n");
  downloadText(`${filenameBase}.csv`, csv, "text/csv;charset=utf-8");
}

function queryString(params: Record<string, string | number | boolean | null | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "" || value === false) continue;
    qs.set(key, String(value));
  }
  return qs.toString();
}

function Card({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/55 p-4 shadow-[0_0_24px_rgba(0,0,0,0.25)]">
      <div className="text-[11px] text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-2xl font-mono tabular-nums text-neutral-50">{value}</div>
      {sub ? <div className="mt-1 text-xs text-neutral-400">{sub}</div> : null}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  allLabel = "All",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  allLabel?: string;
}) {
  return (
    <label className="text-xs text-neutral-400 flex flex-col gap-1 min-w-[150px]">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm text-neutral-100"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function AdminAiUsageAppPage() {
  const [days, setDays] = React.useState(14);
  const [logDays, setLogDays] = React.useState(14);
  const [overview, setOverview] = React.useState<any>(null);
  const [overviewLoading, setOverviewLoading] = React.useState(false);
  const [overviewErr, setOverviewErr] = React.useState<string | null>(null);
  const [requests, setRequests] = React.useState<any[]>([]);
  const [reqLoading, setReqLoading] = React.useState(false);
  const [reqTotal, setReqTotal] = React.useState(0);
  const [offset, setOffset] = React.useState(0);
  const [seriesView, setSeriesView] = React.useState<SeriesView>("daily");
  const [sourcePage, setSourcePage] = React.useState("");
  const [model, setModel] = React.useState("");
  const [route, setRoute] = React.useState("");
  const [requestKind, setRequestKind] = React.useState("");
  const [userId, setUserId] = React.useState("");
  const [cacheHit, setCacheHit] = React.useState("");
  const [errorOnly, setErrorOnly] = React.useState(false);
  const [autoRefresh, setAutoRefresh] = React.useState(false);
  const [lastUpdated, setLastUpdated] = React.useState<string | null>(null);

  const filterParams = React.useMemo(
    () => ({
      source_page: sourcePage,
      model,
      route,
      request_kind: requestKind,
      user_id: userId.trim(),
      cache_hit: cacheHit,
      error_only: errorOnly,
    }),
    [cacheHit, errorOnly, model, requestKind, route, sourcePage, userId]
  );

  async function loadOverview() {
    setOverviewLoading(true);
    setOverviewErr(null);
    try {
      const qs = queryString({ days, ...filterParams });
      const res = await fetch(`/api/admin/ai-usage-app/overview?${qs}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || res.statusText);
      setOverview(j);
      setLastUpdated(new Date().toISOString());
    } catch (e: unknown) {
      setOverview(null);
      setOverviewErr(e instanceof Error ? e.message : "error");
    } finally {
      setOverviewLoading(false);
    }
  }

  async function loadRequests(nextOffset = offset) {
    setReqLoading(true);
    try {
      const qs = queryString({ days: logDays, limit: PAGE_LIMIT, offset: nextOffset, ...filterParams });
      const res = await fetch(`/api/admin/ai-usage-app/requests?${qs}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || "requests failed");
      setRequests(j.requests || []);
      setReqTotal(Number(j.total) || 0);
      setOffset(Number(j.offset) || 0);
    } catch {
      setRequests([]);
      setReqTotal(0);
    } finally {
      setReqLoading(false);
    }
  }

  React.useEffect(() => {
    setOffset(0);
    loadOverview();
    loadRequests(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, logDays, filterParams]);

  React.useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      loadOverview();
      loadRequests(0);
    }, 60_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, days, logDays, filterParams]);

  const t = overview?.totals;
  const options = overview?.options || {};
  const series = seriesView === "daily" ? overview?.series_daily : overview?.series_hourly;
  const activeFilterCount = Object.values(filterParams).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4 md:p-8 space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI usage - mobile app</h1>
          <p className="text-sm text-neutral-400 mt-1">
            App-only rows: <code className="text-amber-200/90">{AI_USAGE_SOURCE_MANATAP_APP}</code> or{" "}
            <code className="text-amber-200/90">source_page</code> prefix <code className="text-amber-200/90">app_</code>.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => exportRows("manatap-app-ai-usage-requests", requests, "csv")}
            className="text-sm px-3 py-1.5 rounded border border-emerald-700/70 bg-emerald-950/30 hover:bg-emerald-900/40"
            disabled={requests.length === 0}
          >
            Export rows CSV
          </button>
          <label className="text-sm px-3 py-1.5 rounded border border-neutral-700 bg-neutral-900/50 inline-flex items-center gap-2">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto refresh
          </label>
          <button
            type="button"
            onClick={() => exportRows("manatap-app-ai-usage-overview", [overview || {}], "json")}
            className="text-sm px-3 py-1.5 rounded border border-blue-700/70 bg-blue-950/30 hover:bg-blue-900/40"
            disabled={!overview}
          >
            Export summary JSON
          </button>
          <Link href="/admin/ai-usage" className="text-sm px-3 py-1.5 rounded border border-neutral-700 hover:bg-neutral-900">
            Website AI usage
          </Link>
          <Link href="/admin/JustForDavy" className="text-sm px-3 py-1.5 rounded border border-neutral-700 hover:bg-neutral-900">
            Admin home
          </Link>
        </div>
      </div>

      <ELI5
        heading="What this dashboard is for"
        items={[
          "Only Expo app AI calls are included, so website experiments do not muddy app cost numbers.",
          "Use filters to answer: which app feature costs most, which model is used, who is generating load, and where errors/cache misses are happening.",
          "Export the current rows as CSV for spreadsheets, or the summary as JSON for deeper analysis.",
        ]}
      />

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/35 p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold">Filters</h2>
            <p className="text-xs text-neutral-500">
              {activeFilterCount ? `${activeFilterCount} active filter(s)` : "Showing all app AI usage"}
              {lastUpdated ? ` · updated ${new Date(lastUpdated).toLocaleTimeString()}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSourcePage("");
                setModel("");
                setRoute("");
                setRequestKind("");
                setUserId("");
                setCacheHit("");
                setErrorOnly(false);
              }}
              className="text-xs px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700"
            >
              Clear filters
            </button>
            <button
              type="button"
              onClick={() => {
                loadOverview();
                loadRequests(0);
              }}
              className="text-xs px-3 py-1.5 rounded bg-emerald-800 hover:bg-emerald-700"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          <label className="text-xs text-neutral-400 flex flex-col gap-1">
            Overview
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm">
              {[1, 3, 7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          </label>
          <label className="text-xs text-neutral-400 flex flex-col gap-1">
            Logs
            <select value={logDays} onChange={(e) => setLogDays(Number(e.target.value))} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm">
              {[1, 3, 7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          </label>
          <Select label="Feature" value={sourcePage} onChange={setSourcePage} options={options.source_pages || []} />
          <Select label="Model" value={model} onChange={setModel} options={options.models || []} />
          <Select label="Route" value={route} onChange={setRoute} options={options.routes || []} />
          <Select label="Kind" value={requestKind} onChange={setRequestKind} options={options.request_kinds || []} />
          <label className="text-xs text-neutral-400 flex flex-col gap-1">
            Cache
            <select value={cacheHit} onChange={(e) => setCacheHit(e.target.value)} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm">
              <option value="">All</option>
              <option value="true">Cache hits</option>
              <option value="false">Cache misses</option>
            </select>
          </label>
          <label className="text-xs text-neutral-400 flex flex-col gap-1">
            User id
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Paste user UUID"
              className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm"
            />
          </label>
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-neutral-300">
          <input type="checkbox" checked={errorOnly} onChange={(e) => setErrorOnly(e.target.checked)} />
          Show errors only
        </label>
      </section>

      {overviewErr && <div className="rounded border border-red-900 bg-red-950/40 text-red-200 text-sm px-3 py-2">{overviewErr}</div>}
      {overviewLoading && !overview && <div className="text-sm text-neutral-500">Loading overview...</div>}

      {overview?.totals && (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
            <Card label="Requests" value={t.total_requests} />
            <Card label="Cost" value={money(t.total_cost_usd)} sub={`${money(t.avg_cost)} avg/request`} />
            <Card label="Tokens in" value={(t.total_tokens_in ?? 0).toLocaleString()} />
            <Card label="Tokens out" value={(t.total_tokens_out ?? 0).toLocaleString()} />
            <Card label="Latency" value={t.avg_latency_ms != null ? `${t.avg_latency_ms} ms` : "-"} sub={`p95 ${t.p95_latency_ms ?? "-"} ms`} />
            <Card label="Errors" value={t.errors ?? 0} sub={`${pct(t.error_rate)} error rate`} />
            <Card label="Cache" value={t.cache_hits ?? 0} sub={t.cache_hit_rate == null ? "no cache data" : `${pct(t.cache_hit_rate)} hit rate`} />
            <Card label="Rows loaded" value={(requests.length || 0).toLocaleString()} sub={`${reqTotal.toLocaleString()} matched logs`} />
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-neutral-200">Cost over time</h2>
                <button
                  type="button"
                  onClick={() => setSeriesView((s) => (s === "daily" ? "hourly" : "daily"))}
                  className="text-xs px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
                >
                  {seriesView === "daily" ? "Hourly" : "Daily"}
                </button>
              </div>
              <div className="h-64">
                {series?.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                      <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                      <XAxis dataKey={seriesView === "daily" ? "date" : "hour"} tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: "#111", border: "1px solid #333" }} />
                      <Area type="monotone" dataKey="cost_usd" stroke="#22c55e" fill="#064e3b" name="Cost USD" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-sm text-neutral-500">No matching usage in this window.</div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
              <h2 className="text-sm font-semibold text-neutral-200 mb-3">Top app features</h2>
              <div className="h-64">
                {(overview.by_source_page || []).length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={(overview.by_source_page || []).slice(0, 8)} layout="vertical" margin={{ left: 12, right: 8 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="id" width={110} tick={{ fontSize: 10 }} tickFormatter={getAppFeaturePageLabel} />
                      <Tooltip contentStyle={{ background: "#111", border: "1px solid #333" }} />
                      <Bar dataKey="cost_usd" fill="#38bdf8" name="Cost USD" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-sm text-neutral-500">No feature rows.</div>
                )}
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Breakdown title="By app feature" rows={overview.by_source_page || []} idLabel={(id) => getAppFeaturePageLabel(id)} onPick={(id) => setSourcePage(id)} />
            <Breakdown title="By model" rows={overview.by_model || []} />
            <Breakdown title="By request kind" rows={overview.by_request_kind || []} />
            <Breakdown title="By route" rows={overview.by_route || []} costKey="total_cost_usd" requestKey="total_requests" onPick={(id) => setRoute(id)} />
            <Breakdown title="By user" rows={overview.by_user || []} subKey="errors" onPick={(id) => !id.startsWith("(") && setUserId(id)} />
            <Breakdown title="Errors" rows={overview.by_error || []} />
          </section>
        </>
      )}

      <section className="rounded-xl border border-neutral-800 overflow-hidden bg-neutral-900/40">
        <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-neutral-200">Recent app AI requests</h2>
            <p className="text-xs text-neutral-500">
              {reqTotal.toLocaleString()} matched row(s). Showing {offset + 1}-{Math.min(offset + requests.length, reqTotal)}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadRequests(Math.max(0, offset - PAGE_LIMIT))}
              disabled={offset === 0 || reqLoading}
              className="text-xs px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => loadRequests(offset + PAGE_LIMIT)}
              disabled={offset + PAGE_LIMIT >= reqTotal || reqLoading}
              className="text-xs px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
        {reqLoading && <div className="p-4 text-sm text-neutral-500">Loading...</div>}
        {!reqLoading && requests.length === 0 && (
          <div className="p-4 text-sm text-neutral-500">
            No app-tagged rows in this log window. Try widening the log window or clearing filters.
          </div>
        )}
        {requests.length > 0 && (
          <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-neutral-900 z-10">
                <tr className="border-b border-neutral-800">
                  <th className="text-left px-2 py-2">Time</th>
                  <th className="text-left px-2 py-2">Feature</th>
                  <th className="text-left px-2 py-2">Route</th>
                  <th className="text-left px-2 py-2">Model</th>
                  <th className="text-left px-2 py-2">Kind</th>
                  <th className="text-left px-2 py-2">User</th>
                  <th className="text-right px-2 py-2">Tokens</th>
                  <th className="text-right px-2 py-2">ms</th>
                  <th className="text-right px-2 py-2">$</th>
                  <th className="text-left px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={String(r.id)} className="border-b border-neutral-800/80 hover:bg-neutral-800/25">
                    <td className="px-2 py-1.5 text-xs whitespace-nowrap">{r.created_at ? new Date(r.created_at as string).toLocaleString() : ""}</td>
                    <td className="px-2 py-1.5 text-xs min-w-[180px]">
                      <button type="button" onClick={() => setSourcePage(String(r.source_page || ""))} className="text-sky-300 hover:underline">
                        {getAppFeaturePageLabel(r.source_page as string)}
                      </button>
                      <div className="font-mono text-[10px] text-neutral-500">{String(r.source_page ?? "-")}</div>
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[11px] max-w-[260px] break-all">{String(r.route ?? "-")}</td>
                    <td className="px-2 py-1.5 font-mono text-xs">{String(r.model ?? "-")}</td>
                    <td className="px-2 py-1.5 text-xs">{String(r.request_kind ?? r.layer0_mode ?? "-")}</td>
                    <td className="px-2 py-1.5 text-xs max-w-[180px]">
                      <div>{String(r.user_display_name || r.user_email || (r.is_guest ? "Guest" : "-"))}</div>
                      {r.user_id ? <div className="font-mono text-[10px] text-neutral-500 truncate">{String(r.user_id)}</div> : null}
                    </td>
                    <td className="px-2 py-1.5 text-right text-xs tabular-nums">
                      {((Number(r.input_tokens) || 0) + (Number(r.output_tokens) || 0)).toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 text-right text-xs tabular-nums">{r.latency_ms != null ? String(r.latency_ms) : "-"}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs">{money(r.cost_usd)}</td>
                    <td className="px-2 py-1.5 text-xs">
                      {r.error_code ? (
                        <span className="rounded-full border border-red-700 bg-red-950/40 px-2 py-0.5 text-red-200">{String(r.error_code)}</span>
                      ) : r.cache_hit ? (
                        <span className="rounded-full border border-emerald-700 bg-emerald-950/40 px-2 py-0.5 text-emerald-200">cache</span>
                      ) : (
                        <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-neutral-300">ok</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Breakdown({
  title,
  rows,
  idLabel,
  costKey = "cost_usd",
  requestKey = "requests",
  subKey,
  onPick,
}: {
  title: string;
  rows: any[];
  idLabel?: (id: string) => string;
  costKey?: string;
  requestKey?: string;
  subKey?: string;
  onPick?: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 overflow-hidden bg-neutral-900/40">
      <div className="px-4 py-2 border-b border-neutral-800 text-sm font-semibold text-neutral-200">{title}</div>
      <div className="overflow-x-auto max-h-72 overflow-y-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-neutral-900">
            <tr className="border-b border-neutral-800">
              <th className="text-left px-3 py-2">Key</th>
              <th className="text-right px-3 py-2">Req</th>
              <th className="text-right px-3 py-2">$</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={3} className="px-3 py-3 text-neutral-500">No rows.</td></tr>
            ) : rows.map((row) => {
              const id = String(row.id ?? "-");
              const label = idLabel ? idLabel(id) : id;
              return (
                <tr key={id} className="border-b border-neutral-800/80 hover:bg-neutral-800/25">
                  <td className="px-3 py-1.5">
                    {onPick ? (
                      <button type="button" onClick={() => onPick(id)} className="text-left text-sky-300 hover:underline">
                        {label}
                      </button>
                    ) : (
                      <span>{label}</span>
                    )}
                    {label !== id ? <div className="font-mono text-[10px] text-neutral-500 break-all">{id}</div> : null}
                    {subKey ? <div className="text-[10px] text-neutral-500">{subKey}: {String(row[subKey] ?? 0)}</div> : null}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{Number(row[requestKey] ?? 0).toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{money(row[costKey])}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
