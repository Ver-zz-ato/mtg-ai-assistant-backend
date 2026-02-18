"use client";

import React from "react";
import Link from "next/link";
import { ELI5 } from "@/components/AdminHelp";

export default function MulliganAnalyticsPage() {
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [data, setData] = React.useState<{
    total_runs?: number;
    total_cost_usd?: number;
    by_tier?: Record<string, number>;
    by_source?: Record<string, number>;
    unique_users?: number;
    repeat_users?: number;
    top_users?: { user_id: string; runs: number }[];
    daily?: [string, { total: number; guest: number; free: number; pro: number; cost_usd?: number }][];
  } | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/mulligan/analytics", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) throw new Error(j?.error || "Load failed");
      setData(j);
    } catch (e: any) {
      setErr(e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
  }, []);

  const byTier = data?.by_tier || {};
  const bySource = data?.by_source || {};
  const daily = data?.daily || [];

  return (
    <main className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Mulligan Analytics</h1>
          <ELI5
            heading="Usage"
            items={[
              "How often the hand testing / AI advice tool is used.",
              "Breakdown by tier (guest/free/pro) and repeat users.",
              "AI cost from cost_usd (LLM runs only; cached/deterministic runs have no cost).",
              "Data from mulligan_advice_runs (last 7 days). PostHog also receives mulligan_* events.",
            ]}
          />
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/mulligan-ai"
            className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm"
          >
            Mulligan Playground
          </Link>
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded border border-red-800 bg-red-950/30 p-3 text-red-300 text-sm">
          {err}
        </div>
      )}

      <section className="rounded border border-neutral-800 p-4">
        <h2 className="font-medium mb-3">Summary (7 days)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="rounded bg-neutral-900 border border-neutral-800 p-3">
            <div className="text-xs text-neutral-400">Total AI advice runs</div>
            <div className="text-2xl font-mono">{data?.total_runs ?? 0}</div>
          </div>
          <div className="rounded bg-neutral-900 border border-neutral-800 p-3">
            <div className="text-xs text-neutral-400">Unique users</div>
            <div className="text-2xl font-mono">{data?.unique_users ?? 0}</div>
          </div>
          <div className="rounded bg-neutral-900 border border-neutral-800 p-3">
            <div className="text-xs text-neutral-400">Repeat users (&gt;1 run)</div>
            <div className="text-2xl font-mono">{data?.repeat_users ?? 0}</div>
          </div>
          <div className="rounded bg-neutral-900 border border-neutral-800 p-3">
            <div className="text-xs text-neutral-400">Avg runs/user</div>
            <div className="text-2xl font-mono">
              {data?.unique_users && data?.total_runs
                ? (data.total_runs / data.unique_users).toFixed(1)
                : "—"}
            </div>
          </div>
          <div className="rounded bg-neutral-900 border border-neutral-800 p-3">
            <div className="text-xs text-neutral-400">AI cost (7d)</div>
            <div className="text-2xl font-mono text-cyan-400">
              ${(data?.total_cost_usd ?? 0).toFixed(4)}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded border border-neutral-800 p-4">
        <h2 className="font-medium mb-3">By tier</h2>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded bg-neutral-900 border border-neutral-800 p-3">
            <div className="text-xs text-neutral-400">Guest</div>
            <div className="text-xl font-mono text-amber-400">{byTier.guest ?? 0}</div>
          </div>
          <div className="rounded bg-neutral-900 border border-neutral-800 p-3">
            <div className="text-xs text-neutral-400">Free</div>
            <div className="text-xl font-mono text-emerald-400">{byTier.free ?? 0}</div>
          </div>
          <div className="rounded bg-neutral-900 border border-neutral-800 p-3">
            <div className="text-xs text-neutral-400">Pro</div>
            <div className="text-xl font-mono text-purple-400">{byTier.pro ?? 0}</div>
          </div>
        </div>
      </section>

      <section className="rounded border border-neutral-800 p-4">
        <h2 className="font-medium mb-3">By source</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(bySource).map(([src, count]) => (
            <div
              key={src}
              className="rounded bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
            >
              <span className="text-neutral-400">{src}:</span>{" "}
              <span className="font-mono">{count}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded border border-neutral-800 p-4">
        <h2 className="font-medium mb-3">Daily breakdown</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800">
                <th className="text-left py-2 px-2">Date</th>
                <th className="text-right py-2 px-2">Total</th>
                <th className="text-right py-2 px-2">Guest</th>
                <th className="text-right py-2 px-2">Free</th>
                <th className="text-right py-2 px-2">Pro</th>
                <th className="text-right py-2 px-2">Cost</th>
              </tr>
            </thead>
            <tbody>
              {daily.map(([date, row]) => (
                <tr key={date} className="border-b border-neutral-900">
                  <td className="py-2 px-2">{date}</td>
                  <td className="py-2 px-2 text-right font-mono">{row.total}</td>
                  <td className="py-2 px-2 text-right font-mono text-amber-400">{row.guest}</td>
                  <td className="py-2 px-2 text-right font-mono text-emerald-400">{row.free}</td>
                  <td className="py-2 px-2 text-right font-mono text-purple-400">{row.pro}</td>
                  <td className="py-2 px-2 text-right font-mono text-cyan-400">
                    ${(row.cost_usd ?? 0).toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded border border-neutral-800 p-4">
        <h2 className="font-medium mb-3">Top users by runs</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800">
                <th className="text-left py-2 px-2">User ID</th>
                <th className="text-right py-2 px-2">Runs</th>
              </tr>
            </thead>
            <tbody>
              {(data?.top_users || []).map((u) => (
                <tr key={u.user_id} className="border-b border-neutral-900">
                  <td className="py-2 px-2 font-mono text-xs truncate max-w-[200px]">
                    {u.user_id === "anon" ? "anon" : u.user_id}
                  </td>
                  <td className="py-2 px-2 text-right font-mono">{u.runs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-neutral-500">
        PostHog events: mulligan_hand_drawn, mulligan_advice_requested, mulligan_advice_received,
        mulligan_decision (client + server). Filter by placement, tier for funnels.
      </p>
    </main>
  );
}
