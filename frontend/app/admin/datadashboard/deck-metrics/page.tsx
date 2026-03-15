"use client";

import React from "react";
import DataDashboardNav from "../DataDashboardNav";

type DeckMetricsDashboard = {
  totalRows: number;
  uniqueDecks: number;
  snapshotsToday: number;
  latestSnapshotDate: string | null;
  avgLandCount: number | null;
  avgRampCount: number | null;
  avgRemovalCount: number | null;
  avgDrawCount: number | null;
  byCommander: Array<{
    commander: string;
    snapshot_count: number;
    avg_land: number;
    avg_ramp: number;
    avg_removal: number;
    avg_draw: number;
  }>;
  archetypeTagCounts: { tag: string; count: number }[];
  curveBucketAvgs: Array<{ bucket: number; avg_count: number }>;
  recent: Array<{
    snapshot_date: string;
    commander: string | null;
    format: string | null;
    land_count: number | null;
    ramp_count: number | null;
    removal_count: number | null;
    draw_count: number | null;
    deck_id: string;
  }>;
  lowestLandCounts: Array<{ deck_id: string; commander: string | null; land_count: number | null }>;
  highestLandCounts: Array<{ deck_id: string; commander: string | null; land_count: number | null }>;
  highestRampCounts: Array<{ deck_id: string; commander: string | null; ramp_count: number | null }>;
};

