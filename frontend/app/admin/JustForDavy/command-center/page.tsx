'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type Pinboard = {
  errors: { count_24h: number; recent: { kind: string }[] };
  ai_spending: {
    today_usd: number;
    week_usd: number;
    daily_usage_pct: number;
    weekly_usage_pct: number;
    over_daily_limit: boolean;
    over_weekly_limit: boolean;
  };
  price_snapshots: { health: string; latest_date: string; age_hours: number };
  performance: { slow_jobs_24h: number };
  rate_limits: { violations_24h: number };
};

type Health = {
  openai_key_configured: boolean;
  probe?: { ok: boolean; latency_ms?: number; error?: string };
  diagnosis?: string[];
};

type AiUsageSummary = {
  ok: boolean;
  recent_days_cost?: { today_usd?: number; last_3_days?: number };
  totals?: { cost_usd?: number; messages?: number };
};

type ProGate = {
  funnel?: {
    viewers: number;
    clickers: number;
    starters: number;
    converters: number;
    clickRate: string;
    conversionRate: string;
  };
};

type Mulligan = {
  total_runs?: number;
  unique_users?: number;
  total_cost_usd?: number;
};

type ProGateRange = '24h' | '7d' | '30d';
type MulliganDays = 1 | 7 | 30;

const CRON_KEYS = ['deck-costs', 'commander-aggregates', 'meta-signals', 'top-cards'] as const;

