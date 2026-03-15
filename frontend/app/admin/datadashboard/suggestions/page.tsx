"use client";

import React from "react";
import DataDashboardNav from "../DataDashboardNav";

type SuggestionsDashboard = {
  totalAccepted: number;
  acceptedToday: number;
  acceptedLast7: number;
  uniqueSuggestedCards: number;
  uniqueDecksWithAccepted: number;
  topAcceptedCards: { card: string; count: number }[];
  byCategory: { category: string; count: number }[];
  byCommander: { commander: string; count: number }[];
  recent: Array<{
    created_at: string;
    suggested_card: string | null;
    category: string | null;
    commander: string | null;
    format: string | null;
    deck_id: string | null;
    suggestion_id: string;
  }>;
};

export default function SuggestionsDashboardPage() {
  const [data, setData] = React.useState<SuggestionsDashboard | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const r = await fetch("/api/admin/datadashboard/suggestions", { cache: "no-store" });
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
        <h1 className="text-xl font-semibold">Suggestions</h1>
        <p className="text-sm text-neutral-400 mt-1">AI suggestion outcomes (accepted) from ai_suggestion_outcomes.</p>
      </div>
      <DataDashboardNav />

      {loading && <div className="text-sm text-neutral-500">Loading…</div>}
      {error && <div className="text-sm text-red-400">{error}</div>}

      {!loading && data && (
        <>
          {data.totalAccepted === 0 ? (
            <div className="rounded border border-neutral-800 p-6 text-center text-neutral-400">
              No accepted suggestion outcomes have been captured yet.
            </div>
          ) : (
            <>
              <section className="rounded border border-neutral-800 p-4">
                <h2 className="font-medium mb-3">KPI</h2>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
                  <div className="p-2 rounded bg-neutral-800/50">
                    <div className="text-neutral-400">Total accepted</div>
                    <div className="font-mono text-lg">{data.totalAccepted}</div>
                  </div>
                  <div className="p-2 rounded bg-neutral-800/50">
                    <div className="text-neutral-400">Today</div>
                    <div className="font-mono text-lg">{data.acceptedToday}</div>
                  </div>
                  <div className="p-2 rounded bg-neutral-800/50">
                    <div className="text-neutral-400">Last 7 days</div>
                    <div className="font-mono text-lg">{data.acceptedLast7}</div>
                  </div>
                  <div className="p-2 rounded bg-neutral-800/50">
                    <div className="text-neutral-400">Unique cards</div>
                    <div className="font-mono text-lg">{data.uniqueSuggestedCards}</div>
                  </div>
                  <div className="p-2 rounded bg-neutral-800/50">
                    <div className="text-neutral-400">Unique decks</div>
                    <div className="font-mono text-lg">{data.uniqueDecksWithAccepted}</div>
                  </div>
                </div>
              </section>

              <section className="rounded border border-neutral-800 p-4">
                <h2 className="font-medium mb-2">Top accepted cards (top 25)</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-neutral-400 border-b border-neutral-700">
                        <th className="py-1 pr-2">Card</th>
                        <th className="py-1">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topAcceptedCards.map((row, i) => (
                        <tr key={i} className="border-b border-neutral-800">
                          <td className="py-1 pr-2">{row.card}</td>
                          <td className="py-1 font-mono">{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded border border-neutral-800 p-4">
                <h2 className="font-medium mb-2">By category</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-neutral-400 border-b border-neutral-700">
                        <th className="py-1 pr-2">Category</th>
                        <th className="py-1">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byCategory.map((row, i) => (
                        <tr key={i} className="border-b border-neutral-800">
                          <td className="py-1 pr-2">{row.category}</td>
                          <td className="py-1 font-mono">{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded border border-neutral-800 p-4">
                <h2 className="font-medium mb-2">By commander (top 25)</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-neutral-400 border-b border-neutral-700">
                        <th className="py-1 pr-2">Commander</th>
                        <th className="py-1">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byCommander.map((row, i) => (
                        <tr key={i} className="border-b border-neutral-800">
                          <td className="py-1 pr-2">{row.commander}</td>
                          <td className="py-1 font-mono">{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded border border-neutral-800 p-4">
                <h2 className="font-medium mb-2">Recent accepted</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-neutral-400 border-b border-neutral-700">
                        <th className="py-1 pr-2">created_at</th>
                        <th className="py-1 pr-2">suggested_card</th>
                        <th className="py-1 pr-2">category</th>
                        <th className="py-1 pr-2">commander</th>
                        <th className="py-1 pr-2">format</th>
                        <th className="py-1 pr-2">deck_id</th>
                        <th className="py-1">suggestion_id</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((row, i) => (
                        <tr key={i} className="border-b border-neutral-800">
                          <td className="py-1 pr-2 text-xs">{row.created_at}</td>
                          <td className="py-1 pr-2">{row.suggested_card ?? "—"}</td>
                          <td className="py-1 pr-2">{row.category ?? "—"}</td>
                          <td className="py-1 pr-2">{row.commander ?? "—"}</td>
                          <td className="py-1 pr-2">{row.format ?? "—"}</td>
                          <td className="py-1 pr-2 font-mono text-xs">{row.deck_id ?? "—"}</td>
                          <td className="py-1 font-mono text-xs">{row.suggestion_id}</td>
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
