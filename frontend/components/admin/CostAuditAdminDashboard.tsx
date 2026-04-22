"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type WindowKey = "15m" | "1h" | "6h" | "24h" | "7d";

type ApiRow = Record<string, unknown>;

export function CostAuditAdminDashboard() {
  const [windowKey, setWindowKey] = useState<WindowKey>("24h");
  const [route, setRoute] = useState("");
  const [eventName, setEventName] = useState("");
  const [source, setSource] = useState("");
  const [requestId, setRequestId] = useState("");
  const [userId, setUserId] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ApiRow | null>(null);
  const [detail, setDetail] = useState<ApiRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams();
      sp.set("window", windowKey);
      if (route.trim()) sp.set("route", route.trim());
      if (eventName.trim()) sp.set("event_name", eventName.trim());
      if (source.trim()) sp.set("source", source.trim());
      if (requestId.trim()) sp.set("request_id", requestId.trim());
      if (userId.trim()) sp.set("user_id", userId.trim());
      sp.set("page", String(page));
      sp.set("pageSize", "40");
      const res = await fetch(`/api/admin/cost-audit?${sp.toString()}`, { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error || `HTTP ${res.status}`);
        setPayload(null);
        return;
      }
      setPayload(json);
    } catch {
      setError("fetch_failed");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [windowKey, route, eventName, source, requestId, userId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const pct = (x: number | null | undefined) =>
    x == null || Number.isNaN(x) ? "—" : `${Math.round(x * 1000) / 10}%`;

  const summary = (payload?.summary as ApiRow) || {};
  const leaderboard = (payload?.leaderboard as ApiRow[]) || [];
  const shout = (payload?.shout as ApiRow) || {};
  const playstyle = (payload?.playstyle as ApiRow) || {};
  const price = (payload?.price as ApiRow) || {};
  const fuzzy = (payload?.fuzzy as ApiRow) || {};
  const recent = (payload?.recent as ApiRow) || {};
  const recentRows = (recent.rows as ApiRow[]) || [];

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-6 text-neutral-100">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Cost audit (Vercel / hot routes)</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Pass 1.5 — persisted observability. Requires{" "}
            <code className="text-neutral-300">VERCEL_COST_AUDIT_DB=1</code> and migration{" "}
            <code className="text-neutral-300">100_observability_cost_events</code>.
          </p>
        </div>
        <Link
          href="/admin/JustForDavy"
          className="text-sm text-blue-400 hover:text-blue-300 border border-neutral-600 rounded-lg px-3 py-1.5"
        >
          ← JustForDavy hub
        </Link>
      </div>

      <section className="rounded-xl border border-neutral-700 bg-neutral-900/50 p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-neutral-500 uppercase tracking-wide">Window</span>
          {(["15m", "1h", "6h", "24h", "7d"] as WindowKey[]).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => {
                setPage(0);
                setWindowKey(w);
              }}
              className={`px-2.5 py-1 rounded-md text-sm border ${
                windowKey === w
                  ? "bg-neutral-700 border-neutral-500 text-white"
                  : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
              }`}
            >
              {w}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <FilterInput label="Route" value={route} onChange={setRoute} placeholder="/api/price" />
          <FilterInput label="Event" value={eventName} onChange={setEventName} placeholder="price.request" />
          <FilterInput label="Source" value={source} onChange={setSource} placeholder="server | client" />
          <FilterInput label="Request id" value={requestId} onChange={setRequestId} />
          <FilterInput label="User id" value={userId} onChange={setUserId} />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setPage(0);
              void load();
            }}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm"
          >
            Apply filters
          </button>
          {loading ? <span className="text-sm text-neutral-500 self-center">Loading…</span> : null}
          {error ? <span className="text-sm text-red-400 self-center">{error}</span> : null}
        </div>
        {summary.truncatedSample ? (
          <p className="text-xs text-amber-400">
            Sample capped at 8k rows for aggregates; narrow the window or filters for full coverage.
          </p>
        ) : null}
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        <StatCard label="Events (sample)" value={String(summary.totalEvents ?? "0")} />
        <StatCard label="Homepage renders" value={String(summary.homepageRenders ?? "0")} />
        <StatCard label="Shout stream open" value={String(summary.shoutStreamOpens ?? "0")} />
        <StatCard label="Shout stream close" value={String(summary.shoutStreamCloses ?? "0")} />
        <StatCard label="Playstyle explain" value={String(summary.playstyleExplainCalls ?? "0")} />
        <StatCard label="Playstyle cache hit" value={pct(summary.playstyleCacheHitRate as number)} />
        <StatCard label="Price requests" value={String(summary.priceRequests ?? "0")} />
        <StatCard label="Price cache hit" value={pct(summary.priceCacheHitRate as number)} />
        <StatCard label="Fuzzy requests" value={String(summary.fuzzyRequests ?? "0")} />
        <StatCard label="Fuzzy external %" value={pct(summary.fuzzyExternalLookupRate as number)} />
        <StatCard label="Deck comments" value={String(summary.commentRequests ?? "0")} />
      </section>

      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
        <h2 className="text-sm font-semibold text-neutral-200 mb-2">Route leaderboard</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-left text-neutral-500 border-b border-neutral-700">
                <th className="py-2 pr-3">Event</th>
                <th className="py-2 pr-3">Route</th>
                <th className="py-2 pr-3">Calls</th>
                <th className="py-2 pr-3">Avg ms</th>
                <th className="py-2 pr-3">p95 ms</th>
                <th className="py-2 pr-3">Errors</th>
                <th className="py-2 pr-3">Cache hit</th>
                <th className="py-2 pr-3">Latest</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-4 text-neutral-500">
                    No rows in this window.
                  </td>
                </tr>
              ) : (
                leaderboard.map((row) => (
                  <tr key={String(row.key)} className="border-b border-neutral-800/80">
                    <td className="py-1.5 pr-3 font-mono text-[11px]">{String(row.event_name)}</td>
                    <td className="py-1.5 pr-3 font-mono text-[11px] text-neutral-400">{String(row.route ?? "")}</td>
                    <td className="py-1.5 pr-3">{String(row.calls)}</td>
                    <td className="py-1.5 pr-3">
                      {row.avgDurationMs == null ? "—" : Math.round(Number(row.avgDurationMs))}
                    </td>
                    <td className="py-1.5 pr-3">
                      {row.p95DurationMs == null ? "—" : Math.round(Number(row.p95DurationMs))}
                    </td>
                    <td className="py-1.5 pr-3">{String(row.errors)}</td>
                    <td className="py-1.5 pr-3">{pct(row.cacheHitPct as number)}</td>
                    <td className="py-1.5 pr-3 text-neutral-500 whitespace-nowrap">
                      {row.latestAt ? new Date(String(row.latestAt)).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Shout stream">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <dt className="text-neutral-500">Opens</dt>
            <dd>{String(shout.openCount ?? 0)}</dd>
            <dt className="text-neutral-500">Closes</dt>
            <dd>{String(shout.closeCount ?? 0)}</dd>
            <dt className="text-neutral-500">Avg duration</dt>
            <dd>{fmtMs(shout.avgDurationMs as number)}</dd>
            <dt className="text-neutral-500">Median</dt>
            <dd>{fmtMs(shout.medianDurationMs as number)}</dd>
            <dt className="text-neutral-500">&lt;10s closes</dt>
            <dd>{String(shout.shortCloseCount ?? 0)}</dd>
          </dl>
          <MiniTable
            rows={(shout.recent as ApiRow[]) || []}
            columns={["created_at", "event_name", "duration_ms", "request_id"]}
          />
        </Panel>

        <Panel title="Playstyle explain">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm mb-2">
            <dt className="text-neutral-500">Total</dt>
            <dd>{String(playstyle.total ?? 0)}</dd>
            <dt className="text-neutral-500">Cache hit</dt>
            <dd>{pct(playstyle.cacheHitRate as number)}</dd>
          </dl>
          <p className="text-xs text-neutral-500 mb-1">Source breakdown</p>
          <ul className="text-sm space-y-0.5 mb-2">
            {Object.entries((playstyle.sourceBreakdown as Record<string, number>) || {}).map(([k, v]) => (
              <li key={k}>
                <span className="text-neutral-400">{k}</span>: {v}
              </li>
            ))}
          </ul>
          {(playstyle.repeatedCacheKeys as ApiRow[])?.length ? (
            <div className="mb-2">
              <p className="text-xs text-neutral-500">Repeated cache keys</p>
              <ul className="text-xs font-mono space-y-0.5">
                {(playstyle.repeatedCacheKeys as ApiRow[]).map((r) => (
                  <li key={String(r.cache_key)}>
                    {String(r.count)}× {String(r.cache_key).slice(0, 72)}
                    {String(r.cache_key).length > 72 ? "…" : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <MiniTable rows={(playstyle.recent as ApiRow[]) || []} columns={["created_at", "cache_hit", "source_detail", "duration_ms"]} />
        </Panel>

        <Panel title="Price">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm mb-2">
            <dt className="text-neutral-500">GET</dt>
            <dd>{String(price.getCount ?? 0)}</dd>
            <dt className="text-neutral-500">POST</dt>
            <dd>{String(price.postCount ?? 0)}</dd>
            <dt className="text-neutral-500">Cache hit</dt>
            <dd>{pct(price.cacheHitRate as number)}</dd>
            <dt className="text-neutral-500">scryfallUsed rows</dt>
            <dd>{String(price.scryfallUsed ?? 0)}</dd>
            <dt className="text-neutral-500">FX fetches</dt>
            <dd>{String(price.fxUsed ?? 0)}</dd>
          </dl>
          {price.biggestNamesRequest ? (
            <p className="text-xs text-neutral-400 mb-2">
              Largest batch: {String((price.biggestNamesRequest as ApiRow).namesCount)} names (
              {(price.biggestNamesRequest as ApiRow).method as string}) at{" "}
              {new Date(String((price.biggestNamesRequest as ApiRow).created_at)).toLocaleString()}
            </p>
          ) : null}
          <MiniTable rows={(price.recent as ApiRow[]) || []} columns={["created_at", "method", "cache_hit", "count_1"]} />
        </Panel>

        <Panel title="Fuzzy">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm mb-2">
            <dt className="text-neutral-500">Total</dt>
            <dd>{String(fuzzy.total ?? 0)}</dd>
            <dt className="text-neutral-500">Avg names</dt>
            <dd>
              {fuzzy.avgNamesCount == null ? "—" : Number(fuzzy.avgNamesCount).toFixed(1)}
            </dd>
            <dt className="text-neutral-500">External lookups</dt>
            <dd>{String(fuzzy.externalLookupCount ?? 0)}</dd>
            <dt className="text-neutral-500">Scryfall HTTP (sum)</dt>
            <dd>{String(fuzzy.scryfallHttpSum ?? 0)}</dd>
          </dl>
          <MiniTable rows={(fuzzy.recent as ApiRow[]) || []} columns={["created_at", "count_1", "count_2"]} />
        </Panel>
      </div>

      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-neutral-200">Recent events</h2>
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              disabled={page <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="px-2 py-1 rounded border border-neutral-600 disabled:opacity-40"
            >
              Prev
            </button>
            <span className="text-neutral-500">Page {page + 1}</span>
            <button
              type="button"
              disabled={recentRows.length < 40}
              onClick={() => setPage((p) => p + 1)}
              className="px-2 py-1 rounded border border-neutral-600 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-left text-neutral-500 border-b border-neutral-700">
                <th className="py-2 pr-2">Time</th>
                <th className="py-2 pr-2">Event</th>
                <th className="py-2 pr-2">Route</th>
                <th className="py-2 pr-2">ms</th>
                <th className="py-2 pr-2">OK</th>
                <th className="py-2 pr-2">Cache</th>
                <th className="py-2 pr-2">req</th>
                <th className="py-2 pr-2">meta</th>
              </tr>
            </thead>
            <tbody>
              {recentRows.map((r) => (
                <tr
                  key={String(r.id)}
                  className="border-b border-neutral-800/80 cursor-pointer hover:bg-neutral-800/40"
                  onClick={() => setDetail(r)}
                >
                  <td className="py-1 pr-2 whitespace-nowrap text-neutral-400">
                    {r.created_at ? new Date(String(r.created_at)).toLocaleString() : ""}
                  </td>
                  <td className="py-1 pr-2 font-mono text-[11px]">{String(r.event_name)}</td>
                  <td className="py-1 pr-2 font-mono text-[11px] text-neutral-400">{String(r.route ?? "")}</td>
                  <td className="py-1 pr-2">{r.duration_ms == null ? "—" : String(r.duration_ms)}</td>
                  <td className="py-1 pr-2">{r.success == null ? "—" : String(r.success)}</td>
                  <td className="py-1 pr-2">{r.cache_hit == null ? "—" : String(r.cache_hit)}</td>
                  <td className="py-1 pr-2 font-mono text-[10px] max-w-[7rem] truncate">{String(r.request_id ?? "")}</td>
                  <td className="py-1 pr-2 text-[10px] text-neutral-500 max-w-[12rem] truncate">
                    {JSON.stringify(r.metaPreview ?? {})}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {detail ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="max-w-3xl w-full max-h-[90vh] overflow-auto rounded-xl border border-neutral-600 bg-neutral-950 p-4 text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold">Event detail</h3>
              <button
                type="button"
                className="text-neutral-400 hover:text-white"
                onClick={() => setDetail(null)}
              >
                Close
              </button>
            </div>
            <pre className="text-xs font-mono whitespace-pre-wrap break-words text-neutral-300">
              {JSON.stringify(detail, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function fmtMs(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(n)} ms`;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-900/60 p-3">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-2">
      <h2 className="text-sm font-semibold text-neutral-200">{title}</h2>
      {children}
    </section>
  );
}

function FilterInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-xs">
      <span className="text-neutral-500">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
      />
    </label>
  );
}

function MiniTable({ rows, columns }: { rows: ApiRow[]; columns: string[] }) {
  if (!rows.length) {
    return <p className="text-xs text-neutral-500">No recent rows.</p>;
  }
  return (
    <div className="overflow-x-auto mt-2">
      <table className="min-w-full text-[11px]">
        <thead>
          <tr className="text-left text-neutral-500 border-b border-neutral-800">
            {columns.map((c) => (
              <th key={c} className="py-1 pr-2">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-neutral-900">
              {columns.map((c) => (
                <td key={c} className="py-1 pr-2 font-mono text-neutral-300">
                  {formatCell(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string" && v.includes("T") && v.includes(":")) {
    try {
      return new Date(v).toLocaleString();
    } catch {
      return v;
    }
  }
  return String(v);
}
