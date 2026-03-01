'use client';

import React, { useState, useEffect } from 'react';
import { ELI5, HelpTip } from '@/components/AdminHelp';

type TimeRange = '1h' | '24h' | '7d';

interface RouteStats {
  route: string;
  count: number;
  avg_duration_ms?: number;
  p95_duration_ms?: number;
  error_pct?: number;
  bot_pct?: number;
  total_duration_ms?: number;
  total_bytes?: number;
  avg_bytes?: number;
}

interface Summary {
  ok: boolean;
  awaiting_data?: boolean;
  message?: string;
  range?: TimeRange;
  totals?: {
    requests: number;
    errors: number;
    error_pct: number;
    bots: number;
    bot_pct: number;
    avg_duration_ms: number;
    total_bytes: number;
  };
  top_by_count?: RouteStats[];
  top_by_time?: RouteStats[];
  top_by_bytes?: RouteStats[];
  bots_summary?: {
    bot_pct: number;
    top_user_agents: { user_agent: string; count: number }[];
  };
  polling_summary?: { route: string; count: number; bot_pct: number }[];
  cron_summary?: { route: string; count: number; total_duration_ms: number }[];
  caller_types?: Record<string, number>;
  env_flags?: {
    BILLING_METRICS_PERSIST: boolean;
    BILLING_GUARD_BOT_BLOCK: boolean;
    BILLING_GUARD_RATE_LIMIT: boolean;
    BILLING_GUARD_POLL_THROTTLE: boolean;
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function Badge({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'warning' | 'error' | 'success' }) {
  const colors = {
    default: 'bg-neutral-700 text-neutral-200',
    warning: 'bg-amber-900/60 text-amber-300',
    error: 'bg-red-900/60 text-red-300',
    success: 'bg-emerald-900/60 text-emerald-300',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[variant]}`}>
      {children}
    </span>
  );
}

function Card({ title, children, eli5 }: { title: string; children: React.ReactNode; eli5?: string }) {
  return (
    <div className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
      <h3 className="text-sm font-semibold text-neutral-200 mb-1 flex items-center gap-2">
        {title}
        {eli5 && <HelpTip text={eli5} />}
      </h3>
      {children}
    </div>
  );
}

export default function BillingForensicsPage() {
  const [range, setRange] = useState<TimeRange>('24h');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/billing-forensics/summary?range=${range}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        setError(json.error || 'Failed to load');
      } else {
        setData(json);
      }
    } catch (e: any) {
      setError(e?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [range]);

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold">Billing Forensics</h1>
          <p className="text-sm text-neutral-400">Figure out why Vercel is charging us more.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-neutral-400">Time range:</label>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as TimeRange)}
            className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm"
          >
            <option value="1h">Last 1 hour</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
          </select>
          <button
            onClick={loadData}
            disabled={loading}
            className="px-3 py-1 bg-neutral-700 hover:bg-neutral-600 rounded text-sm disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-700 p-4 text-red-300">
          Error: {error}
        </div>
      )}

      {data?.awaiting_data && (
        <div className="rounded-lg bg-amber-900/30 border border-amber-700 p-4">
          <h3 className="font-semibold text-amber-300 mb-2">⏳ Awaiting Data</h3>
          <p className="text-sm text-amber-200">{data.message}</p>
          <div className="mt-3 text-xs text-neutral-400">
            <p>To enable data collection:</p>
            <ol className="list-decimal ml-5 mt-1 space-y-1">
              <li>Run the migration: <code className="bg-neutral-800 px-1 rounded">080_request_metrics.sql</code></li>
              <li>Set <code className="bg-neutral-800 px-1 rounded">BILLING_METRICS_PERSIST=1</code> in Vercel Environment Variables</li>
              <li>Redeploy</li>
            </ol>
          </div>
        </div>
      )}

      {/* Section A: What Vercel Charges For */}
      <section>
        <h2 className="text-base font-semibold mb-3">💰 What Vercel is Charging Us For</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          <Card title="Function Invocations" eli5="How many times the kitchen gets an order">
            <p className="text-2xl font-bold text-blue-400">{data?.totals?.requests?.toLocaleString() || '—'}</p>
            <p className="text-xs text-neutral-500 mt-1">Every API call = 1 invocation</p>
          </Card>
          <Card title="Memory (GB-hours)" eli5="How big the kitchen counter is × how long it's occupied">
            <p className="text-xs text-neutral-400">Logged requests × duration</p>
            <p className="text-lg font-semibold text-purple-400 mt-1">
              ~{data?.totals?.avg_duration_ms ? formatMs(data.totals.avg_duration_ms) : '—'} avg
            </p>
          </Card>
          <Card title="Total Runtime" eli5="Sum of all request durations (proxy for CPU, not exact)">
            <p className="text-xs text-neutral-400">Sum of all duration_ms</p>
            <p className="text-lg font-semibold text-orange-400 mt-1">
              {data?.top_by_time?.[0] ? `Top: ${data.top_by_time[0].route.slice(0, 20)}...` : '—'}
            </p>
          </Card>
          <Card title="Data Transfer" eli5="How many bags of food leave the restaurant">
            <p className="text-2xl font-bold text-green-400">{data?.totals?.total_bytes ? formatBytes(data.totals.total_bytes) : '—'}</p>
            <p className="text-xs text-neutral-500 mt-1">Large JSON = more cost</p>
          </Card>
          <Card title="ISR Reads" eli5="Request-driven: scales with traffic to ISR pages, NOT timer-based">
            <p className="text-xs text-neutral-400">Charged per request to cached pages</p>
            <p className="text-xs text-neutral-500 mt-1">More traffic = more reads</p>
          </Card>
        </div>
      </section>

      {/* Section B: What We're Measuring */}
      <ELI5
        heading="What We're Measuring"
        items={[
          'We log every request with: route, duration, status, bytes in/out, bot flag, caller type, request ID',
          'Sampling: We record 1% of requests + ALL slow requests (>2s) + ALL errors + ALL large responses (>100KB)',
          'This keeps log volume low while catching the expensive stuff',
        ]}
      />

      {/* Section C: Top Cost Drivers */}
      {data && !data.awaiting_data && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold">📊 Top Cost Drivers ({range})</h2>

          {/* Top by Count */}
          <Card title="Top Routes by Request Count" eli5="Which endpoints are called the most">
            <div className="overflow-x-auto">
              <table className="w-full text-sm mt-2">
                <thead>
                  <tr className="text-left text-neutral-500 text-xs">
                    <th className="pb-2">Route</th>
                    <th className="pb-2 text-right">Count</th>
                    <th className="pb-2 text-right">Avg</th>
                    <th className="pb-2 text-right">P95</th>
                    <th className="pb-2 text-right">Err%</th>
                    <th className="pb-2 text-right">Bot%</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.top_by_count || []).map((r, i) => (
                    <tr key={i} className="border-t border-neutral-800">
                      <td className="py-1.5 font-mono text-xs truncate max-w-[200px]" title={r.route}>{r.route}</td>
                      <td className="py-1.5 text-right">{r.count.toLocaleString()}</td>
                      <td className="py-1.5 text-right">{formatMs(r.avg_duration_ms || 0)}</td>
                      <td className="py-1.5 text-right">{formatMs(r.p95_duration_ms || 0)}</td>
                      <td className="py-1.5 text-right">
                        {(r.error_pct || 0) > 5 ? <Badge variant="error">{r.error_pct}%</Badge> : `${r.error_pct || 0}%`}
                      </td>
                      <td className="py-1.5 text-right">
                        {(r.bot_pct || 0) > 30 ? <Badge variant="warning">{r.bot_pct}%</Badge> : `${r.bot_pct || 0}%`}
                      </td>
                    </tr>
                  ))}
                  {(!data.top_by_count || data.top_by_count.length === 0) && (
                    <tr><td colSpan={6} className="py-4 text-center text-neutral-500">No data yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Top by Time */}
          <Card title="Top Routes by Total Runtime" eli5="Sum of duration_ms (proxy for compute, not exact CPU)">
            <div className="overflow-x-auto">
              <table className="w-full text-sm mt-2">
                <thead>
                  <tr className="text-left text-neutral-500 text-xs">
                    <th className="pb-2">Route</th>
                    <th className="pb-2 text-right">Total Time</th>
                    <th className="pb-2 text-right">Count</th>
                    <th className="pb-2 text-right">Avg</th>
                    <th className="pb-2 text-right">P95</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.top_by_time || []).map((r, i) => (
                    <tr key={i} className="border-t border-neutral-800">
                      <td className="py-1.5 font-mono text-xs truncate max-w-[200px]" title={r.route}>{r.route}</td>
                      <td className="py-1.5 text-right font-semibold text-orange-400">{formatMs(r.total_duration_ms || 0)}</td>
                      <td className="py-1.5 text-right">{r.count.toLocaleString()}</td>
                      <td className="py-1.5 text-right">{formatMs(r.avg_duration_ms || 0)}</td>
                      <td className="py-1.5 text-right">{formatMs(r.p95_duration_ms || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Top by Bytes */}
          <Card title="Top Routes by Data Transfer" eli5="Which endpoints send the most data">
            <div className="overflow-x-auto">
              <table className="w-full text-sm mt-2">
                <thead>
                  <tr className="text-left text-neutral-500 text-xs">
                    <th className="pb-2">Route</th>
                    <th className="pb-2 text-right">Total Bytes</th>
                    <th className="pb-2 text-right">Count</th>
                    <th className="pb-2 text-right">Avg Size</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.top_by_bytes || []).map((r, i) => (
                    <tr key={i} className="border-t border-neutral-800">
                      <td className="py-1.5 font-mono text-xs truncate max-w-[200px]" title={r.route}>{r.route}</td>
                      <td className="py-1.5 text-right font-semibold text-green-400">{formatBytes(r.total_bytes || 0)}</td>
                      <td className="py-1.5 text-right">{r.count.toLocaleString()}</td>
                      <td className="py-1.5 text-right">{formatBytes(r.avg_bytes || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      )}

      {/* Section D: Bots / Polling / Cron */}
      {data && !data.awaiting_data && (
        <section>
          <h2 className="text-base font-semibold mb-3">🤖 Bots / Polling / Cron</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Bots */}
            <Card title="Bots Detected" eli5="Automated visitors (crawlers, scrapers, health checks)">
              <p className="text-2xl font-bold mb-2">
                {data.bots_summary?.bot_pct || 0}%
                {(data.bots_summary?.bot_pct || 0) > 30 && <Badge variant="warning" >High</Badge>}
              </p>
              {data.bots_summary?.top_user_agents && data.bots_summary.top_user_agents.length > 0 && (
                <div className="text-xs text-neutral-400 space-y-1 max-h-32 overflow-y-auto">
                  <p className="font-medium text-neutral-300">Top bot user agents:</p>
                  {data.bots_summary.top_user_agents.slice(0, 5).map((ua, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="truncate max-w-[150px]" title={ua.user_agent}>{ua.user_agent}</span>
                      <span className="ml-2 text-neutral-500">{ua.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Polling */}
            <Card title="Polling Endpoints" eli5="Our site asking the server every X seconds">
              {data.polling_summary && data.polling_summary.length > 0 ? (
                <div className="space-y-2 text-sm">
                  {data.polling_summary.map((p, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="font-mono text-xs truncate max-w-[140px]" title={p.route}>{p.route}</span>
                      <div className="flex items-center gap-2">
                        <span>{p.count.toLocaleString()}</span>
                        <Badge>POLL</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-neutral-500 text-sm">No polling endpoints detected</p>
              )}
            </Card>

            {/* Cron */}
            <Card title="Cron Jobs" eli5="Scheduled jobs that run automatically">
              {data.cron_summary && data.cron_summary.length > 0 ? (
                <div className="space-y-2 text-sm">
                  {data.cron_summary.slice(0, 5).map((c, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="font-mono text-xs truncate max-w-[140px]" title={c.route}>{c.route.replace('/api/cron/', '')}</span>
                      <div className="flex items-center gap-2">
                        <span>{c.count}</span>
                        <Badge variant="success">CRON</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-neutral-500 text-sm">No cron jobs in this period</p>
              )}
            </Card>
          </div>
        </section>
      )}

      {/* Section E: Non-API Traffic */}
      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
        <h2 className="text-base font-semibold mb-3">📄 Non-API Traffic (Pages / Images / RSC)</h2>
        <p className="text-sm text-neutral-400 mb-3">
          Costs from page renders, ISR, and image optimization are harder to track. Use Vercel Logs to investigate.
        </p>
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-neutral-300 mb-1">Vercel Log Queries:</p>
            <div className="space-y-2 text-xs font-mono bg-neutral-800 rounded p-3">
              <div>
                <span className="text-neutral-500"># Top page paths:</span>
                <br />
                <code className="text-green-400">type:request | json | group by path | count</code>
              </div>
              <div>
                <span className="text-neutral-500"># Image optimizer traffic:</span>
                <br />
                <code className="text-green-400">type:request | json | path:/_next/image</code>
              </div>
              <div>
                <span className="text-neutral-500"># ISR pages (decks):</span>
                <br />
                <code className="text-green-400">type:request | json | path:/decks</code>
              </div>
              <div>
                <span className="text-neutral-500"># Bot traffic (pages):</span>
                <br />
                <code className="text-green-400">type:request | json | bot_flag:true</code>
              </div>
            </div>
          </div>
          <p className="text-xs text-neutral-500">
            Non-API logs use <code className="bg-neutral-800 px-1 rounded">type:request</code> vs API logs which use <code className="bg-neutral-800 px-1 rounded">type:api_request</code>.
            Sampling is controlled by <code className="bg-neutral-800 px-1 rounded">BILLING_PAGE_SAMPLING</code> (default 0.1%).
          </p>
        </div>
      </section>

      {/* Section F: Safety Toggles */}
      <section>
        <h2 className="text-base font-semibold mb-3">🎚️ Safety Toggles (Env Flags)</h2>
        <p className="text-xs text-neutral-500 mb-3">
          These are environment variables you can set in Vercel to reduce costs while investigating.
          Changes require a redeploy to take effect.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <EnvFlagCard
            name="BILLING_METRICS_PERSIST"
            value={data?.env_flags?.BILLING_METRICS_PERSIST}
            description="Save request metrics to database for this dashboard"
            recommended={!data?.env_flags?.BILLING_METRICS_PERSIST}
          />
          <EnvFlagCard
            name="BILLING_GUARD_BOT_BLOCK"
            value={data?.env_flags?.BILLING_GUARD_BOT_BLOCK}
            description="Return 403 for bots on noisy API routes (config, activity, health)"
            recommended={(data?.bots_summary?.bot_pct || 0) > 30}
          />
          <EnvFlagCard
            name="BILLING_GUARD_RATE_LIMIT"
            value={data?.env_flags?.BILLING_GUARD_RATE_LIMIT}
            description="Apply stricter per-IP rate limits to high-traffic endpoints"
          />
          <EnvFlagCard
            name="BILLING_GUARD_POLL_THROTTLE"
            value={data?.env_flags?.BILLING_GUARD_POLL_THROTTLE}
            description="Throttle polling endpoints to 10 req/min per IP"
          />
        </div>
      </section>

      {/* Section G: Investigation Checklist */}
      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
        <h2 className="text-base font-semibold mb-3">✅ How to Investigate</h2>
        <ol className="list-decimal ml-5 space-y-2 text-sm">
          <li>
            <strong>Look at Top Routes by Count</strong> — Which endpoints are called the most? Are they all necessary?
          </li>
          <li>
            <strong>Check Slow Routes (P95 &gt; 2s)</strong> — These consume the most CPU/memory. Can they be cached or optimized?
          </li>
          <li>
            <strong>Check Bytes Out</strong> — Large JSON responses = high transfer cost. Can you paginate or compress?
          </li>
          <li>
            <strong>Check Bots %</strong> — If &gt;30%, consider enabling <code className="bg-neutral-800 px-1 rounded">BILLING_GUARD_BOT_BLOCK</code>
          </li>
          <li>
            <strong>Check Polling Endpoints</strong> — Are clients polling too frequently? Can you increase intervals or use visibility-based polling?
          </li>
        </ol>
      </section>

      {/* Footer link */}
      <p className="text-xs text-neutral-500">
        Full documentation: <code className="bg-neutral-800 px-1 rounded">docs/billing-forensics.md</code>
      </p>
    </main>
  );
}

function EnvFlagCard({
  name,
  value,
  description,
  recommended,
}: {
  name: string;
  value?: boolean;
  description: string;
  recommended?: boolean;
}) {
  const isOn = value === true;
  return (
    <div className={`rounded-lg border p-3 ${isOn ? 'border-emerald-700 bg-emerald-950/30' : 'border-neutral-700 bg-neutral-900/40'}`}>
      <div className="flex items-center justify-between mb-1">
        <code className="text-xs font-mono">{name}</code>
        <span className={`text-xs font-semibold ${isOn ? 'text-emerald-400' : 'text-neutral-500'}`}>
          {isOn ? 'ON' : 'OFF'}
        </span>
      </div>
      <p className="text-xs text-neutral-400 mb-2">{description}</p>
      {!isOn && recommended && (
        <p className="text-xs text-amber-400">💡 Recommended to enable</p>
      )}
      <p className="text-[10px] text-neutral-600 mt-1">
        To {isOn ? 'disable' : 'enable'}: Set <code className="bg-neutral-800 px-0.5 rounded">{name}={isOn ? '0' : '1'}</code> in Vercel → Redeploy
      </p>
    </div>
  );
}