export default function DeckMetricsDashboardPage() {
  const [data, setData] = React.useState<DeckMetricsDashboard | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const r = await fetch("/api/admin/datadashboard/deck-metrics", { cache: "no-store" });
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

  const fmt = (n: number | null) => (n != null ? n.toFixed(1) : "—");

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Deck Metrics</h1>
        <p className="text-sm text-neutral-400 mt-1">Historical deck-level metrics from deck_metrics_snapshot.</p>
        <div className="mt-2 rounded-lg border border-neutral-700 bg-neutral-800/50 p-2">
          <p className="text-xs font-medium text-neutral-300 mb-0.5">ELI5</p>
          <p className="text-xs text-neutral-400">We take a “photo” of each deck’s stats (lands, ramp, removal, draw, curve) once per day when it’s analysed or saved. This page shows those photos: averages, breakdown by commander, and weird ones (super high/low lands or ramp).</p>
        </div>
      </div>
      <DataDashboardNav />

      {loading && <div className="text-sm text-neutral-500">Loading…</div>}
      {error && <div className="text-sm text-red-400">{error}</div>}

      {!loading && data && (
        <>
          {data.totalRows === 0 ? (
            <div className="rounded border border-neutral-800 p-6 text-center text-neutral-400">
              No deck metrics snapshots have been recorded yet.
            </div>
          ) : (
            <>
              <section className="rounded border border-neutral-800 p-4">
                <h2 className="font-medium mb-3">KPI</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div className="p-2 rounded bg-neutral-800/50">
                    <div className="text-neutral-400">Total rows</div>
                    <div className="font-mono text-lg">{data.totalRows}</div>
                  </div>
                  <div className="p-2 rounded bg-neutral-800/50">
                    <div className="text-neutral-400">Unique decks</div>
                    <div className="font-mono text-lg">{data.uniqueDecks}</div>
                  </div>
                  <div className="p-2 rounded bg-neutral-800/50">
                    <div className="text-neutral-400">Snapshots today</div>
                    <div className="font-mono text-lg">{data.snapshotsToday}</div>
                  </div>
                  <div className="p-2 rounded bg-neutral-800/50">
                    <div className="text-neutral-400">Latest date</div>
                    <div className="font-mono">{data.latestSnapshotDate ?? "—"}</div>
                  </div>
                </div>
              </section>

              <section className="rounded border border-neutral-800 p-4">
                <h2 className="font-medium mb-2">Aggregate averages</h2>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span>Land: <span className="font-mono">{fmt(data.avgLandCount)}</span></span>
                  <span>Ramp: <span className="font-mono">{fmt(data.avgRampCount)}</span></span>
                  <span>Removal: <span className="font-mono">{fmt(data.avgRemovalCount)}</span></span>
                  <span>Draw: <span className="font-mono">{fmt(data.avgDrawCount)}</span></span>
                </div>
              </section>

              <section className="rounded border border-neutral-800 p-4">
                <h2 className="font-medium mb-2">Commander breakdown (top 25)</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-neutral-400 border-b border-neutral-700">
                        <th className="py-1 pr-2">Commander</th>
                        <th className="py-1 pr-2">#</th>
                        <th className="py-1 pr-2">avg land</th>
                        <th className="py-1 pr-2">avg ramp</th>
                        <th className="py-1 pr-2">avg removal</th>
                        <th className="py-1">avg draw</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byCommander.map((row, i) => (
                        <tr key={i} className="border-b border-neutral-800">
                          <td className="py-1 pr-2">{row.commander}</td>
                          <td className="py-1 pr-2 font-mono">{row.snapshot_count}</td>
                          <td className="py-1 pr-2 font-mono">{row.avg_land.toFixed(1)}</td>
                          <td className="py-1 pr-2 font-mono">{row.avg_ramp.toFixed(1)}</td>
                          <td className="py-1 pr-2 font-mono">{row.avg_removal.toFixed(1)}</td>
                          <td className="py-1 font-mono">{row.avg_draw.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {data.archetypeTagCounts.length > 0 && (
                <section className="rounded border border-neutral-800 p-4">
                  <h2 className="font-medium mb-2">Archetype tag distribution (top)</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-neutral-400 border-b border-neutral-700">
                          <th className="py-1 pr-2">Tag</th>
                          <th className="py-1">Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.archetypeTagCounts.map((row, i) => (
                          <tr key={i} className="border-b border-neutral-800">
                            <td className="py-1 pr-2">{row.tag}</td>
                            <td className="py-1 font-mono">{row.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {data.curveBucketAvgs.length > 0 && (
                <section className="rounded border border-neutral-800 p-4">
                  <h2 className="font-medium mb-2">Curve histogram averages</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-neutral-400 border-b border-neutral-700">
                          <th className="py-1 pr-2">Bucket</th>
                          <th className="py-1">Avg count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.curveBucketAvgs.map((row, i) => (
                          <tr key={i} className="border-b border-neutral-800">
                            <td className="py-1 pr-2 font-mono">{row.bucket}</td>
                            <td className="py-1 font-mono">{row.avg_count.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              <section className="rounded border border-neutral-800 p-4">
                <h2 className="font-medium mb-2">Recent snapshots</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-neutral-400 border-b border-neutral-700">
                        <th className="py-1 pr-2">snapshot_date</th>
                        <th className="py-1 pr-2">commander</th>
                        <th className="py-1 pr-2">format</th>
                        <th className="py-1 pr-2">land</th>
                        <th className="py-1 pr-2">ramp</th>
                        <th className="py-1 pr-2">removal</th>
                        <th className="py-1 pr-2">draw</th>
                        <th className="py-1">deck_id</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((row, i) => (
                        <tr key={i} className="border-b border-neutral-800">
                          <td className="py-1 pr-2">{row.snapshot_date}</td>
                          <td className="py-1 pr-2">{row.commander ?? "—"}</td>
                          <td className="py-1 pr-2">{row.format ?? "—"}</td>
                          <td className="py-1 pr-2 font-mono">{row.land_count ?? "—"}</td>
                          <td className="py-1 pr-2 font-mono">{row.ramp_count ?? "—"}</td>
                          <td className="py-1 pr-2 font-mono">{row.removal_count ?? "—"}</td>
                          <td className="py-1 pr-2 font-mono">{row.draw_count ?? "—"}</td>
                          <td className="py-1 font-mono text-xs">{row.deck_id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded border border-neutral-800 p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <h3 className="font-medium mb-2 text-sm">Lowest land count (10)</h3>
                  <table className="w-full text-sm">
                    <tbody>
                      {data.lowestLandCounts.map((row, i) => (
                        <tr key={i} className="border-b border-neutral-800">
                          <td className="py-0.5 font-mono">{row.land_count ?? "—"}</td>
                          <td className="py-0.5 text-xs">{row.commander ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h3 className="font-medium mb-2 text-sm">Highest land count (10)</h3>
                  <table className="w-full text-sm">
                    <tbody>
                      {data.highestLandCounts.map((row, i) => (
                        <tr key={i} className="border-b border-neutral-800">
                          <td className="py-0.5 font-mono">{row.land_count ?? "—"}</td>
                          <td className="py-0.5 text-xs">{row.commander ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h3 className="font-medium mb-2 text-sm">Highest ramp count (10)</h3>
                  <table className="w-full text-sm">
                    <tbody>
                      {data.highestRampCounts.map((row, i) => (
                        <tr key={i} className="border-b border-neutral-800">
                          <td className="py-0.5 font-mono">{row.ramp_count ?? "—"}</td>
                          <td className="py-0.5 text-xs">{row.commander ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
