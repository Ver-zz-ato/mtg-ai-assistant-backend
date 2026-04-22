"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type WindowKey = "15m" | "1h" | "6h" | "24h" | "7d";

type ApiRow = Record<string, unknown>;

type SortKey = "newest" | "oldest" | "duration_desc";

export function CostAuditAdminDashboard() {
  const [windowKey, setWindowKey] = useState<WindowKey>("24h");
  const [route, setRoute] = useState("");
  const [eventName, setEventName] = useState("");
  const [source, setSource] = useState("");
  const [requestId, setRequestId] = useState("");
  const [userId, setUserId] = useState("");
  const [component, setComponent] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [correlationId, setCorrelationId] = useState("");
  const [sourceDetail, setSourceDetail] = useState("");
  const [cacheHit, setCacheHit] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ApiRow | null>(null);
  const [detail, setDetail] = useState<ApiRow | null>(null);
  const [relatedRows, setRelatedRows] = useState<ApiRow[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);

  const buildQueryParams = useCallback(() => {
    const sp = new URLSearchParams();
    sp.set("window", windowKey);
    if (route.trim()) sp.set("route", route.trim());
    if (eventName.trim()) sp.set("event_name", eventName.trim());
    if (source.trim()) sp.set("source", source.trim());
    if (requestId.trim()) sp.set("request_id", requestId.trim());
    if (userId.trim()) sp.set("user_id", userId.trim());
    if (component.trim()) sp.set("component", component.trim());
    if (sessionId.trim()) sp.set("session_id", sessionId.trim());
    if (correlationId.trim()) sp.set("correlation_id", correlationId.trim());
    if (sourceDetail.trim()) sp.set("source_detail", sourceDetail.trim());
    if (cacheHit === "true" || cacheHit === "false") sp.set("cache_hit", cacheHit);
    sp.set("sort", sort);
    sp.set("page", String(page));
    sp.set("pageSize", "40");
    return sp;
  }, [
    windowKey,
    route,
    eventName,
    source,
    requestId,
    userId,
    component,
    sessionId,
    correlationId,
    sourceDetail,
    cacheHit,
    sort,
    page,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sp = buildQueryParams();
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
  }, [buildQueryParams]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!detail) {
      setRelatedRows([]);
      return;
    }
    const sid = (detail.session_id as string) || (detail.correlation_id as string);
    if (!sid) return;
    setRelatedLoading(true);
    const sp = new URLSearchParams();
    sp.set("session_id", String(sid));
    sp.set("window", windowKey);
    void fetch(`/api/admin/cost-audit/related?${sp.toString()}`, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && Array.isArray(j.rows)) setRelatedRows(j.rows);
        else setRelatedRows([]);
      })
      .catch(() => setRelatedRows([]))
      .finally(() => setRelatedLoading(false));
  }, [detail, windowKey]);

  const pct = (x: number | null | undefined) =>
    x == null || Number.isNaN(x) ? "—" : `${Math.round(x * 1000) / 10}%`;

  const fmtRatio = (x: number | null | undefined) =>
    x == null || Number.isNaN(x) ? "—" : `${Math.round(x * 100) / 100}`;

  const summary = (payload?.summary as ApiRow) || {};
  const forensics = (payload?.forensics as ApiRow) || {};
  const leaderboard = (payload?.leaderboard as ApiRow[]) || [];
  const shout = (payload?.shout as ApiRow) || {};
  const playstyle = (payload?.playstyle as ApiRow) || {};
  const price = (payload?.price as ApiRow) || {};
  const fuzzy = (payload?.fuzzy as ApiRow) || {};
  const recent = (payload?.recent as ApiRow) || {};
  const recentRows = (recent.rows as ApiRow[]) || [];
  const deep = (playstyle.deepDive as ApiRow) || (forensics.playstyle as ApiRow) || {};
  const suspicious = (forensics.suspicious as { level: string; text: string }[]) || [];
  const bursts = (forensics.bursts as { windowSec: number; top: { key: string; count: number }[] }[]) || [];
  const dataQuality = (forensics.dataQuality as ApiRow) || {};

  const exportHref = `/api/admin/cost-audit/export?${buildQueryParams().toString()}`;

  return (
    <main className="max-w-7xl mx-auto p-4 space-y-6 text-neutral-100">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Cost audit (forensics)</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Migrations: <code className="text-neutral-300">100_observability_cost_events</code>,{" "}
            <code className="text-neutral-300">101_observability_cost_events_trace_columns</code>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={exportHref}
            className="text-sm border border-amber-700/60 bg-amber-950/40 text-amber-200 hover:bg-amber-900/40 rounded-lg px-3 py-1.5"
          >
            Export JSON (filtered)
          </a>
          <Link
            href="/admin/JustForDavy"
            className="text-sm text-blue-400 hover:text-blue-300 border border-neutral-600 rounded-lg px-3 py-1.5"
          >
            ← JustForDavy hub
          </Link>
        </div>
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
          <span className="text-xs text-neutral-500 ml-2">Sort</span>
          <select
            value={sort}
            onChange={(e) => {
              setPage(0);
              setSort(e.target.value as SortKey);
            }}
            className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="duration_desc">Duration ↓</option>
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <FilterInput label="Route" value={route} onChange={setRoute} placeholder="/api/price" />
          <FilterInput label="Event" value={eventName} onChange={setEventName} placeholder="price.request" />
          <FilterInput label="Source" value={source} onChange={setSource} placeholder="server | client" />
          <FilterInput label="Component" value={component} onChange={setComponent} placeholder="PlaystyleQuizResults" />
          <FilterInput label="Session id" value={sessionId} onChange={setSessionId} />
          <FilterInput label="Correlation id" value={correlationId} onChange={setCorrelationId} />
          <FilterInput label="Source detail" value={sourceDetail} onChange={setSourceDetail} placeholder="openai" />
          <FilterInput label="Request id" value={requestId} onChange={setRequestId} />
          <FilterInput label="User id" value={userId} onChange={setUserId} />
          <label className="block text-xs">
            <span className="text-neutral-500">Cache hit</span>
            <select
              value={cacheHit}
              onChange={(e) => setCacheHit(e.target.value)}
              className="mt-0.5 w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
            >
              <option value="">any</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </label>
        </div>
        <div className="flex gap-2 flex-wrap">
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
            Aggregate sample capped at 8k rows; narrow window/filters or use Export for more.
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-2">
        <h2 className="text-sm font-semibold text-neutral-200">Extended summary (sample)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <StatCard label="Total events" value={String(forensics.totalEvents ?? "0")} />
          <StatCard label="Server rows" value={String(forensics.serverEvents ?? "0")} />
          <StatCard label="Client rows" value={String(forensics.clientEvents ?? "0")} />
          <StatCard label="Unique req ids" value={String(forensics.uniqueRequestIds ?? "0")} />
          <StatCard label="Unique sessions" value={String(forensics.uniqueSessionIds ?? "0")} />
          <StatCard label="Unique correlation" value={String(forensics.uniqueCorrelationIds ?? "0")} />
          <StatCard label="Unique users" value={String(forensics.uniqueUserIds ?? "0")} />
          <StatCard label="Collections" value={String(forensics.collections ?? "0")} />
          <StatCard label="Price GET" value={String(forensics.priceGet ?? "0")} />
          <StatCard label="Price POST" value={String(forensics.pricePost ?? "0")} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-neutral-800">
          <StatCard label="PS client effect" value={String((forensics.playstyleClient as ApiRow)?.effect ?? "0")} />
          <StatCard label="PS fetch start" value={String((forensics.playstyleClient as ApiRow)?.start ?? "0")} />
          <StatCard label="PS fetch done" value={String((forensics.playstyleClient as ApiRow)?.done ?? "0")} />
          <StatCard label="PS server explain" value={String(forensics.serverPlaystyleExplain ?? "0")} />
          <StatCard label="Ratio done/start" value={fmtRatio(forensics.ratioDoneStart as number)} />
          <StatCard label="Ratio effect/start" value={fmtRatio(forensics.ratioEffectStart as number)} />
          <StatCard label="Ratio client/server" value={fmtRatio(forensics.ratioClientServer as number)} />
          <StatCard label="Homepage renders" value={String(forensics.homepageRenders ?? "0")} />
        </div>
      </section>

      {suspicious.length ? (
        <section className="rounded-xl border border-red-900/40 bg-red-950/20 p-4 space-y-2">
          <h2 className="text-sm font-semibold text-red-200">Suspicious patterns</h2>
          <ul className="space-y-1 text-sm">
            {suspicious.map((s, i) => (
              <li
                key={i}
                className={
                  s.level === "bad"
                    ? "text-red-300 flex gap-2"
                    : "text-amber-200/90 flex gap-2"
                }
              >
                <span className="font-mono text-[10px] uppercase shrink-0">{s.level}</span>
                <span>{s.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
        <h2 className="text-sm font-semibold text-neutral-200 mb-2">Burst leaders (event_name totals in window)</h2>
        <div className="grid md:grid-cols-3 gap-3 text-xs">
          {bursts.map((b) => (
            <div key={b.windowSec} className="border border-neutral-800 rounded-lg p-2">
              <div className="text-neutral-500 mb-1">{b.windowSec}s buckets (aggregated)</div>
              <ul className="space-y-0.5 font-mono">
                {b.top.map((t) => (
                  <li key={t.key}>
                    {t.key}: <span className="text-neutral-300">{t.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-2">
        <h2 className="text-sm font-semibold text-neutral-200">Data quality</h2>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <dt className="text-neutral-500">Rows</dt>
          <dd>{String(dataQuality.totalRows ?? "—")}</dd>
          <dt className="text-neutral-500">Client missing session/corr</dt>
          <dd>{String(dataQuality.missingSessionId ?? "—")}</dd>
          <dt className="text-neutral-500">Server missing req id (heuristic)</dt>
          <dd>{String(dataQuality.missingRequestId ?? "—")}</dd>
          <dt className="text-neutral-500">Playstyle done missing duration</dt>
          <dd>{String(dataQuality.missingDurationWherePlaystyleClientDone ?? "—")}</dd>
        </dl>
      </section>

      <section className="rounded-xl border border-violet-900/40 bg-violet-950/20 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-violet-200">Playstyle deep-dive</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
          <div>
            Client effect / start / done: {String(deep.effect ?? 0)} / {String(deep.start ?? 0)} /{" "}
            {String(deep.done ?? 0)}
          </div>
          <div>Server explain: {String(deep.serverCount ?? 0)}</div>
          <div>Cache hit (server): {pct(deep.cacheHitRate as number)}</div>
          <div>
            Ratios: done/start {fmtRatio(deep.doneOverStart as number)}, c/s{" "}
            {fmtRatio(deep.clientOverServer as number)}
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-neutral-500 mb-1">Server source breakdown</p>
            <ul className="space-y-0.5">
              {Object.entries((deep.sourceBreakdown as Record<string, number>) || {}).map(([k, v]) => (
                <li key={k}>
                  {k}: {v}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-neutral-500 mb-1">Top repeated cache keys (server)</p>
            <ul className="font-mono space-y-0.5 max-h-40 overflow-y-auto">
              {((deep.topCacheKeys as ApiRow[]) || []).map((r) => (
                <li key={String(r.cache_key)}>
                  {String(r.count)}× {String(r.cache_key).slice(0, 64)}…
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-neutral-500 mb-1">Components (client playstyle)</p>
            <ul>
              {((deep.componentBurst as ApiRow[]) || []).map((r) => (
                <li key={String(r.component)}>
                  {String(r.component)}: {String(r.events)}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-neutral-500 mb-1">Top sessions by volume</p>
            <ul className="font-mono">
              {((forensics.topSessions as ApiRow[]) || []).slice(0, 8).map((r) => (
                <li key={String(r.session_id)} className="truncate">
                  {String(r.session_id).slice(0, 14)}… ({String(r.events)})
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div>
          <p className="text-neutral-500 text-xs mb-1">Flow reconstruction (top sessions by event count)</p>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {((deep.flows as ApiRow[]) || []).map((flow) => (
              <div key={String(flow.session_id)} className="border border-neutral-800 rounded-lg p-2">
                <div className="text-[11px] text-neutral-400 mb-1 font-mono truncate">
                  {String(flow.session_id)} · {String(flow.count)} events
                </div>
                <ol className="list-decimal list-inside text-[11px] space-y-0.5 font-mono">
                  {((flow.events as ApiRow[]) || []).map((ev, idx) => (
                    <li key={idx}>
                      {ev.created_at as string} {ev.event_name as string}{" "}
                      {ev.duration_ms != null ? `${ev.duration_ms}ms` : ""}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
        <MiniTable
          rows={(deep.recentTable as ApiRow[]) || []}
          columns={[
            "created_at",
            "event_name",
            "source",
            "session_id",
            "attempt",
            "duration_ms",
            "cache_hit",
            "status_code",
          ]}
        />
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        <StatCard label="Events (sample)" value={String(summary.totalEvents ?? "0")} />
        <StatCard label="Shout open" value={String(summary.shoutStreamOpens ?? "0")} />
        <StatCard label="Shout close" value={String(summary.shoutStreamCloses ?? "0")} />
        <StatCard label="Shout history (server)" value={String(summary.shoutHistoryServer ?? "0")} />
        <StatCard label="Playstyle (server)" value={String(summary.playstyleExplainCalls ?? "0")} />
        <StatCard label="Playstyle cache hit" value={pct(summary.playstyleCacheHitRate as number)} />
        <StatCard label="Price reqs" value={String(summary.priceRequests ?? "0")} />
        <StatCard label="Fuzzy" value={String(summary.fuzzyRequests ?? "0")} />
        <StatCard label="Comments" value={String(summary.commentRequests ?? "0")} />
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
        <Panel title="Shout (stream + polling)">
          <p className="text-xs text-neutral-500 mb-2">
            Deploy env:{" "}
            <code className="text-neutral-300">
              NEXT_PUBLIC_SHOUT_REALTIME_MODE={String(shout.deployEnvRealtimeMode ?? "∅ (default poll)")}
            </code>
            ,{" "}
            <code className="text-neutral-300">
              NEXT_PUBLIC_SHOUT_POLL_MS={String(shout.deployEnvPollMs ?? "∅ (default 18000)")}
            </code>
            . Latest client mount:{" "}
            <span className="text-amber-200/90">
              {String(shout.latestClientRealtimeMode ?? "—")}
            </span>
            {shout.latestClientPollMs != null ? (
              <span className="text-neutral-400"> @ {String(shout.latestClientPollMs)}ms poll</span>
            ) : null}
            .
          </p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <dt className="text-neutral-500">SSE opens</dt>
            <dd>{String(shout.openCount ?? 0)}</dd>
            <dt className="text-neutral-500">SSE closes</dt>
            <dd>{String(shout.closeCount ?? 0)}</dd>
            <dt className="text-neutral-500">Avg SSE duration</dt>
            <dd>{fmtMs(shout.avgDurationMs as number)}</dd>
            <dt className="text-neutral-500">Median SSE</dt>
            <dd>{fmtMs(shout.medianDurationMs as number)}</dd>
            <dt className="text-neutral-500">&lt;10s SSE closes</dt>
            <dd>{String(shout.shortCloseCount ?? 0)}</dd>
            <dt className="text-neutral-500">shout.history (server)</dt>
            <dd>{String(shout.historyServerCount ?? 0)}</dd>
            <dt className="text-neutral-500">client history_done</dt>
            <dd>{String(shout.clientHistoryDoneCount ?? 0)}</dd>
            <dt className="text-neutral-500">Poll refreshes (client)</dt>
            <dd>{String(shout.clientPollRefreshCount ?? 0)}</dd>
            <dt className="text-neutral-500">Post refreshes (client)</dt>
            <dd>{String(shout.clientPostRefreshCount ?? 0)}</dd>
            <dt className="text-neutral-500">Visibility refreshes</dt>
            <dd>{String(shout.clientVisibilityRefreshCount ?? 0)}</dd>
            <dt className="text-neutral-500">SSE connect (client)</dt>
            <dd>{String(shout.clientSseConnectCount ?? 0)}</dd>
            <dt className="text-neutral-500">Poll visibility events</dt>
            <dd>{String(shout.clientPollVisibilityEvents ?? 0)}</dd>
          </dl>
          <p className="text-[11px] text-neutral-500 mt-2">
            In <span className="text-neutral-300">poll</span> mode, SSE open/close should drop;{" "}
            <span className="text-neutral-300">shout.history</span> and poll-driven client refreshes rise. In{" "}
            <span className="text-neutral-300">sse</span> mode, the opposite.
          </p>
          <MiniTable
            rows={(shout.recent as ApiRow[]) || []}
            columns={["created_at", "event_name", "duration_ms", "request_id"]}
          />
        </Panel>

        <Panel title="Playstyle (server panel)">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm mb-2">
            <dt className="text-neutral-500">Total</dt>
            <dd>{String(playstyle.total ?? 0)}</dd>
            <dt className="text-neutral-500">Cache hit</dt>
            <dd>{pct(playstyle.cacheHitRate as number)}</dd>
          </dl>
          <ul className="text-sm space-y-0.5 mb-2">
            {Object.entries((playstyle.sourceBreakdown as Record<string, number>) || {}).map(([k, v]) => (
              <li key={k}>
                <span className="text-neutral-400">{k}</span>: {v}
              </li>
            ))}
          </ul>
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
          <MiniTable rows={(price.recent as ApiRow[]) || []} columns={["created_at", "method", "cache_hit", "count_1"]} />
        </Panel>

        <Panel title="Fuzzy">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm mb-2">
            <dt className="text-neutral-500">Total</dt>
            <dd>{String(fuzzy.total ?? 0)}</dd>
            <dt className="text-neutral-500">Avg names</dt>
            <dd>{fuzzy.avgNamesCount == null ? "—" : Number(fuzzy.avgNamesCount).toFixed(1)}</dd>
            <dt className="text-neutral-500">External lookups</dt>
            <dd>{String(fuzzy.externalLookupCount ?? 0)}</dd>
            <dt className="text-neutral-500">Scryfall HTTP (sum)</dt>
            <dd>{String(fuzzy.scryfallHttpSum ?? 0)}</dd>
          </dl>
          <MiniTable rows={(fuzzy.recent as ApiRow[]) || []} columns={["created_at", "count_1", "count_2"]} />
        </Panel>
      </div>

      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
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
                <th className="py-2 pr-2">Src</th>
                <th className="py-2 pr-2">Route</th>
                <th className="py-2 pr-2">ms</th>
                <th className="py-2 pr-2">sess</th>
                <th className="py-2 pr-2">comp</th>
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
                  <td className="py-1 pr-2 font-mono text-[10px] max-w-[10rem] truncate">{String(r.event_name)}</td>
                  <td className="py-1 pr-2">{String(r.source ?? "")}</td>
                  <td className="py-1 pr-2 font-mono text-[10px] text-neutral-400 max-w-[6rem] truncate">
                    {String(r.route ?? "")}
                  </td>
                  <td className="py-1 pr-2">{r.duration_ms == null ? "—" : String(r.duration_ms)}</td>
                  <td className="py-1 pr-2 font-mono text-[9px] max-w-[4rem] truncate">
                    {String((r.session_id as string) || (r.correlation_id as string) || "")}
                  </td>
                  <td className="py-1 pr-2 text-[10px] max-w-[5rem] truncate">{String(r.component ?? "")}</td>
                  <td className="py-1 pr-2 text-[10px] text-neutral-500 max-w-[10rem] truncate">
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
            className="max-w-4xl w-full max-h-[90vh] overflow-auto rounded-xl border border-neutral-600 bg-neutral-950 p-4 text-sm"
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
            <pre className="text-xs font-mono whitespace-pre-wrap break-words text-neutral-300 mb-4">
              {JSON.stringify(detail, null, 2)}
            </pre>
            <div className="border-t border-neutral-800 pt-3">
              <h4 className="text-xs font-semibold text-neutral-400 mb-2">
                Related timeline (same session){relatedLoading ? " …" : ""}
              </h4>
              <ol className="text-[11px] font-mono space-y-1 max-h-48 overflow-y-auto">
                {relatedRows.map((ev) => (
                  <li key={String(ev.id)}>
                    {String(ev.created_at)} {String(ev.event_name)} {ev.duration_ms != null ? `${ev.duration_ms}ms` : ""}
                  </li>
                ))}
              </ol>
            </div>
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
