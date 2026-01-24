'use client';
import React from 'react';
import { ELI5, HelpTip } from '@/components/AdminHelp';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

function isAllowedHost() {
  try { return location.hostname !== 'localhost' && location.hostname !== '127.0.0.1'; } catch { return true; }
}

export default function AdminMonetizePage() {
  const [cfg, setCfg] = React.useState({ stripe: true, kofi: true, paypal: true });
  const [saving, setSaving] = React.useState(false);
  const [stats, setStats] = React.useState<any>(null);
  const [statsLoading, setStatsLoading] = React.useState(false);
  const [lastRefresh, setLastRefresh] = React.useState<Date | null>(null);
  const [webhookStatus, setWebhookStatus] = React.useState<any>(null);
  const [webhookLoading, setWebhookLoading] = React.useState(false);
  const [subscribers, setSubscribers] = React.useState<any[]>([]);
  const [subscribersLoading, setSubscribersLoading] = React.useState(false);
  const [subscriberStats, setSubscriberStats] = React.useState<any>(null);
  const [showInactive, setShowInactive] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  // Admin check state (handled by AdminGuard in layout, but we keep this for data loading)
  const [isAdmin, setIsAdmin] = React.useState<boolean | null>(null);
  const [checking, setChecking] = React.useState(true);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Check admin access
  React.useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      router.push('/');
      return;
    }

    (async () => {
      try {
        const res = await fetch('/api/admin/config', { cache: 'no-store' });
        const data = await res.json();
        if (data.ok && data.is_admin) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
          router.push('/');
        }
      } catch (err) {
        console.error('Admin check failed:', err);
        setIsAdmin(false);
        router.push('/');
      } finally {
        setChecking(false);
      }
    })();
  }, [user, authLoading, router]);

  React.useEffect(() => {
    if (!isAdmin) return; // Don't load data if not admin
    
    (async () => {
      try { const r = await fetch('/api/config', { cache: 'no-store' }); const j = await r.json(); if (j?.ok && j?.monetize) setCfg(j.monetize); } catch {}
    })();
    loadStats();
    loadWebhookStatus();
    loadSubscribers();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      loadStats();
      loadWebhookStatus();
      loadSubscribers();
    }, 30000);
    return () => clearInterval(interval);
  }, [isAdmin]);

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

  async function loadWebhookStatus() {
    setWebhookLoading(true);
    try {
      const r = await fetch('/api/admin/stripe/webhook-status', { cache: 'no-store' });
      const j = await r.json();
      if (r.ok && j?.ok) {
        setWebhookStatus(j.diagnostics);
      }
    } catch (e) {
      console.error('Failed to load webhook status:', e);
    } finally {
      setWebhookLoading(false);
    }
  }

  async function loadSubscribers() {
    setSubscribersLoading(true);
    try {
      const r = await fetch(`/api/admin/stripe/subscribers?include_inactive=${showInactive}`, { cache: 'no-store' });
      const j = await r.json();
      if (r.ok && j?.ok) {
        setSubscribers(j.subscribers || []);
        setSubscriberStats(j.stats || null);
      }
    } catch (e) {
      console.error('Failed to load subscribers:', e);
    } finally {
      setSubscribersLoading(false);
    }
  }

  React.useEffect(() => {
    if (!subscribersLoading) {
      loadSubscribers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  async function save() {
    setSaving(true);
    try {
      const r = await fetch('/api/admin/monetize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cfg) });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || 'save_failed');
      alert('Saved');
    } catch (e:any) { alert(e?.message || 'Save failed'); } finally { setSaving(false); }
  }

  if (authLoading || checking || isAdmin === null) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-neutral-400">Checking admin access...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-xl mb-2">Access Denied</p>
          <p className="text-neutral-400">Admin access required</p>
        </div>
      </div>
    );
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
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
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
              <div className="rounded border border-blue-700 p-3 bg-blue-900/20">
                <div className="text-xs text-blue-400 mb-1">Stripe Subscribers</div>
                <div className="text-2xl font-bold text-blue-300">{stats.stats?.stripe_subscribers || 0}</div>
                <div className="text-[10px] text-blue-500 mt-1">Users with stripe_subscription_id</div>
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

      {/* Stripe Webhook Status */}
      <section className="rounded border border-neutral-800 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="font-medium">Stripe Webhook Status</div>
          <button
            onClick={loadWebhookStatus}
            disabled={webhookLoading}
            className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-60 text-xs"
          >
            {webhookLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {webhookLoading && !webhookStatus ? (
          <div className="text-center py-4 text-neutral-500">Loading webhook status...</div>
        ) : webhookStatus ? (
          <>
            {/* Configuration Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded border border-neutral-700 p-3 bg-neutral-900">
                <div className="text-xs text-neutral-400 mb-1">Webhook Secret</div>
                <div className={`text-sm font-mono ${webhookStatus.webhook_config?.secret_configured ? 'text-emerald-400' : 'text-red-400'}`}>
                  {webhookStatus.webhook_config?.secret_configured ? '✅ Configured' : '❌ Missing'}
                </div>
                {webhookStatus.webhook_config?.endpoint_url && (
                  <div className="text-xs text-neutral-500 mt-1">{webhookStatus.webhook_config.endpoint_url}</div>
                )}
              </div>
              <div className="rounded border border-neutral-700 p-3 bg-neutral-900">
                <div className="text-xs text-neutral-400 mb-1">Stripe Connection</div>
                <div className={`text-sm ${webhookStatus.stripe_connection?.connected ? 'text-emerald-400' : 'text-red-400'}`}>
                  {webhookStatus.stripe_connection?.connected ? '✅ Connected' : '❌ Failed'}
                </div>
                {webhookStatus.stripe_connection?.account_id && (
                  <div className="text-xs text-neutral-500 mt-1">
                    {webhookStatus.stripe_connection.livemode ? '🔴 Live Mode' : '🧪 Test Mode'}
                  </div>
                )}
              </div>
            </div>

            {/* Potential Issues */}
            {webhookStatus.potential_issues?.subscriptions_without_pro > 0 && (
              <div className="rounded border border-yellow-700 bg-yellow-900/20 p-3">
                <div className="text-sm font-medium text-yellow-400 mb-2">
                  ⚠️ {webhookStatus.potential_issues.subscriptions_without_pro} subscription(s) without Pro status
                </div>
                <div className="text-xs text-neutral-400 space-y-1">
                  {webhookStatus.potential_issues.out_of_sync_users?.slice(0, 5).map((u: any, i: number) => (
                    <div key={i} className="font-mono">
                      {u.email || u.user_id} - {u.stripe_subscription_id?.slice(0, 20)}...
                    </div>
                  ))}
                  {webhookStatus.potential_issues.out_of_sync_users?.length > 5 && (
                    <div className="text-neutral-500">...and {webhookStatus.potential_issues.out_of_sync_users.length - 5} more</div>
                  )}
                </div>
              </div>
            )}

            {/* Recent Subscriptions */}
            {webhookStatus.recent_subscriptions && webhookStatus.recent_subscriptions.length > 0 && (
              <div className="rounded border border-neutral-700 p-3 bg-neutral-900">
                <div className="text-sm font-medium mb-2">Recent Subscriptions (Last 20)</div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {webhookStatus.recent_subscriptions.slice(0, 10).map((sub: any, i: number) => (
                    <div key={i} className="text-xs border-b border-neutral-800 pb-1">
                      <div className="flex items-center justify-between">
                        <span className={sub.is_pro ? 'text-emerald-400' : 'text-red-400'}>
                          {sub.is_pro ? '✅' : '❌'} {sub.email || sub.user_id?.slice(0, 8)}
                        </span>
                        <span className="text-neutral-500">{sub.pro_plan || '—'}</span>
                      </div>
                      {sub.last_updated && (
                        <div className="text-neutral-600 text-[10px] mt-0.5">
                          Updated: {new Date(sub.last_updated).toLocaleString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-4 text-neutral-500">Failed to load webhook status</div>
        )}
      </section>

      {/* All Subscribers Overview */}
      <section className="rounded border border-neutral-800 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="font-medium">All Subscribers Overview</div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search by email or username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-2 py-1 rounded bg-neutral-900 border border-neutral-700 text-sm w-64"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded"
              />
              <span>Show inactive</span>
            </label>
            <button
              onClick={loadSubscribers}
              disabled={subscribersLoading}
              className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-60 text-xs"
            >
              {subscribersLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        {subscriberStats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div className="rounded border border-neutral-700 p-2 bg-neutral-900 text-center">
              <div className="text-xs text-neutral-400">Total</div>
              <div className="text-lg font-bold">{subscriberStats.total}</div>
            </div>
            <div className="rounded border border-neutral-700 p-2 bg-neutral-900 text-center">
              <div className="text-xs text-neutral-400">Active</div>
              <div className="text-lg font-bold text-emerald-400">{subscriberStats.active}</div>
            </div>
            <div className="rounded border border-neutral-700 p-2 bg-neutral-900 text-center">
              <div className="text-xs text-neutral-400">With Pro</div>
              <div className="text-lg font-bold text-emerald-400">{subscriberStats.with_pro}</div>
            </div>
            <div className="rounded border border-neutral-700 p-2 bg-neutral-900 text-center">
              <div className="text-xs text-neutral-400">Without Pro</div>
              <div className="text-lg font-bold text-red-400">{subscriberStats.without_pro}</div>
            </div>
            <div className="rounded border border-neutral-700 p-2 bg-neutral-900 text-center">
              <div className="text-xs text-neutral-400">Canceled</div>
              <div className="text-lg font-bold text-yellow-400">{subscriberStats.canceled}</div>
            </div>
          </div>
        )}

        {/* Subscribers Table */}
        {subscribersLoading && subscribers.length === 0 ? (
          <div className="text-center py-8 text-neutral-500">Loading subscribers...</div>
        ) : subscribers.length > 0 ? (
          <div className="rounded border border-neutral-700 bg-neutral-900 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-700 bg-neutral-800">
                  <th className="text-left py-2 px-3">User</th>
                  <th className="text-left py-2 px-3">Pro Status</th>
                  <th className="text-left py-2 px-3">Plan</th>
                  <th className="text-left py-2 px-3">Stripe Status</th>
                  <th className="text-left py-2 px-3">Period End</th>
                  <th className="text-left py-2 px-3">Subscription ID</th>
                  <th className="text-left py-2 px-3">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {subscribers
                  .filter((sub: any) => {
                    if (!searchQuery) return true;
                    const query = searchQuery.toLowerCase();
                    return (
                      sub.email?.toLowerCase().includes(query) ||
                      sub.username?.toLowerCase().includes(query) ||
                      sub.stripe_subscription_id?.toLowerCase().includes(query) ||
                      sub.stripe_customer_id?.toLowerCase().includes(query)
                    );
                  })
                  .map((sub: any, i: number) => (
                    <tr key={i} className="border-b border-neutral-800 hover:bg-neutral-800/50">
                      <td className="py-2 px-3">
                        <div className="flex flex-col">
                          <div className="font-medium">{sub.email || '—'}</div>
                          {sub.username && (
                            <div className="text-xs text-neutral-500">@{sub.username}</div>
                          )}
                          <div className="text-xs text-neutral-600 font-mono mt-0.5">
                            {sub.user_id?.slice(0, 8)}...
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          {sub.is_pro ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-900/50 text-emerald-400 text-xs font-medium">
                              ✅ Pro
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-red-900/50 text-red-400 text-xs font-medium">
                              ❌ Not Pro
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <span className="text-xs">
                          {sub.pro_plan ? (
                            <span className="px-2 py-0.5 rounded bg-blue-900/50 text-blue-400 uppercase">
                              {sub.pro_plan}
                            </span>
                          ) : (
                            <span className="text-neutral-500">—</span>
                          )}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex flex-col gap-1">
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            sub.stripe.status === 'active' ? 'bg-emerald-900/50 text-emerald-400' :
                            sub.stripe.status === 'trialing' ? 'bg-blue-900/50 text-blue-400' :
                            sub.stripe.status === 'canceled' ? 'bg-yellow-900/50 text-yellow-400' :
                            sub.stripe.status === 'past_due' ? 'bg-red-900/50 text-red-400' :
                            'bg-neutral-800 text-neutral-400'
                          }`}>
                            {sub.stripe.status || 'unknown'}
                          </span>
                          {sub.stripe.cancel_at_period_end && (
                            <span className="text-xs text-yellow-400">Cancels at period end</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        {sub.stripe.current_period_end ? (
                          <div className="text-xs">
                            <div>{new Date(sub.stripe.current_period_end).toLocaleDateString()}</div>
                            <div className="text-neutral-500">
                              {new Date(sub.stripe.current_period_end).toLocaleTimeString()}
                            </div>
                          </div>
                        ) : (
                          <span className="text-neutral-500 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <div className="font-mono text-xs text-neutral-400">
                          {sub.stripe_subscription_id ? (
                            <div className="flex flex-col">
                              <div>{sub.stripe_subscription_id.slice(0, 20)}...</div>
                              <div className="text-[10px] text-neutral-600 mt-0.5">
                                {sub.stripe_customer_id?.slice(0, 20)}...
                              </div>
                            </div>
                          ) : (
                            '—'
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="text-xs text-neutral-500">
                          {sub.last_updated ? (
                            <>
                              <div>{new Date(sub.last_updated).toLocaleDateString()}</div>
                              <div>{new Date(sub.last_updated).toLocaleTimeString()}</div>
                            </>
                          ) : (
                            '—'
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {searchQuery && (
              <div className="p-3 text-xs text-neutral-500 border-t border-neutral-800">
                Showing {subscribers.filter((sub: any) => {
                  const query = searchQuery.toLowerCase();
                  return (
                    sub.email?.toLowerCase().includes(query) ||
                    sub.username?.toLowerCase().includes(query) ||
                    sub.stripe_subscription_id?.toLowerCase().includes(query) ||
                    sub.stripe_customer_id?.toLowerCase().includes(query)
                  );
                }).length} of {subscribers.length} subscribers
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-neutral-500">No subscribers found</div>
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