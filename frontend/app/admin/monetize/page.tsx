'use client';
import React from 'react';
import { ELI5, HelpTip } from '@/components/AdminHelp';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function isAllowedHost() {
  try { return location.hostname !== 'localhost' && location.hostname !== '127.0.0.1'; } catch { return true; }
}

export default function AdminMonetizePage() {
  const [cfg, setCfg] = React.useState({ stripe: true, kofi: true, paypal: true });
  const [saving, setSaving] = React.useState(false);
  const [stats, setStats] = React.useState<any>(null);
  const [statsLoading, setStatsLoading] = React.useState(false);
  const [lastRefresh, setLastRefresh] = React.useState<Date | null>(null);

  React.useEffect(() => {
    (async () => {
      try { const r = await fetch('/api/config', { cache: 'no-store' }); const j = await r.json(); if (j?.ok && j?.monetize) setCfg(j.monetize); } catch {}
    })();
    loadStats();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadStats() {
    setStatsLoading(true);
    try {
      const r = await fetch('/api/admin/monetize/subscription-stats', { cache: 'no-store' });
      const j = await r.json();
      if (r.ok && j?.ok) {
        setStats(j);
        setLastRefresh(new Date());
      }
    } catch (e) {
      console.error('Failed to load stats:', e);
    } finally {
      setStatsLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const r = await fetch('/api/admin/monetize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cfg) });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || 'save_failed');
      alert('Saved');
    } catch (e:any) { alert(e?.message || 'Save failed'); } finally { setSaving(false); }
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      <h1 className="text-xl font-semibold">Admin • Monetization</h1>

      {/* Pro Subscription Stats */}
      <section className="rounded border border-neutral-800 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="font-medium">Pro Subscription Tracker</div>
          <div className="flex items-center gap-2">
            {lastRefresh && (
              <span className="text-xs text-neutral-500">
                Last updated: {lastRefresh.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={loadStats}
              disabled={statsLoading}
              className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-60 text-xs"
            >
              {statsLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {statsLoading && !stats ? (
          <div className="text-center py-8 text-neutral-500">Loading stats...</div>
        ) : stats ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="rounded border border-neutral-700 p-3 bg-neutral-900">
                <div className="text-xs text-neutral-400 mb-1">Total Pro Users</div>
                <div className="text-2xl font-bold">{stats.stats?.total_pro || 0}</div>
              </div>
              <div className="rounded border border-neutral-700 p-3 bg-neutral-900">
                <div className="text-xs text-neutral-400 mb-1">Monthly</div>
                <div className="text-2xl font-bold">{stats.stats?.monthly_subscriptions || 0}</div>
              </div>
              <div className="rounded border border-neutral-700 p-3 bg-neutral-900">
                <div className="text-xs text-neutral-400 mb-1">Yearly</div>
                <div className="text-2xl font-bold">{stats.stats?.yearly_subscriptions || 0}</div>
              </div>
              <div className="rounded border border-neutral-700 p-3 bg-neutral-900">
                <div className="text-xs text-neutral-400 mb-1">Manual</div>
                <div className="text-2xl font-bold">{stats.stats?.manual_pro || 0}</div>
              </div>
              <div className="rounded border border-neutral-700 p-3 bg-neutral-900">
                <div className="text-xs text-neutral-400 mb-1">Last 30 Days</div>
                <div className="text-2xl font-bold">{stats.stats?.recent_signups_30d || 0}</div>
              </div>
            </div>

            {/* Chart */}
            {stats.chart_data && stats.chart_data.length > 0 && (
              <div className="rounded border border-neutral-700 p-4 bg-neutral-900">
                <div className="text-sm font-medium mb-3">Pro Subscriptions Growth (Last 90 Days)</div>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={stats.chart_data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#888"
                      tick={{ fontSize: 10 }}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis stroke="#888" tick={{ fontSize: 10 }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #444', borderRadius: '4px' }}
                      labelStyle={{ color: '#fff' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="count" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      name="Pro Users"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Plan Breakdown Table */}
            <div className="rounded border border-neutral-700 p-3 bg-neutral-900">
              <div className="text-sm font-medium mb-3">Plan Breakdown</div>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-700">
                    <th className="text-left py-2 px-3">Plan Type</th>
                    <th className="text-right py-2 px-3">Count</th>
                    <th className="text-right py-2 px-3">Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.plan_breakdown?.map((plan: any, i: number) => (
                    <tr key={i} className="border-t border-neutral-800">
                      <td className="py-2 px-3">{plan.plan}</td>
                      <td className="text-right py-2 px-3 font-mono">{plan.count}</td>
                      <td className="text-right py-2 px-3 font-mono">{plan.percentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-neutral-500">Failed to load stats</div>
        )}
      </section>

      {/* Payment Button Controls */}
      <section className="rounded border border-neutral-800 p-4 space-y-3">
        <div className="font-medium">Payment Button Controls</div>
        <ELI5 heading="Monetization Controls" items={[
          "💳 Toggle Payment Buttons: Show/hide Ko-fi, PayPal, Stripe links across the site",
          "💰 Instant Effect: Changes apply immediately - no deploy needed!",
          "🎯 Use Cases: Disable a payment provider if having issues, test different combinations",
          "⚙️ Saved in app_config → monetize key",
          "⏱️ When to use: Changing payment providers, temporarily disabling payments",
          "🔄 How often: Rarely - only when payment provider status changes",
          "💡 Users see these buttons in footer, pricing page, and support page"
        ]} />
        <p className="text-sm opacity-80">Toggle which donation/payment buttons are visible. Saved in app_config → key "monetize".</p>

        <label className="flex items-center gap-2"><input type="checkbox" checked={cfg.stripe} onChange={e=>setCfg(p=>({...p, stripe: e.target.checked}))}/> <span>Stripe</span></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={cfg.kofi} onChange={e=>setCfg(p=>({...p, kofi: e.target.checked}))}/> <span>Ko‑fi</span></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={cfg.paypal} onChange={e=>setCfg(p=>({...p, paypal: e.target.checked}))}/> <span>PayPal</span></label>

        <div>
          <button onClick={save} disabled={saving} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60">Save</button>
        </div>
      </section>
    </div>
  );
}