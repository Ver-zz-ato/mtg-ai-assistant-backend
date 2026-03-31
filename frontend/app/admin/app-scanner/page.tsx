"use client";

import React from "react";
import Link from "next/link";
import { ELI5 } from "@/components/AdminHelp";

type OverviewPayload = {
  ok: boolean;
  error?: string;
  hint?: string;
  meta?: { days: number; window: string; source: string };
  overview?: {
    scanner_starts: number;
    scan_add_initiated: number;
    scan_add_completed: number;
    canonical_resolution_rate: number | null;
    fail_open_rate: number | null;
    name_resolution_unaccounted: number;
    ai_assist_usage_rate: number | null;
    ai_assist_blocked: number;
    auto_add_usage_rate: number | null;
    match_pipeline_hint: number | null;
    match_source_unset_count: number;
    add_initiated_rollups: Record<string, number>;
    event_counts: Record<string, number>;
  };
  funnel?: Array<{ id: string; label: string; count: number; pct_of_first: number | null }>;
  quality?: {
    by_name_resolution: Record<string, number>;
    by_match_source: Record<string, number>;
    by_add_confirm_method: Record<string, number>;
  };
  aiAssist?: {
    blocked_total: number;
    blocked_by_reason: Record<string, number>;
    fallback_started: number;
    fallback_success: number;
    fallback_failed: number;
    fallback_failed_agg: { total: number; is_network_true: number; is_network_other: number };
    fallback_failed_top_errors: { error: string; count: number }[];
  };
  autoAdd?: {
    usage_counts: Record<string, number>;
    canonical_by_auto_flag: Array<{
      auto_add_enabled: string;
      count: number;
      canonical: number;
      fail_open: number;
      canonical_rate_pct: number | null;
      fail_open_rate_pct: number | null;
    }>;
  };
  newDeckPath?: {
    note: string;
    by_will_persist: Array<{
      will_persist_to_supabase: string;
      count: number;
      canonical: number;
      fail_open: number;
      canonical_rate_pct: number | null;
      fail_open_rate_pct: number | null;
    }>;
  };
};

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="text-xs text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-mono tabular-nums mt-1">{value}</div>
      {sub ? <div className="text-xs text-neutral-500 mt-1">{sub}</div> : null}
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; count: number }[];
}) {
  if (!rows.length) {
    return (
      <div className="rounded-lg border border-neutral-800 p-3">
        <h3 className="text-sm font-medium text-neutral-200 mb-2">{title}</h3>
        <p className="text-xs text-neutral-500">No rows (no events or property not present).</p>
      </div>
    );
  }
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div className="rounded-lg border border-neutral-800 overflow-hidden">
      <h3 className="text-sm font-medium text-neutral-200 px-3 py-2 border-b border-neutral-800 bg-neutral-900/40">
        {title}
      </h3>
      <table className="w-full text-sm">
        <thead className="text-left text-neutral-500 text-xs uppercase">
          <tr>
            <th className="px-3 py-2 font-medium">Key</th>
            <th className="px-3 py-2 font-medium text-right">Count</th>
            <th className="px-3 py-2 font-medium text-right">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-neutral-800/80 hover:bg-neutral-900/30">
              <td className="px-3 py-2 font-mono text-amber-200/90">{r.key}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.count}</td>
              <td className="px-3 py-2 text-right tabular-nums text-neutral-400">
                {total > 0 ? `${Math.round((r.count / total) * 1000) / 10}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function sortEntries(obj: Record<string, number> | undefined): { key: string; count: number }[] {
  if (!obj) return [];
  return Object.entries(obj)
    .map(([key, count]) => ({ key, count: Number(count) }))
    .sort((a, b) => b.count - a.count);
}

export default function AdminAppScannerPage() {
  const [days, setDays] = React.useState(7);
  const [data, setData] = React.useState<OverviewPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      // Same-origin admin route; fetchJson uses apiUrl() and is for backend-prefixed paths.
      // eslint-disable-next-line no-restricted-globals -- intentional: GET /api/admin/*
      const r = await fetch(`/api/admin/scanner-analytics/overview?days=${days}`, { cache: "no-store" });
      const j = (await r.json()) as OverviewPayload;
      if (!r.ok || !j.ok) {
        setData(null);
        setErr(j.error || (j as { hint?: string }).hint || "Load failed");
        return;
      }
      setData(j);
    } catch (e: unknown) {
      setData(null);
      setErr(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [days]);

  React.useEffect(() => {
    load();
  }, [load]);

  const ov = data?.overview;
  const pct = (n: number | null | undefined) =>
    n == null || Number.isNaN(n) ? "—" : `${n}%`;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Scanner analytics (mobile)</h1>
          <p className="text-sm text-neutral-400 mt-1">
            PostHog events from the app card scanner — admin reporting only.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-neutral-400 flex items-center gap-2">
            Window
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm"
            >
              {[7, 14, 30].map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <Link
            href="/admin/JustForDavy"
            className="text-xs px-3 py-1.5 rounded border border-neutral-700 hover:bg-neutral-900"
          >
            Admin home
          </Link>
        </div>
      </div>

      <ELI5
        heading="What is this?"
        items={[
          "Counts and rates from optional mobile analytics (PostHog). Users who opt out do not appear.",
          "Event names match the ManaTap app scanner instrumentation (scan_card_*, scan_ai_*).",
          "Older app builds may omit newer properties; “(unset)” and caveats below explain gaps.",
          "“Add initiated” is user intent; “Add completed” is a persisted add. New-deck flow can initiate without Supabase persist — see the labeled panel.",
        ]}
      />

      <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 px-4 py-3 text-sm text-neutral-300 space-y-2">
        <p className="font-medium text-amber-200/90">Data caveats</p>
        <ul className="list-disc pl-5 space-y-1 text-neutral-400">
          <li>
            Requires <code className="text-neutral-500">POSTHOG_PERSONAL_API_KEY</code> and{" "}
            <code className="text-neutral-500">POSTHOG_PROJECT_ID</code> on the server (same as the audit script).
          </li>
          <li>
            Properties such as <code className="text-neutral-500">name_resolution</code>,{" "}
            <code className="text-neutral-500">auto_add_enabled</code>, and{" "}
            <code className="text-neutral-500">will_persist_to_supabase</code> only exist on recent builds; missing
            values appear as <code className="text-neutral-500">(unset)</code> in breakdowns.
          </li>
        </ul>
      </div>

      {err && (
        <div className="rounded border border-red-900 bg-red-950/40 text-red-200 text-sm px-3 py-2 whitespace-pre-wrap">
          {err}
        </div>
      )}

      {loading && !ov && !err && <div className="text-sm text-neutral-500">Loading…</div>}

      {ov && (
        <>
          <section>
            <h2 className="text-lg font-medium text-neutral-200 mb-3">
              Overview <span className="text-sm font-normal text-neutral-500">({data?.meta?.window})</span>
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Tile label="Scanner starts" value={ov.event_counts?.scan_card_screen_viewed ?? ov.scanner_starts} />
              <Tile label="Scan add initiated" value={ov.scan_add_initiated} sub="Intent (includes non-persist)" />
              <Tile label="Scan add completed" value={ov.scan_add_completed} sub="Persisted add succeeded" />
              <Tile label="Canonical resolution rate" value={pct(ov.canonical_resolution_rate)} sub="% of add initiated" />
              <Tile label="Fail-open rate" value={pct(ov.fail_open_rate)} sub="% of add initiated" />
              <Tile
                label="AI assist usage rate"
                value={pct(ov.ai_assist_usage_rate)}
                sub="% match_source=ai on add initiated"
              />
              <Tile label="AI assist blocked" value={ov.ai_assist_blocked} sub="scan_ai_assist_blocked" />
              <Tile label="Auto-add usage rate" value={pct(ov.auto_add_usage_rate)} sub="% auto_add_enabled true" />
            </div>
            {ov.name_resolution_unaccounted > 0 && (
              <p className="text-xs text-neutral-500 mt-2">
                Add initiated with neither canonical nor fail_open (legacy/missing name_resolution):{" "}
                <span className="font-mono text-neutral-400">{ov.name_resolution_unaccounted}</span>
              </p>
            )}
            {ov.match_pipeline_hint != null && (
              <p className="text-xs text-neutral-500 mt-1">
                AI fallback starts per match completed:{" "}
                <span className="font-mono text-neutral-400">{ov.match_pipeline_hint}%</span> (diagnostic, not
                mutually exclusive steps).
              </p>
            )}
          </section>

          <section>
            <h2 className="text-lg font-medium text-neutral-200 mb-3">Funnel (event counts)</h2>
            <p className="text-xs text-neutral-500 mb-2">
              Step counts are independent; drop-off is not session-scoped. Partial historical coverage will show lower
              volumes on newer steps.
            </p>
            <div className="rounded-lg border border-neutral-800 divide-y divide-neutral-800">
              {data?.funnel?.map((s) => (
                <div key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
                  <div>
                    <span className="text-sm text-neutral-200">{s.label}</span>
                    <span className="text-xs text-neutral-500 ml-2 font-mono">{s.id}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono tabular-nums">{s.count}</span>
                    {s.pct_of_first != null && (
                      <span className="text-xs text-neutral-500 ml-2">{s.pct_of_first}% of first step</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-neutral-500 mt-2">
              Related:{" "}
              <span className="font-mono text-neutral-400">
                scan_card_match_failed={data?.overview?.event_counts?.scan_card_match_failed ?? 0}
              </span>
              ,{" "}
              <span className="font-mono text-neutral-400">
                scan_card_direct_search_used={data?.overview?.event_counts?.scan_card_direct_search_used ?? 0}
              </span>
            </p>
          </section>

          <section className="grid md:grid-cols-3 gap-4">
            <BreakdownTable title="Add initiated × name_resolution" rows={sortEntries(data?.quality?.by_name_resolution)} />
            <BreakdownTable title="Add initiated × match_source" rows={sortEntries(data?.quality?.by_match_source)} />
            <BreakdownTable
              title="Add initiated × add_confirm_method"
              rows={sortEntries(data?.quality?.by_add_confirm_method)}
            />
          </section>

          <section className="rounded-lg border border-neutral-800 p-4 space-y-4">
            <h2 className="text-lg font-medium text-neutral-200">AI Assist</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Tile label="Blocked (total)" value={data?.aiAssist?.blocked_total ?? 0} />
              <Tile label="Fallback started" value={data?.aiAssist?.fallback_started ?? 0} />
              <Tile label="Fallback success" value={data?.aiAssist?.fallback_success ?? 0} />
              <Tile label="Fallback failed" value={data?.aiAssist?.fallback_failed ?? 0} />
            </div>
            {data?.aiAssist?.blocked_by_reason && Object.keys(data.aiAssist.blocked_by_reason).length > 0 && (
              <BreakdownTable title="Blocked × reason" rows={sortEntries(data.aiAssist.blocked_by_reason)} />
            )}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded border border-neutral-800 p-3 text-sm">
                <div className="text-neutral-400 text-xs uppercase mb-2">Fallback failed — is_network</div>
                <p className="text-neutral-300">
                  Flagged network:{" "}
                  <span className="font-mono text-cyan-300">
                    {data?.aiAssist?.fallback_failed_agg?.is_network_true ?? 0}
                  </span>{" "}
                  / {data?.aiAssist?.fallback_failed_agg?.total ?? 0}
                </p>
              </div>
              <div className="rounded border border-neutral-800 overflow-hidden">
                <h3 className="text-xs font-medium text-neutral-400 uppercase px-3 py-2 border-b border-neutral-800">
                  Top fallback error strings
                </h3>
                <ul className="divide-y divide-neutral-800 text-sm max-h-48 overflow-y-auto">
                  {(data?.aiAssist?.fallback_failed_top_errors || []).map((row) => (
                    <li key={row.error} className="px-3 py-1.5 flex justify-between gap-2">
                      <span className="text-neutral-400 truncate mr-2" title={row.error}>
                        {row.error}
                      </span>
                      <span className="font-mono shrink-0">{row.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-neutral-800 p-4 space-y-4">
            <h2 className="text-lg font-medium text-neutral-200">Auto-add vs canonical safety</h2>
            <p className="text-xs text-neutral-500">
              Compare canonical vs fail-open rates by{" "}
              <code className="text-neutral-600">auto_add_enabled</code> at add time. Use with volume — sparse cells are
              inconclusive.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-neutral-500 text-xs uppercase border-b border-neutral-800">
                  <tr>
                    <th className="py-2 pr-3">auto_add_enabled</th>
                    <th className="py-2 pr-3 text-right">Count</th>
                    <th className="py-2 pr-3 text-right">Canonical %</th>
                    <th className="py-2 pr-3 text-right">Fail-open %</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.autoAdd?.canonical_by_auto_flag || []).map((row) => (
                    <tr key={row.auto_add_enabled} className="border-t border-neutral-800/80">
                      <td className="py-2 pr-3 font-mono text-amber-200/90">{row.auto_add_enabled}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{row.count}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{pct(row.canonical_rate_pct)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{pct(row.fail_open_rate_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-violet-900/40 bg-violet-950/15 p-4 space-y-3">
            <h2 className="text-lg font-medium text-violet-200">New-deck path &amp; Supabase persist</h2>
            <p className="text-sm text-neutral-300">{data?.newDeckPath?.note}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-neutral-500 text-xs uppercase border-b border-neutral-800">
                  <tr>
                    <th className="py-2 pr-3">will_persist_to_supabase</th>
                    <th className="py-2 pr-3 text-right">Count</th>
                    <th className="py-2 pr-3 text-right">Canonical %</th>
                    <th className="py-2 pr-3 text-right">Fail-open %</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.newDeckPath?.by_will_persist || []).map((row) => (
                    <tr key={row.will_persist_to_supabase} className="border-t border-neutral-800/80">
                      <td className="py-2 pr-3 font-mono text-violet-200/90">{row.will_persist_to_supabase}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{row.count}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{pct(row.canonical_rate_pct)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{pct(row.fail_open_rate_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
