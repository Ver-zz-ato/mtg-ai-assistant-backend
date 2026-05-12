'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { MetaSignalsJobSummary } from '@/components/admin/MetaSignalsJobSummary';
import {
  DiscoverMetaRollupsCompact,
  type DiscoverRollupsPayload,
} from '@/components/admin/DiscoverMetaRollupsPanel';
import { ADMIN_ROUTE_GROUPS } from '@/lib/admin/route-catalog';
import type { MetaSignalsJobDetail } from '@/lib/meta/metaSignalsJobStatus';
import type { AdminJobDetail } from '@/lib/admin/adminJobDetail';

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

type JobInspectorPayload = {
  health: string;
  lastSuccess: string | null;
  lastAttempt: string | null;
  latest: AdminJobDetail | null;
  history: unknown[];
};

type DiscoverMetaStatus = {
  ok?: boolean;
  health?: string;
  lastSuccess?: string | null;
  lastAttempt?: string | null;
  jobDetail?: MetaSignalsJobDetail | null;
  samples?: Record<string, { count?: number; updated_at?: string; preview?: unknown[] }>;
  meta_commander_daily_yesterday_rows?: number;
  meta_card_daily_today_rows?: number;
};

type ProGateRange = '24h' | '7d' | '30d';
type MulliganDays = 1 | 7 | 30;

const CRON_KEYS = ['deck-costs', 'commander-aggregates', 'meta-signals', 'top-cards'] as const;
const OTHER_CRON_KEYS = ['budget-swaps-update'] as const;

const CRON_INFO: Record<(typeof CRON_KEYS)[number], { eli5: string; schedule: string; when: string }> = {
  'deck-costs': {
    eli5: 'Adds up card prices so we know how much each public deck costs',
    schedule: 'Daily 04:30 UTC',
    when: 'Run after bulk deck import if deck values look stale',
  },
  'commander-aggregates': {
    eli5: 'For each commander: which cards appear most, median deck cost, recent decks',
    schedule: 'Daily 05:00 UTC',
    when: 'Run after deck-costs; needed if commander hub stats are stale',
  },
  'meta-signals': {
    eli5:
      'Blends Scryfall (EDHREC order) with ManaTap decks → meta_signals + Discover; status in job:meta-signals:detail',
    schedule: 'Daily 05:15 UTC',
    when: 'Run after commander-aggregates; refresh if Discover meta looks wrong',
  },
  'top-cards': {
    eli5: 'Which cards are in the most decks for each commander (for commander pages)',
    schedule: 'Daily 05:30 UTC',
    when: 'Run last; refreshes top cards on each commander page',
  },
};

const OTHER_CRON_INFO: Record<(typeof OTHER_CRON_KEYS)[number], { eli5: string; schedule: string; when: string }> = {
  'budget-swaps-update': {
    eli5: 'AI suggests new expensive→budget card pairs for Quick Swaps mode',
    schedule: 'Sundays 03:00 UTC',
    when: 'Run when Quick Swaps needs fresh suggestions for new meta cards',
  },
};

const DATA_JOB_ANCHOR: Record<string, string> = {
  'deck-costs': 'job-deck-costs',
  'commander-aggregates': 'job-commander-aggregates',
  'top-cards': 'job-top-cards',
  'meta-signals': 'discover-meta-inspector',
  'budget-swaps-update': 'job-budget-swaps',
};

function confirmDanger(phrase = 'RUN', label = 'this admin action') {
  if (typeof window === 'undefined') return null;
  const value = window.prompt(`Type ${phrase} to confirm ${label}.`);
  return value === phrase ? value : null;
}

