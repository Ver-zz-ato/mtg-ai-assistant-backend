"use client";

import React from "react";
import DataDashboardNav from "../DataDashboardNav";

type MetaTrendsDashboard = {
  metaSignalsTotal: number;
  commanderHistoryTotal: number;
  latestMetaSignalsDate: string | null;
  latestCommanderHistoryDate: string | null;
  metaSignalsHistory: Array<{ snapshot_date: string; signal_type: string; data_preview: string }>;
  commanderHistorySummary: Array<{
    commander_slug: string;
    row_count: number;
    latest_deck_count: number | null;
    min_date: string | null;
    max_date: string | null;
  }>;
  commanderTrendDetail: Array<{
    commander_slug: string;
    latest_deck_count: number;
    earliest_deck_count: number;
    delta: number;
  }>;
  countsByDateMeta: Array<{ snapshot_date: string; count: number }>;
  countsByDateCommander: Array<{ snapshot_date: string; count: number }>;
};

export default function MetaTrendsDashboardPage() {
  const [data, setData] = React.useState<MetaTrendsDashboard | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const r = await fetch("/api/admin/datadashboard/meta-trends", { cache: "no-store" });
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
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Meta Trends</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Meta signals and commander aggregates history. Verify cron is populating snapshots.
        </p>
        <div className="mt-2 rounded-lg border border-neutral-700 bg-neutral-800/50 p-2">
          <p className="text-xs font-medium text-neutral-300 mb-0.5">ELI5</p>
          <p className="text-xs text-neutral-400">Cron jobs copy “what’s popular right now” (meta signals and commander deck counts) into history tables every day. Here you check that those copies are actually happening and see how counts change over time.</p>
        </div>
      </div>
      <DataDashboardNav />

      {loading && <div className="text-sm text-neutral-500">Loading…</div>}
      {error && <div className="text-sm text-red-400">{error}</div>}

      {!loading && data && (
        <>
          {data.metaSignalsTotal === 0 && data.commanderHistoryTotal === 0 ? (
            <div className="rounded border border-neutral-800 p-6 text-center text-neutral-400">
              No meta or commander history snapshots have been recorded yet. Check cron execution for meta-signals and commander-aggregates.
            </div>
          ) : (
            <>
              <section className="rounded border border-neutral-800 p-4">
                <h2 className="font-medium mb-3">KPI</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div className="p-2 rounded bg-neutral-800/50">
                    <div className="text-neutral-400">meta_signals_history</div>
                    <div className="font-mono text-lg">{data.metaSignalsTotal}</div>
                  </div>
                  <div className="p-2 rounded bg-neutral-800/50">
                    <div className="text-neutral-400">commander_aggregates_history</div>
                    <div className="font-mono text-lg">{data.commanderHistoryTotal}</div>
                  </div>
                  <div className="p-2 rounded bg-neutral-800/50">
                    <div className="text-neutral-400">Latest meta date</div>
                    <div className="font-mono">{data.latestMetaSignalsDate ?? "—"}</div>
                  </div>
                  <div className="p-2 rounded bg-neutral-800/50">
                    <div className="text-neutral-400">Latest commander date</div>
                    <div className="font-mono">{data.latestCommanderHistoryDate ?? "—"}</div>
                  </div>
                </div>
              </section>

              <section className="rounded border border-neutral-800 p-4">
                <h2 className="font-medium mb-2">Latest snapshot integrity — counts per date</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm text-neutral-400 mb-1">meta_signals_history</h3>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-neutral-400 border-b border-neutral-700">
                          <th className="py-1 pr-2">snapshot_date</th>
                          <th className="py-1">count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.countsByDateMeta.map((row, i) => (
                          <tr key={i} className="border-b border-neutral-800">
                            <td className="py-1 pr-2">{row.snapshot_date}</td>
                            <td className="py-1 font-mono">{row.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <h3 className="text-sm text-neutral-400 mb-1">commander_aggregates_history</h3>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-neutral-400 border-b border-neutral-700">
                          <th className="py-1 pr-2">snapshot_date</th>
                          <th className="py-1">count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.countsByDateCommander.map((row, i) => (
                          <tr key={i} className="border-b border-neutral-800">
                            <td className="py-1 pr-2">{row.snapshot_date}</td>
                            <td className="py-1 font-mono">{row.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className="rounded border border-neutral-800 p-4">
                <h2 className="font-medium mb-2">Meta signal history (recent)</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-neutral-400 border-b border-neutral-700">
                        <th className="py-1 pr-2">snapshot_date</th>
                        <th className="py-1 pr-2">signal_type</th>
                        <th className="py-1">data (preview)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.metaSignalsHistory.map((row, i) => (
                        <tr key={i} className="border-b border-neutral-800">
                          <td className="py-1 pr-2">{row.snapshot_date}</td>
                          <td className="py-1 pr-2">{row.signal_type}</td>
                          <td className="py-1 font-mono text-xs break-all max-w-xs">{row.data_preview}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded border border-neutral-800 p-4">
                <h2 className="font-medium mb-2">Commander history summary (top by row count)</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-neutral-400 border-b border-neutral-700">
                        <th className="py-1 pr-2">commander_slug</th>
                        <th className="py-1 pr-2">row_count</th>
                        <th className="py-1 pr-2">latest_deck_count</th>
                        <th className="py-1 pr-2">min_date</th>
                        <th className="py-1">max_date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.commanderHistorySummary.map((row, i) => (
                        <tr key={i} className="border-b border-neutral-800">
                          <td className="py-1 pr-2">{row.commander_slug}</td>
                          <td className="py-1 pr-2 font-mono">{row.row_count}</td>
                          <td className="py-1 pr-2 font-mono">{row.latest_deck_count ?? "—"}</td>
                          <td className="py-1 pr-2">{row.min_date ?? "—"}</td>
                          <td className="py-1">{row.max_date ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {data.commanderTrendDetail.length > 0 && (
                <section className="rounded border border-neutral-800 p-4">
                  <h2 className="font-medium mb-2">Commander trend detail (deck_count delta)</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-neutral-400 border-b border-neutral-700">
                          <th className="py-1 pr-2">commander_slug</th>
                          <th className="py-1 pr-2">latest</th>
                          <th className="py-1 pr-2">earliest</th>
                          <th className="py-1">delta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.commanderTrendDetail.map((row, i) => (
                          <tr key={i} className="border-b border-neutral-800">
                            <td className="py-1 pr-2">{row.commander_slug}</td>
                            <td className="py-1 pr-2 font-mono">{row.latest_deck_count}</td>
                            <td className="py-1 pr-2 font-mono">{row.earliest_deck_count}</td>
                            <td className="py-1 font-mono">{row.delta}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
