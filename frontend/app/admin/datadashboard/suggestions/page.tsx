"use client";

import React from "react";
import DataDashboardNav from "../DataDashboardNav";

type SuggestionsDashboard = {
  totalAccepted: number;
  totalRejected: number;
  totalIgnored: number;
  acceptedToday: number;
  acceptedLast7: number;
  uniqueSuggestionIds: number;
  uniqueSuggestedCards: number;
  uniqueDecksWithAccepted: number;
  outcomeSummary: Array<{ outcome_type: string; count: number }>;
  topAcceptedCards: { card: string; count: number }[];
  topRejectedCards: { card: string; count: number }[];
  topIgnoredCards: { card: string; count: number }[];
  acceptanceQuality: Array<{
    card: string;
    accepted_count: number;
    rejected_count: number;
    ignored_count: number;
    total_outcomes: number;
    acceptance_rate: number;
  }>;
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
    accepted: boolean | null;
    rejected: boolean | null;
    ignored: boolean | null;
    outcome_source: string | null;
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

  const hasAny = data && (data.totalAccepted + data.totalRejected + data.totalIgnored > 0);

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Suggestions</h1>
        <p className="text-sm text-neutral-400 mt-1">AI suggestion outcomes (accepted, rejected, ignored) from ai_suggestion_outcomes.</p>
        <div className="mt-2 rounded-lg border border-neutral-700 bg-neutral-800/50 p-2">
          <p className="text-xs font-medium text-neutral-300 mb-0.5">ELI5</p>
          <p className="text-xs text-neutral-400">Every time someone clicks “add” we log accepted; when they click “Dismiss” we log rejected; when they run a new analysis without acting we log ignored. You see totals, acceptance rate per card, and which commanders/decks are involved.</p>
        </div>
      </div>
      <DataDashboardNav />

      {loading && <div className="text-sm text-neutral-500">Loading…</div>}
      {error && <div className="text-sm text-red-400">{error}</div>}

      {!loading && data && (
        <>
          {!hasAny ? (
            <div className="rounded border border-neutral-800 p-6 text-center text-neutral-400">
              No suggestion outcomes have been captured yet.
            </div>
          ) : (
            <>
              <section className="rounded border border-neutral-800 p-4">
                <h2 className="font-medium mb-3">KPI</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-sm">
                  <div className="p-2 rounded bg-neutral-800/50">
                    <div className="text-neutral-400">Total accepted</div>
                    <div className="font-mono text-lg">{data.totalAccepted}</div>
                  </div>
                  <div className="p-2 rounded bg-neutral-800/50">
                    <div className="text-neutral-400">Total rejected</div>
                    <div className="font-mono text-lg">{data.totalRejected}</div>
                  </div>
                  <div className="p-2 rounded bg-neutral-800/50">
                    <div className="text-neutral-400">Total ignored</div>
                    <div className="font-mono text-lg">{data.totalIgnored}</div>
                  </div>
                  <div className="p-2 rounded bg-neutral-800/50">
                    <div className="text-neutral-400">Accepted today</div>
                    <div className="font-mono text-lg">{data.acceptedToday}</div>
                  </div>
                  <div className="p-2 rounded bg-neutral-800/50">
                    <div className="text-neutral-400">Accepted last 7d</div>
                    <div className="font-mono text-lg">{data.acceptedLast7}</div>
                  </div>
                  <div className="p-2 rounded bg-neutral-800/50">
                    <div className="text-neutral-400">Unique suggestion_ids</div>
                    <div className="font-mono text-lg">{data.uniqueSuggestionIds}</div>
                  </div>
                  <div className="p-2 rounded bg-neutral-800/50">
                    <div className="text-neutral-400">Unique cards (accepted)</div>
                    <div className="font-mono text-lg">{data.uniqueSuggestedCards}</div>
                  </div>
                </div>
              </section>

              {data.outcomeSummary.length > 0 && (
                <section className="rounded border border-neutral-800 p-4">
                  <h2 className="font-medium mb-2">Outcome summary</h2>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-neutral-400 border-b border-neutral-700">
                        <th className="py-1 pr-2">Outcome type</th>
                        <th className="py-1">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.outcomeSummary.map((row, i) => (
                        <tr key={i} className="border-b border-neutral-800">
                          <td className="py-1 pr-2">{row.outcome_type}</td>
                          <td className="py-1 font-mono">{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              <section className="rounded border border-neutral-800 p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <h2 className="font-medium mb-2">Top accepted cards (25)</h2>
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
                </div>
                <div>
                  <h2 className="font-medium mb-2">Top rejected cards (25)</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-neutral-400 border-b border-neutral-700">
                          <th className="py-1 pr-2">Card</th>
                          <th className="py-1">Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.topRejectedCards.map((row, i) => (
                          <tr key={i} className="border-b border-neutral-800">
                            <td className="py-1 pr-2">{row.card}</td>
                            <td className="py-1 font-mono">{row.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <h2 className="font-medium mb-2">Top ignored cards (25)</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-neutral-400 border-b border-neutral-700">
                          <th className="py-1 pr-2">Card</th>
                          <th className="py-1">Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.topIgnoredCards.map((row, i) => (
                          <tr key={i} className="border-b border-neutral-800">
                            <td className="py-1 pr-2">{row.card}</td>
                            <td className="py-1 font-mono">{row.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              {data.acceptanceQuality.length > 0 && (
                <section className="rounded border border-neutral-800 p-4">
                  <h2 className="font-medium mb-2">Acceptance quality (min 3 outcomes per card)</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-neutral-400 border-b border-neutral-700">
                          <th className="py-1 pr-2">Card</th>
                          <th className="py-1 pr-2">Accepted</th>
                          <th className="py-1 pr-2">Rejected</th>
                          <th className="py-1 pr-2">Ignored</th>
                          <th className="py-1 pr-2">Total</th>
                          <th className="py-1">Acceptance rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.acceptanceQuality.map((row, i) => (
                          <tr key={i} className="border-b border-neutral-800">
                            <td className="py-1 pr-2">{row.card}</td>
                            <td className="py-1 pr-2 font-mono">{row.accepted_count}</td>
                            <td className="py-1 pr-2 font-mono">{row.rejected_count}</td>
                            <td className="py-1 pr-2 font-mono">{row.ignored_count}</td>
                            <td className="py-1 pr-2 font-mono">{row.total_outcomes}</td>
                            <td className="py-1 font-mono">{(row.acceptance_rate * 100).toFixed(0)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

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
                <h2 className="font-medium mb-2">Recent outcomes</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-neutral-400 border-b border-neutral-700">
                        <th className="py-1 pr-2">created_at</th>
                        <th className="py-1 pr-2">card</th>
                        <th className="py-1 pr-2">category</th>
                        <th className="py-1 pr-2">A/R/I</th>
                        <th className="py-1 pr-2">outcome_source</th>
                        <th className="py-1">suggestion_id</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((row, i) => (
                        <tr key={i} className="border-b border-neutral-800">
                          <td className="py-1 pr-2 text-xs">{row.created_at}</td>
                          <td className="py-1 pr-2">{row.suggested_card ?? "—"}</td>
                          <td className="py-1 pr-2">{row.category ?? "—"}</td>
                          <td className="py-1 pr-2">
                            {row.accepted ? "A" : row.rejected ? "R" : row.ignored ? "I" : "—"}
                          </td>
                          <td className="py-1 pr-2 text-xs">{row.outcome_source ?? "—"}</td>
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