export default function CommandCenterPage() {
  const [loading, setLoading] = useState(true);
  const [pinboard, setPinboard] = useState<Pinboard | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [aiUsage, setAiUsage] = useState<AiUsageSummary | null>(null);
  const [proGate, setProGate] = useState<ProGate | null>(null);
  const [proGateRange, setProGateRange] = useState<ProGateRange>('7d');
  const [mulligan, setMulligan] = useState<Mulligan | null>(null);
  const [mulliganDays, setMulliganDays] = useState<MulliganDays>(7);
  const [cronLastRun, setCronLastRun] = useState<Record<string, string>>({});
  const [cronRunBusy, setCronRunBusy] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        pinRes,
        healthRes,
        usageRes,
        proRes,
        mullRes,
        configRes,
      ] = await Promise.all([
        fetch('/api/admin/audit-pinboard', { cache: 'no-store' }),
        fetch('/api/admin/ai/health', { cache: 'no-store' }),
        fetch('/api/admin/ai-usage/summary?days=7&limit=5000', { cache: 'no-store' }),
        fetch(`/api/admin/pro-gate-analytics?range=${proGateRange}`, { cache: 'no-store' }),
        fetch(`/api/admin/mulligan/analytics?days=${mulliganDays}`, { cache: 'no-store' }),
        fetch('/api/admin/config?key=job:last:deck-costs&key=job:last:commander-aggregates&key=job:last:meta-signals&key=job:last:top-cards', { cache: 'no-store' }),
      ]);

      const pinJ = await pinRes.json().catch(() => ({}));
      const healthJ = await healthRes.json().catch(() => ({}));
      const usageJ = await usageRes.json().catch(() => ({}));
      const proJ = await proRes.json().catch(() => ({}));
      const mullJ = await mullRes.json().catch(() => ({}));
      const configJ = await configRes.json().catch(() => ({}));

      if (pinJ?.ok && pinJ?.pinboard) setPinboard(pinJ.pinboard);
      else setPinboard(null);

      if (!healthRes.ok) setHealth(null);
      else setHealth({
        openai_key_configured: healthJ.openai_key_configured ?? false,
        probe: healthJ.probe,
        diagnosis: healthJ.diagnosis,
      });

      if (usageJ?.ok) setAiUsage(usageJ);
      else setAiUsage(null);

      if (proJ?.ok && proJ?.funnel) setProGate(proJ);
      else setProGate(null);

      if (mullJ?.ok !== false) setMulligan(mullJ);
      else setMulligan(null);

      if (configJ?.config) setCronLastRun(configJ.config);
      else setCronLastRun({});

      setLastRefresh(new Date().toLocaleTimeString());
    } catch (e) {
      console.warn('Command center load error:', e);
    } finally {
      setLoading(false);
    }
  }, [proGateRange, mulliganDays]);

  useEffect(() => {
    load();
  }, [load]);

  async function runCron(name: (typeof CRON_KEYS)[number]) {
    setCronRunBusy(name);
    try {
      const r = await fetch('/api/admin/cron/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cron: name }),
      });
      const j = await r.json();
      if (j?.ok) {
        load();
        alert(`✅ ${name} completed. ${j.updated != null ? `Updated: ${j.updated}` : ''}`);
      } else {
        alert(`❌ ${name} failed: ${j?.error || r.statusText}`);
      }
    } catch (e: unknown) {
      alert(`❌ ${name} failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setCronRunBusy(null);
    }
  }

  if (loading && !pinboard && !health) {
    return (
      <main className="max-w-6xl mx-auto p-4">
        <div className="text-neutral-400">Loading command center…</div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/admin/JustForDavy" className="text-sm text-neutral-400 hover:text-white">
            ← Admin Dashboard
          </Link>
          <h1 className="text-xl font-semibold mt-1">Daily Command Center</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Ops, AI, Pro gate, and mulligan at a glance. Last refresh: {lastRefresh || '—'}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 rounded bg-neutral-700 hover:bg-neutral-600 text-sm disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Ops Pinboard */}
      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Ops Health</h2>
          <Link href="/admin/ops" className="text-xs text-blue-400 hover:text-blue-300">
            Full Ops →
          </Link>
        </div>
        {pinboard ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div
              className={`p-3 rounded-lg border ${
                pinboard.errors.count_24h === 0
                  ? 'bg-green-900/20 border-green-700/50'
                  : pinboard.errors.count_24h < 5
                  ? 'bg-yellow-900/20 border-yellow-700/50'
                  : 'bg-red-900/20 border-red-700/50'
              }`}
            >
              <div className="text-xs text-neutral-400">Errors (24h)</div>
              <div className="text-lg font-mono">{pinboard.errors.count_24h}</div>
            </div>
            <div
              className={`p-3 rounded-lg border ${
                pinboard.ai_spending.over_daily_limit || pinboard.ai_spending.over_weekly_limit
                  ? 'bg-red-900/20 border-red-700/50'
                  : pinboard.ai_spending.daily_usage_pct > 80
                  ? 'bg-yellow-900/20 border-yellow-700/50'
                  : 'bg-green-900/20 border-green-700/50'
              }`}
            >
              <div className="text-xs text-neutral-400">AI Spend (matches AI Usage)</div>
              <div className="text-sm">
                Today ${Number(pinboard.ai_spending.today_usd).toFixed(2)} ({pinboard.ai_spending.daily_usage_pct}%)
              </div>
              <div className="text-xs opacity-80">
                Week ${Number(pinboard.ai_spending.week_usd).toFixed(2)} ({pinboard.ai_spending.weekly_usage_pct}%)
              </div>
            </div>
            <div
              className={`p-3 rounded-lg border ${
                pinboard.price_snapshots.health === 'healthy'
                  ? 'bg-green-900/20 border-green-700/50'
                  : pinboard.price_snapshots.health === 'stale'
                  ? 'bg-yellow-900/20 border-yellow-700/50'
                  : 'bg-red-900/20 border-red-700/50'
              }`}
            >
              <div className="text-xs text-neutral-400">Price Data</div>
              <div className="text-lg capitalize">{pinboard.price_snapshots.health}</div>
              <div className="text-xs opacity-80">
                {pinboard.price_snapshots.latest_date || '—'} · {pinboard.price_snapshots.age_hours ?? 0}h ago
              </div>
            </div>
            <div
              className={`p-3 rounded-lg border ${
                pinboard.performance.slow_jobs_24h === 0
                  ? 'bg-green-900/20 border-green-700/50'
                  : pinboard.performance.slow_jobs_24h < 3
                  ? 'bg-yellow-900/20 border-yellow-700/50'
                  : 'bg-red-900/20 border-red-700/50'
              }`}
            >
              <div className="text-xs text-neutral-400">Performance</div>
              <div className="text-lg font-mono">{pinboard.performance.slow_jobs_24h} slow</div>
              <div className="text-xs opacity-80">{pinboard.rate_limits.violations_24h} rate limit hits</div>
            </div>
          </div>
        ) : (
          <div className="text-neutral-500 text-sm">Could not load pinboard.</div>
        )}
      </section>

      {/* AI Health + Usage */}
      <div className="grid md:grid-cols-2 gap-4">
        <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">AI Health</h2>
            <Link href="/admin/ai-health" className="text-xs text-blue-400 hover:text-blue-300">
              Full AI Health →
            </Link>
          </div>
          {health ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={health.openai_key_configured ? 'text-green-400' : 'text-amber-400'}>
                  {health.openai_key_configured ? '✓' : '✗'}
                </span>
                <span className="text-sm">
                  OPENAI_API_KEY {health.openai_key_configured ? 'configured' : 'not set'}
                </span>
              </div>
              {health.probe && (
                <div className="text-xs text-neutral-400">
                  Probe: {health.probe.ok ? `✓ ${health.probe.latency_ms}ms` : `✗ ${health.probe.error || 'failed'}`}
                </div>
              )}
              {health.diagnosis && health.diagnosis.length > 0 && (
                <div className="text-xs text-amber-300 mt-1">
                  {health.diagnosis[0]}
                </div>
              )}
            </div>
          ) : (
            <div className="text-neutral-500 text-sm">Could not load AI health.</div>
          )}
        </section>

        <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">AI Usage (7d)</h2>
            <Link href="/admin/ai-usage" className="text-xs text-blue-400 hover:text-blue-300">
              Full AI Usage →
            </Link>
          </div>
          {aiUsage ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <div>
                <div className="text-xs text-neutral-400">Today</div>
                <div className="font-mono">${Number(aiUsage.recent_days_cost?.today_usd ?? 0).toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-400">3 days</div>
                <div className="font-mono">${Number(aiUsage.recent_days_cost?.last_3_days ?? 0).toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-400">7d total</div>
                <div className="font-mono">${Number(aiUsage.totals?.cost_usd ?? 0).toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-400">Requests</div>
                <div className="font-mono">{aiUsage.totals?.messages ?? 0}</div>
              </div>
            </div>
          ) : (
            <div className="text-neutral-500 text-sm">Could not load AI usage.</div>
          )}
        </section>
      </div>

      {/* Pro Gate + Mulligan */}
      <div className="grid md:grid-cols-2 gap-4">
        <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Pro Gate</h2>
              <div className="flex rounded bg-neutral-800 p-0.5">
                {(['24h', '7d', '30d'] as ProGateRange[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setProGateRange(r)}
                    className={`px-2 py-0.5 text-xs rounded ${proGateRange === r ? 'bg-neutral-600 text-white' : 'text-neutral-400 hover:text-white'}`}
                  >
                    {r === '24h' ? '1d' : r}
                  </button>
                ))}
              </div>
            </div>
            <Link href="/admin/pro-gate" className="text-xs text-blue-400 hover:text-blue-300">
              Full Pro Gate →
            </Link>
          </div>
          {proGate?.funnel ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-xs text-neutral-400">Views</div>
                <div className="font-mono">{proGate.funnel.viewers}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-400">Clicks</div>
                <div className="font-mono">{proGate.funnel.clickers}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-400">Started</div>
                <div className="font-mono">{proGate.funnel.starters}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-400">Converted</div>
                <div className="font-mono">{proGate.funnel.converters}</div>
              </div>
              <div className="col-span-2 text-xs text-neutral-400">
                Click {proGate.funnel.clickRate} · Conversion {proGate.funnel.conversionRate}
              </div>
            </div>
          ) : (
            <div className="text-neutral-500 text-sm">Could not load Pro gate.</div>
          )}
        </section>

        <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Mulligan</h2>
              <div className="flex rounded bg-neutral-800 p-0.5">
                {([1, 7, 30] as MulliganDays[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setMulliganDays(d)}
                    className={`px-2 py-0.5 text-xs rounded ${mulliganDays === d ? 'bg-neutral-600 text-white' : 'text-neutral-400 hover:text-white'}`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
            <Link href="/admin/mulligan-analytics" className="text-xs text-blue-400 hover:text-blue-300">
              Full Mulligan →
            </Link>
          </div>
          {mulligan ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-xs text-neutral-400">AI runs</div>
                <div className="font-mono">{mulligan.total_runs ?? 0}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-400">Unique users</div>
                <div className="font-mono">{mulligan.unique_users ?? 0}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-400">Cost (USD)</div>
                <div className="font-mono">${(mulligan.total_cost_usd ?? 0).toFixed(2)}</div>
              </div>
            </div>
          ) : (
            <div className="text-neutral-500 text-sm">Could not load Mulligan stats.</div>
          )}
        </section>
      </div>

      {/* Discovery Crons */}
      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Discovery Crons</h2>
          <Link href="/admin/ops" className="text-xs text-blue-400 hover:text-blue-300">
            Ops page →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
          {CRON_KEYS.map((name) => (
            <div key={name} className="p-2 rounded bg-neutral-800/60 border border-neutral-700 flex flex-col gap-2">
              <div className="font-mono text-neutral-300">{name}</div>
              <div className="text-neutral-500">
                {cronLastRun[`job:last:${name}`]
                  ? new Date(cronLastRun[`job:last:${name}`]).toLocaleString()
                  : '—'}
              </div>
              <button
                onClick={() => runCron(name)}
                disabled={!!cronRunBusy}
                className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-xs disabled:opacity-50 w-fit"
              >
                {cronRunBusy === name ? 'Running…' : 'Run now'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2 pt-2">
        <Link href="/admin/ops" className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm">
          Ops
        </Link>
        <Link href="/admin/ai-health" className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm">
          AI Health
        </Link>
        <Link href="/admin/ai-usage" className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm">
          AI Usage
        </Link>
        <Link href="/admin/pro-gate" className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm">
          Pro Gate
        </Link>
        <Link href="/admin/mulligan-analytics" className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm">
          Mulligan Analytics
        </Link>
        <Link href="/admin/feedback" className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm">
          Feedback
        </Link>
      </div>
    </main>
  );
}