function jobHealthClass(h?: string) {
  if (h === 'healthy') return 'text-emerald-400';
  if (h === 'stale') return 'text-amber-400';
  if (h === 'failed') return 'text-rose-400';
  if (h === 'degraded' || h === 'partial') return 'text-yellow-300';
  return 'text-neutral-400';
}

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
  const [otherCronRunBusy, setOtherCronRunBusy] = useState<string | null>(null);
  const [reportRunBusy, setReportRunBusy] = useState<'daily' | 'weekly' | null>(null);
  const [opsReports, setOpsReports] = useState<{ latest_daily?: { created_at: string; status: string }; latest_weekly?: { created_at: string; status: string } } | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string>('');
  const [discoverMeta, setDiscoverMeta] = useState<DiscoverMetaStatus | null>(null);
  const [discoverRollups, setDiscoverRollups] = useState<DiscoverRollupsPayload | null>(null);
  const [jobInspector, setJobInspector] = useState<{
    jobs: Record<string, JobInspectorPayload>;
    tableMissing?: boolean;
  } | null>(null);

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
        reportsRes,
        discoverMetaRes,
        rollupsRes,
        inspectorRes,
      ] = await Promise.all([
        fetch('/api/admin/audit-pinboard', { cache: 'no-store' }),
        fetch('/api/admin/ai/health', { cache: 'no-store' }),
        fetch('/api/admin/ai-usage/summary?days=7&limit=5000', { cache: 'no-store' }),
        fetch(`/api/admin/pro-gate-analytics?range=${proGateRange}`, { cache: 'no-store' }),
        fetch(`/api/admin/mulligan/analytics?days=${mulliganDays}`, { cache: 'no-store' }),
        fetch('/api/admin/config?key=job:last:deck-costs&key=job:last:commander-aggregates&key=job:last:meta-signals&key=job:last:top-cards&key=job:last:budget-swaps-update&key=job:last:price_snapshot_bulk', { cache: 'no-store' }),
        fetch('/api/admin/ops-reports/list?limit=5', { cache: 'no-store' }),
        fetch('/api/admin/discover-meta-status', { cache: 'no-store' }),
        fetch('/api/admin/discover-meta-rollups', { cache: 'no-store' }),
        fetch(
          '/api/admin/admin-job-inspector?jobs=' +
            encodeURIComponent(
              'deck-costs,commander-aggregates,top-cards,budget-swaps-update,price_snapshot_bulk,daily_ops_report,weekly_ops_report'
            ),
          { cache: 'no-store' }
        ),
      ]);

      const pinJ = await pinRes.json().catch(() => ({}));
      const healthJ = await healthRes.json().catch(() => ({}));
      const usageJ = await usageRes.json().catch(() => ({}));
      const proJ = await proRes.json().catch(() => ({}));
      const mullJ = await mullRes.json().catch(() => ({}));
      const configJ = await configRes.json().catch(() => ({}));
      const reportsJ = await reportsRes.json().catch(() => ({}));
      const discoverMetaJ = await discoverMetaRes.json().catch(() => ({}));
      const rollupsJ = await rollupsRes.json().catch(() => ({}));
      const inspectorJ = await inspectorRes.json().catch(() => ({}));

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

      if (reportsJ?.ok) setOpsReports({ latest_daily: reportsJ.latest_daily, latest_weekly: reportsJ.latest_weekly });
      else setOpsReports(null);

      if (discoverMetaJ?.ok) setDiscoverMeta(discoverMetaJ as DiscoverMetaStatus);
      else setDiscoverMeta(null);

      if (rollupsJ?.ok) setDiscoverRollups(rollupsJ as DiscoverRollupsPayload);
      else setDiscoverRollups(null);

      if (inspectorJ?.ok && inspectorJ?.jobs) {
        setJobInspector({
          jobs: inspectorJ.jobs as Record<string, JobInspectorPayload>,
          tableMissing: inspectorJ.tableMissing,
        });
      } else {
        setJobInspector(null);
      }

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
    const confirmation = confirmDanger('RUN', `running ${name}`);
    if (!confirmation) return;
    setCronRunBusy(name);
    try {
      const r = await fetch('/api/admin/cron/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cron: name, confirmation }),
      });
      const j = await r.json();
      if (j?.ok) {
        load();
        if (name === 'meta-signals' && typeof j.humanLine === 'string') {
          alert(`✅ meta-signals\n${j.humanLine}`);
        } else {
          alert(`✅ ${name} completed. ${j.updated != null ? `Updated: ${j.updated}` : ''}`);
        }
      } else {
        alert(`❌ ${name} failed: ${j?.error || r.statusText}`);
      }
    } catch (e: unknown) {
      alert(`❌ ${name} failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setCronRunBusy(null);
    }
  }

  async function runOtherCron(name: (typeof OTHER_CRON_KEYS)[number]) {
    const confirmation = confirmDanger('RUN', `running ${name}`);
    if (!confirmation) return;
    setOtherCronRunBusy(name);
    try {
      const r = await fetch('/api/admin/cron/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cron: name, confirmation }),
      });
      const j = await r.json();
      if (j?.ok) {
        load();
        alert(`✅ ${name} completed. ${j.added != null ? `Added: ${j.added} new swaps` : j.message || ''}`);
      } else {
        alert(`❌ ${name} failed: ${j?.error || r.statusText}`);
      }
    } catch (e: unknown) {
      alert(`❌ ${name} failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setOtherCronRunBusy(null);
    }
  }

  async function runReport(type: 'daily' | 'weekly') {
    const confirmation = confirmDanger('RUN', `running the ${type} ops report`);
    if (!confirmation) return;
    setReportRunBusy(type);
    try {
      const r = await fetch('/api/admin/ops-reports/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, confirmation }),
      });
      const j = await r.json();
      if (j?.ok) {
        load();
        alert(`${type === 'daily' ? 'Daily' : 'Weekly'} report completed. Status: ${j.status}`);
      } else {
        alert(j?.error || 'Run failed');
      }
    } catch (e: unknown) {
      alert(`Report failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setReportRunBusy(null);
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

      <section className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-semibold">Admin Command Map</h2>
            <p className="text-xs text-neutral-500">Grouped routes for AI, app, data, money, SEO, ops, and safety.</p>
          </div>
          <Link href="/admin/route-health" className="text-xs px-3 py-1.5 rounded bg-blue-600/80 hover:bg-blue-500 text-white">
            Route health
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.values(ADMIN_ROUTE_GROUPS).map((group) => (
            <div key={group.title} className="rounded-lg border border-neutral-800 bg-black/30 p-3">
              <div className="text-xs uppercase tracking-wide text-neutral-500 mb-2">{group.title}</div>
              <div className="flex flex-wrap gap-2">
                {group.routes.map((href) => (
                  <Link
                    key={href}
                    href={href}
                    className="text-xs px-2 py-1 rounded border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200"
                  >
                    {href.split('/').filter(Boolean).slice(-1)[0]?.replace(/-/g, ' ') || href}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

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

      {/* Discover / Meta pipeline (mobile app) */}
      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-semibold">Discover meta (Commander trends)</h2>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              Scryfall EDHREC blend + ManaTap decks → <code className="text-neutral-400">meta_signals</code>. Vercel
              cron <code className="text-neutral-400">15 5 * * *</code> →{' '}
              <code className="text-neutral-400">/api/cron/meta-signals</code>.
            </p>
          </div>
          <Link href="/admin/data#discover-meta-history" className="text-xs text-blue-400 hover:text-blue-300">
            Full inspector & run history →
          </Link>
        </div>
        {discoverMeta?.ok ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <div className="p-2 rounded bg-neutral-800/60 border border-neutral-700">
              <div className="text-neutral-400">Status</div>
              <div
                className={`font-mono mt-1 ${
                  discoverMeta.health === 'healthy'
                    ? 'text-emerald-400'
                    : discoverMeta.health === 'stale'
                      ? 'text-amber-400'
                      : 'text-rose-400'
                }`}
              >
                {discoverMeta.health ?? '—'}
              </div>
            </div>
            <div className="p-2 rounded bg-neutral-800/60 border border-neutral-700">
              <div className="text-neutral-400">Pill mode (app label)</div>
              <div className="font-mono text-neutral-200 mt-1">{discoverMeta.jobDetail?.pillMode ?? '—'}</div>
            </div>
            <div className="p-2 rounded bg-neutral-800/60 border border-neutral-700">
              <div className="text-neutral-400">Snapshot date</div>
              <div className="font-mono text-neutral-200 mt-1">{discoverMeta.jobDetail?.snapshotDate ?? '—'}</div>
            </div>
            <div className="p-2 rounded bg-neutral-800/60 border border-neutral-700">
              <div className="text-neutral-400">Last success</div>
              <div className="text-neutral-300 mt-1">
                {discoverMeta.lastSuccess ? new Date(discoverMeta.lastSuccess).toLocaleString() : '—'}
              </div>
            </div>
            <div className="p-2 rounded bg-neutral-800/60 border border-neutral-700">
              <div className="text-neutral-400">Last attempt</div>
              <div className="text-neutral-300 mt-1">
                {discoverMeta.lastAttempt ? new Date(discoverMeta.lastAttempt).toLocaleString() : '—'}
              </div>
            </div>
            <div className="p-2 rounded bg-neutral-800/60 border border-neutral-700">
              <div className="text-neutral-400">Yesterday rank rows (commander_daily)</div>
              <div className="font-mono text-neutral-200 mt-1">
                {discoverMeta.meta_commander_daily_yesterday_rows ?? 0}
              </div>
            </div>
            <div className="p-2 rounded bg-neutral-800/60 border border-neutral-700">
              <div className="text-neutral-400">Daily card rows (today / meta_card_daily)</div>
              <div className="font-mono text-neutral-200 mt-1">
                {discoverMeta.meta_card_daily_today_rows ?? 0}
              </div>
            </div>
            <div className="col-span-full space-y-2">
              <div className="text-[11px] text-neutral-400">Last run summary</div>
              {discoverMeta.jobDetail ? (
                <>
                  <MetaSignalsJobSummary detail={discoverMeta.jobDetail} compact />
                  <details className="rounded border border-neutral-700 bg-neutral-900/50">
                    <summary className="cursor-pointer text-[11px] text-neutral-500 px-2 py-1.5">
                      Full summary (diffs, warnings, daily writes)
                    </summary>
                    <div className="px-2 pb-2 border-t border-neutral-800">
                      <MetaSignalsJobSummary detail={discoverMeta.jobDetail} />
                    </div>
                  </details>
                </>
              ) : (
                <div className="text-xs text-neutral-500">No job detail in app_config.</div>
              )}
            </div>
            {discoverMeta.jobDetail?.lastError && (
              <div className="col-span-full p-2 rounded border border-rose-700/50 bg-rose-950/30 text-[11px] text-rose-100">
                {discoverMeta.jobDetail.lastError}
              </div>
            )}
            <div className="col-span-full p-2 rounded bg-neutral-800/40 border border-neutral-700">
              <div className="text-neutral-400 mb-1">Trending commanders (preview)</div>
              <pre className="text-[10px] text-neutral-300 font-mono overflow-auto max-h-24">
                {JSON.stringify(discoverMeta.samples?.['trending-commanders']?.preview ?? [], null, 2)}
              </pre>
            </div>
            <div className="col-span-full p-2 rounded bg-sky-950/25 border border-sky-900/40">
              <div className="text-[11px] text-neutral-400 mb-1">7d rollup (from daily snapshots)</div>
              <DiscoverMetaRollupsCompact data={discoverRollups} />
            </div>
          </div>
        ) : (
          <div className="text-neutral-500 text-sm">Could not load discover meta status (admin API).</div>
        )}
      </section>

      {/* Discovery Crons (from Ops) */}
      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold">Discovery Crons</h2>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              Auto-run daily 04:30–05:30 UTC. Run order: deck-costs → commander-aggregates → meta-signals → top-cards.
            </p>
          </div>
          <Link href="/admin/ops" className="text-xs text-blue-400 hover:text-blue-300">
            Ops page →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
          {CRON_KEYS.map((name) => (
            <div key={name} className="p-2 rounded bg-neutral-800/60 border border-neutral-700 flex flex-col gap-2">
              <div className="font-mono text-neutral-300">{name}</div>
              <div className="text-[11px] text-neutral-500 leading-tight">
                {CRON_INFO[name].eli5}
              </div>
              <div className="text-[10px] text-neutral-600">
                Auto: {CRON_INFO[name].schedule}
              </div>
              <div className="text-[10px] text-neutral-600 italic">
                Run when: {CRON_INFO[name].when}
              </div>
              <div className="text-neutral-500">
                Last success:{' '}
                {cronLastRun[`job:last:${name}`]
                  ? new Date(cronLastRun[`job:last:${name}`]).toLocaleString()
                  : '—'}
              </div>
              {name !== 'meta-signals' && jobInspector?.jobs?.[name]?.latest?.compactLine && (
                <div className="text-[10px] text-neutral-400 leading-snug border border-neutral-800/80 rounded px-1.5 py-1 bg-neutral-950/40">
                  {jobInspector.jobs[name].latest?.compactLine}
                </div>
              )}
              {name !== 'meta-signals' && jobInspector?.jobs?.[name] && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]">
                  <span className="text-neutral-500">Health</span>
                  <span className={`font-mono ${jobHealthClass(jobInspector.jobs[name].health)}`}>
                    {jobInspector.jobs[name].health}
                  </span>
                  {(jobInspector.jobs[name].latest?.warnings?.length ?? 0) > 0 && (
                    <span className="text-amber-400/90">
                      {jobInspector.jobs[name].latest?.warnings?.length} warnings
                    </span>
                  )}
                </div>
              )}
              <Link
                href={`/admin/data#${DATA_JOB_ANCHOR[name] ?? 'admin-job-inspector'}`}
                className="text-[10px] text-blue-400 hover:text-blue-300 w-fit"
              >
                Inspector on Data →
              </Link>
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

      {/* Other / Weekly Crons */}
      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold">Other / Weekly Crons</h2>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              Weekly jobs. budget-swaps-update runs Sundays 03:00 UTC. Trigger here to refresh Quick Swaps early.
            </p>
          </div>
          <Link href="/admin/budget-swaps" className="text-xs text-blue-400 hover:text-blue-300">
            Budget Swaps Admin →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
          {OTHER_CRON_KEYS.map((name) => (
            <div key={name} className="p-2 rounded bg-neutral-800/60 border border-neutral-700 flex flex-col gap-2">
              <div className="font-mono text-neutral-300">{name}</div>
              <div className="text-[11px] text-neutral-500 leading-tight">
                {OTHER_CRON_INFO[name].eli5}
              </div>
              <div className="text-[10px] text-neutral-600">
                Auto: {OTHER_CRON_INFO[name].schedule}
              </div>
              <div className="text-[10px] text-neutral-600 italic">
                Run when: {OTHER_CRON_INFO[name].when}
              </div>
              <div className="text-neutral-500">
                Last success:{' '}
                {cronLastRun[`job:last:${name}`]
                  ? new Date(cronLastRun[`job:last:${name}`]).toLocaleString()
                  : '—'}
              </div>
              {jobInspector?.jobs?.[name]?.latest?.compactLine && (
                <div className="text-[10px] text-neutral-400 leading-snug border border-neutral-800/80 rounded px-1.5 py-1 bg-neutral-950/40">
                  {jobInspector.jobs[name].latest?.compactLine}
                </div>
              )}
              {jobInspector?.jobs?.[name] && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]">
                  <span className="text-neutral-500">Health</span>
                  <span className={`font-mono ${jobHealthClass(jobInspector.jobs[name].health)}`}>
                    {jobInspector.jobs[name].health}
                  </span>
                </div>
              )}
              <Link
                href="/admin/data#job-budget-swaps"
                className="text-[10px] text-blue-400 hover:text-blue-300 w-fit"
              >
                Inspector on Data →
              </Link>
              <button
                onClick={() => runOtherCron(name)}
                disabled={!!otherCronRunBusy}
                className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-xs disabled:opacity-50 w-fit"
              >
                {otherCronRunBusy === name ? 'Running…' : 'Run now'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Price snapshot automation (delegated) */}
      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold">Price Snapshot Automation</h2>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              Daily snapshot cron (`/api/cron/price/snapshot`) should delegate to your Render bulk jobs service via `BULK_JOBS_URL`.
            </p>
          </div>
          <Link href="/admin/data" className="text-xs text-blue-400 hover:text-blue-300">
            Data jobs page →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded bg-neutral-800/60 border border-neutral-700 space-y-2">
            <div className="text-neutral-400">Last snapshot run</div>
            <div className="font-mono text-sm mt-1">
              {cronLastRun['job:last:price_snapshot_bulk']
                ? new Date(cronLastRun['job:last:price_snapshot_bulk']).toLocaleString()
                : '—'}
            </div>
            {jobInspector?.jobs?.price_snapshot_bulk?.latest?.compactLine && (
              <div className="text-[10px] text-neutral-400 leading-snug border border-neutral-800/80 rounded px-1.5 py-1">
                {jobInspector.jobs.price_snapshot_bulk.latest.compactLine}
              </div>
            )}
            {jobInspector?.jobs?.price_snapshot_bulk && (
              <div className="text-[10px]">
                <span className="text-neutral-500">Health </span>
                <span className={`font-mono ${jobHealthClass(jobInspector.jobs.price_snapshot_bulk.health)}`}>
                  {jobInspector.jobs.price_snapshot_bulk.health}
                </span>
              </div>
            )}
            <Link href="/admin/data#job-price-snapshot" className="text-[10px] text-blue-400 hover:text-blue-300 inline-block">
              Inspector on Data →
            </Link>
          </div>
          <div className="p-3 rounded bg-neutral-800/60 border border-neutral-700">
            <div className="text-neutral-400">Expected env wiring</div>
            <div className="mt-1 text-neutral-300">
              Vercel: <code className="bg-black/40 px-1 rounded">BULK_JOBS_URL=https://mtg-bulk-jobs.onrender.com</code>
            </div>
            <div className="text-neutral-500 mt-1">
              Keep <code className="bg-black/40 px-1 rounded">CRON_KEY</code> identical on Vercel + Render.
            </div>
          </div>
        </div>
      </section>

      {/* Manual checks (from Ops — daily/weekly reports) */}
      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold">Manual checks</h2>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              Ops health reports. Daily 06:00 UTC, weekly Sundays 07:00 UTC. Run here if you want a fresh report now.
            </p>
          </div>
          <Link href="/admin/ops" className="text-xs text-blue-400 hover:text-blue-300">
            Ops page →
          </Link>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="p-2 rounded bg-neutral-800/60 border border-neutral-700 flex flex-col gap-2 min-w-[140px]">
            <div className="font-medium text-neutral-300">Daily report</div>
            <div className="text-[11px] text-neutral-500">
              Errors, spend, price data, perf. Stored in ops_reports + Discord.
            </div>
            {opsReports?.latest_daily && (
              <div className="text-[10px] text-neutral-600">
                Last: {new Date(opsReports.latest_daily.created_at).toLocaleString()} · {opsReports.latest_daily.status}
              </div>
            )}
            {jobInspector?.jobs?.daily_ops_report?.latest?.compactLine && (
              <div className="text-[10px] text-neutral-400 border border-neutral-800/80 rounded px-1.5 py-1 leading-snug">
                {jobInspector.jobs.daily_ops_report.latest.compactLine}
              </div>
            )}
            <Link href="/admin/data#job-daily-ops" className="text-[10px] text-blue-400 hover:text-blue-300 w-fit">
              History on Data →
            </Link>
            <button
              onClick={() => runReport('daily')}
              disabled={!!reportRunBusy}
              className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-xs disabled:opacity-50 w-fit"
            >
              {reportRunBusy === 'daily' ? 'Running…' : 'Run daily'}
            </button>
          </div>
          <div className="p-2 rounded bg-neutral-800/60 border border-neutral-700 flex flex-col gap-2 min-w-[140px]">
            <div className="font-medium text-neutral-300">Weekly report</div>
            <div className="text-[11px] text-neutral-500">
              Full ops health. Sundays 07:00 UTC.
            </div>
            {opsReports?.latest_weekly && (
              <div className="text-[10px] text-neutral-600">
                Last: {new Date(opsReports.latest_weekly.created_at).toLocaleString()} · {opsReports.latest_weekly.status}
              </div>
            )}
            {jobInspector?.jobs?.weekly_ops_report?.latest?.compactLine && (
              <div className="text-[10px] text-neutral-400 border border-neutral-800/80 rounded px-1.5 py-1 leading-snug">
                {jobInspector.jobs.weekly_ops_report.latest.compactLine}
              </div>
            )}
            <Link href="/admin/data#job-weekly-ops" className="text-[10px] text-blue-400 hover:text-blue-300 w-fit">
              History on Data →
            </Link>
            <button
              onClick={() => runReport('weekly')}
              disabled={!!reportRunBusy}
              className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-xs disabled:opacity-50 w-fit"
            >
              {reportRunBusy === 'weekly' ? 'Running…' : 'Run weekly'}
            </button>
          </div>
        </div>
      </section>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2 pt-2">
        <Link href="/admin/budget-swaps" className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm">
          Budget Swaps
        </Link>
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
