"use client";

import React from "react";
import Link from "next/link";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ELI5 } from "@/components/AdminHelp";
import { getAppFeaturePageLabel } from "@/lib/ai/app-feature-labels";
import { AI_USAGE_SOURCE_MANATAP_APP } from "@/lib/ai/manatap-client-origin";

export default function AdminAiUsageAppPage() {
  const [days, setDays] = React.useState(14);
  const [logDays, setLogDays] = React.useState(7);
  const [overview, setOverview] = React.useState<any>(null);
  const [overviewLoading, setOverviewLoading] = React.useState(false);
  const [overviewErr, setOverviewErr] = React.useState<string | null>(null);
  const [requests, setRequests] = React.useState<any[]>([]);
  const [reqLoading, setReqLoading] = React.useState(false);
  const [seriesView, setSeriesView] = React.useState<"daily" | "hourly">("daily");

  async function loadOverview() {
    setOverviewLoading(true);
    setOverviewErr(null);
    try {
      const res = await fetch(`/api/admin/ai-usage-app/overview?days=${days}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || res.statusText);
      setOverview(j);
    } catch (e: unknown) {
      setOverview(null);
      setOverviewErr(e instanceof Error ? e.message : "error");
    } finally {
      setOverviewLoading(false);
    }
  }

  async function loadRequests() {
    setReqLoading(true);
    try {
      const res = await fetch(`/api/admin/ai-usage-app/requests?days=${logDays}&limit=100`, {
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || "requests failed");
      setRequests(j.requests || []);
    } catch {
      setRequests([]);
    } finally {
      setReqLoading(false);
    }
  }

  React.useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  React.useEffect(() => {
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logDays]);

  const t = overview?.totals;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4 md:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">AI usage — mobile app</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Filter: <code className="text-amber-200/90">{AI_USAGE_SOURCE_MANATAP_APP}</code> or{" "}
            <code className="text-amber-200/90">source_page</code> prefix <code className="text-amber-200/90">app_</code>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/admin/ai-usage"
            className="text-sm px-3 py-1.5 rounded border border-neutral-700 hover:bg-neutral-900"
          >
            ← Website AI usage
          </Link>
          <Link href="/admin/JustForDavy" className="text-sm px-3 py-1.5 rounded border border-neutral-700 hover:bg-neutral-900">
            Admin home
          </Link>
        </div>
      </div>

      <ELI5
        heading="What is this?"
        items={[
          "Costs and requests from the Expo app only.",
          "The app should send header X-ManaTap-Client: manatap_app (or JSON usageSource: manatap_app) plus a stable sourcePage per feature (e.g. app_deck_analyze).",
          "Older rows may still show if source_page starts with app_ (fallback filter).",
        ]}
      />

      <section className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-neutral-400 flex items-center gap-2">
          Overview window
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm"
          >
            {[7, 14, 30, 60, 90].map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-neutral-400 flex items-center gap-2">
          Log window
          <select
            value={logDays}
            onChange={(e) => setLogDays(Number(e.target.value))}
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm"
          >
            {[3, 7, 14, 30].map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            loadOverview();
            loadRequests();
          }}
          className="text-xs px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700"
        >
          Refresh
        </button>
      </section>

      {overviewErr && (
        <div className="rounded border border-red-900 bg-red-950/40 text-red-200 text-sm px-3 py-2">{overviewErr}</div>
      )}

      {overviewLoading && !overview && <div className="text-sm text-neutral-500">Loading overview…</div>}

      {overview?.totals && (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
              <div className="text-xs text-neutral-500 uppercase">Requests</div>
              <div className="text-2xl font-mono tabular-nums">{t.total_requests}</div>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
              <div className="text-xs text-neutral-500 uppercase">Cost USD</div>
              <div className="text-2xl font-mono tabular-nums">${t.total_cost_usd}</div>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
              <div className="text-xs text-neutral-500 uppercase">Tokens in / out</div>
              <div className="text-lg font-mono tabular-nums">
                {(t.total_tokens_in ?? 0).toLocaleString()} / {(t.total_tokens_out ?? 0).toLocaleString()}
              </div>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
              <div className="text-xs text-neutral-500 uppercase">Latency avg / p95</div>
              <div className="text-lg font-mono tabular-nums">
                {t.avg_latency_ms != null ? `${t.avg_latency_ms} ms` : "—"} /{" "}
                {t.p95_latency_ms != null ? `${t.p95_latency_ms} ms` : "—"}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-neutral-200">Time series</h2>
              <button
                type="button"
                onClick={() => setSeriesView((s) => (s === "daily" ? "hourly" : "daily"))}
                className="text-xs px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
              >
                {seriesView === "daily" ? "Hourly" : "Daily"}
              </button>
            </div>
            <div className="h-56">
              {(seriesView === "daily" ? overview.series_daily : overview.series_hourly)?.length > 0 && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={seriesView === "daily" ? overview.series_daily : overview.series_hourly}
                    margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                  >
                    <XAxis dataKey={seriesView === "daily" ? "date" : "hour"} tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="cost_usd"
                      stroke="#22c55e"
                      fill="#22c55e/25"
                      name="Cost USD"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-neutral-800 overflow-hidden bg-neutral-900/40">
              <div className="px-4 py-2 border-b border-neutral-800 text-sm font-semibold text-neutral-200">
                By app feature (source_page)
              </div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-neutral-900">
                    <tr className="border-b border-neutral-800">
                      <th className="text-left px-3 py-2">Key</th>
                      <th className="text-left px-3 py-2">Label</th>
                      <th className="text-right px-3 py-2">Req</th>
                      <th className="text-right px-3 py-2">$</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overview.by_source_page || []).map((s: any) => (
                      <tr key={s.id} className="border-b border-neutral-800/80">
                        <td className="px-3 py-1.5 font-mono text-xs break-all">{s.id}</td>
                        <td className="px-3 py-1.5 text-xs text-neutral-300">{getAppFeaturePageLabel(s.id)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{s.requests}</td>
                        <td className="px-3 py-1.5 text-right font-mono">${s.cost_usd}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="rounded-xl border border-neutral-800 overflow-hidden bg-neutral-900/40">
              <div className="px-4 py-2 border-b border-neutral-800 text-sm font-semibold text-neutral-200">By model</div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="min-w-full text-sm">
                  <tbody>
                    {(overview.by_model || []).map((m: any) => (
                      <tr key={m.id} className="border-b border-neutral-800/80">
                        <td className="px-4 py-1.5 font-mono text-xs">{m.id}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums">{m.requests}</td>
                        <td className="px-4 py-1.5 text-right font-mono">${m.cost_usd}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}

      <section className="rounded-xl border border-neutral-800 overflow-hidden bg-neutral-900/40">
        <div className="px-4 py-2 border-b border-neutral-800 text-sm font-semibold text-neutral-200">
          Recent requests
        </div>
        {reqLoading && <div className="p-4 text-sm text-neutral-500">Loading…</div>}
        {!reqLoading && requests.length === 0 && (
          <div className="p-4 text-sm text-neutral-500">No app-tagged rows in this window.</div>
        )}
        {requests.length > 0 && (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-neutral-900">
                <tr className="border-b border-neutral-800">
                  <th className="text-left px-2 py-2">Time</th>
                  <th className="text-left px-2 py-2">Feature</th>
                  <th className="text-left px-2 py-2">source_page</th>
                  <th className="text-left px-2 py-2">source</th>
                  <th className="text-left px-2 py-2">Route</th>
                  <th className="text-left px-2 py-2">Model</th>
                  <th className="text-right px-2 py-2">ms</th>
                  <th className="text-right px-2 py-2">$</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={String(r.id)} className="border-b border-neutral-800/80 hover:bg-neutral-800/20">
                    <td className="px-2 py-1 text-xs whitespace-nowrap">
                      {r.created_at ? new Date(r.created_at as string).toLocaleString() : ""}
                    </td>
                    <td className="px-2 py-1 text-xs text-neutral-300 max-w-[140px]">
                      {getAppFeaturePageLabel(r.source_page as string)}
                    </td>
                    <td className="px-2 py-1 font-mono text-[11px] text-neutral-400 max-w-[180px] break-all">
                      {String(r.source_page ?? "—")}
                    </td>
                    <td className="px-2 py-1 font-mono text-[11px]">{String(r.source ?? "—")}</td>
                    <td className="px-2 py-1 font-mono text-xs">{String(r.route ?? "—")}</td>
                    <td className="px-2 py-1 font-mono text-xs">{String(r.model ?? "—")}</td>
                    <td className="px-2 py-1 text-right text-xs tabular-nums">
                      {r.latency_ms != null ? String(r.latency_ms) : "—"}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-xs">${String(r.cost_usd ?? 0)}</td>
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
