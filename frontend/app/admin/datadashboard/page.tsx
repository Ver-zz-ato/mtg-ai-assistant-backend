"use client";

import React from "react";
import Link from "next/link";
import DataDashboardNav from "./DataDashboardNav";

type Overview = {
  ai_suggestion_outcomes_total: number;
  deck_metrics_snapshot_total: number;
  meta_signals_history_total: number;
  commander_aggregates_history_total: number;
  ai_suggestion_outcomes_latest_at: string | null;
  deck_metrics_snapshot_latest_date: string | null;
  meta_signals_history_latest_date: string | null;
  commander_aggregates_history_latest_date: string | null;
};

export default function DataDashboardPage() {
  const [data, setData] = React.useState<Overview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const r = await fetch("/api/admin/datadashboard/overview", { cache: "no-store" });
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.error || "Failed to load");
        setData(j.data);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Data Dashboard</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Read-only view of behavioural and meta history (suggestions, deck metrics, meta signals).
        </p>
        <div className="mt-3 rounded-lg border border-neutral-700 bg-neutral-800/50 p-3">
          <p className="text-xs font-medium text-neutral-300 mb-1">ELI5</p>
          <p className="text-xs text-neutral-400">
            We save “what happened” in four buckets: when someone accepts an AI card suggestion, daily snapshots of deck stats, daily snapshots of meta signals, and daily snapshots of commander popularity. This dashboard lets you look at those numbers—no editing, just “how many” and “latest when”. Use <strong>Test</strong> to push sample rows and confirm Supabase is getting them.
          </p>
        </div>
      </div>
      <DataDashboardNav />

      {loading && <div className="text-sm text-neutral-500">Loading…</div>}
      {error && <div className="text-sm text-red-400">{error}</div>}

      {!loading && data && (
        <>
          <section className="rounded border border-neutral-800 p-4">
            <h2 className="font-medium mb-3">Data health</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-400">ai_suggestion_outcomes</span>
                <span className="font-mono">{data.ai_suggestion_outcomes_total}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">deck_metrics_snapshot</span>
                <span className="font-mono">{data.deck_metrics_snapshot_total}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">meta_signals_history</span>
                <span className="font-mono">{data.meta_signals_history_total}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">commander_aggregates_history</span>
                <span className="font-mono">{data.commander_aggregates_history_total}</span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-neutral-800 text-xs text-neutral-500 space-y-1">
              <div>Latest ai_suggestion_outcomes: {data.ai_suggestion_outcomes_latest_at ?? "—"}</div>
              <div>Latest deck_metrics date: {data.deck_metrics_snapshot_latest_date ?? "—"}</div>
              <div>Latest meta_signals date: {data.meta_signals_history_latest_date ?? "—"}</div>
              <div>Latest commander_aggregates date: {data.commander_aggregates_history_latest_date ?? "—"}</div>
            </div>
          </section>

          <section className="rounded border border-neutral-800 p-4">
            <h2 className="font-medium mb-3">Sections</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link
                href="/admin/datadashboard/suggestions"
                className="block p-3 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700"
              >
                <span className="font-medium">Suggestions</span>
                <p className="text-xs text-neutral-400 mt-1">When users clicked “add” on AI suggestions: which cards, which commanders, how many.</p>
              </Link>
              <Link
                href="/admin/datadashboard/deck-metrics"
                className="block p-3 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700"
              >
                <span className="font-medium">Deck Metrics</span>
                <p className="text-xs text-neutral-400 mt-1">One row per deck per day: lands, ramp, removal, draw, curve. See averages and oddballs.</p>
              </Link>
              <Link
                href="/admin/datadashboard/meta-trends"
                className="block p-3 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700"
              >
                <span className="font-medium">Meta Trends</span>
                <p className="text-xs text-neutral-400 mt-1">Daily copies of meta signals and commander popularity so we can see how the meta changes over time.</p>
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
