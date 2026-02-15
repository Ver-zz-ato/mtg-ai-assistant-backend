'use client';
import React from 'react';
import { ELI5, HelpTip } from '@/components/AdminHelp';

async function saveConfig(key: string, value: any) {
  const r = await fetch('/api/admin/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key, value }) });
  const j = await r.json();
  if (!r.ok || j?.ok === false) throw new Error(j?.error || 'save_failed');
}

export default function OpsPage() {
  const [flags, setFlags] = React.useState<any>({ widgets: true, chat_extras: true, risky_betas: false, analytics_clicks_enabled: false });
  const [maint, setMaint] = React.useState<any>({ enabled: false, message: '' });
  const [budget, setBudget] = React.useState<any>({ daily_usd: 0, weekly_usd: 0 });
  const [busy, setBusy] = React.useState(false);
  const [pinboard, setPinboard] = React.useState<any>(null);
  const [lastRefresh, setLastRefresh] = React.useState<string>('');
  const [opsReports, setOpsReports] = React.useState<{ reports: any[]; latest_daily: any; latest_weekly: any } | null>(null);
  const [runReportBusy, setRunReportBusy] = React.useState<string | null>(null);
  const [expandedReportId, setExpandedReportId] = React.useState<string | null>(null);
  const [cronLastRun, setCronLastRun] = React.useState<Record<string, string>>({});
  const [cronRunBusy, setCronRunBusy] = React.useState<string | null>(null);

  const CRON_KEYS = ["deck-costs", "commander-aggregates", "meta-signals", "top-cards"] as const;

  async function loadCronLastRun() {
    try {
      const keys = CRON_KEYS.map((k) => `key=job:last:${k}`).join("&");
      const r = await fetch(`/api/admin/config?${keys}`, { cache: "no-store" });
      const j = await r.json();
      if (j?.config) setCronLastRun(j.config);
    } catch {}
  }

  async function runCron(name: (typeof CRON_KEYS)[number]) {
    setCronRunBusy(name);
    try {
      const r = await fetch("/api/admin/cron/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cron: name }),
      });
      const j = await r.json();
      if (j?.ok) {
        alert(`✅ ${name} completed. ${j.updated != null ? `Updated: ${j.updated}` : ""}`);
        loadCronLastRun();
      } else {
        alert(`❌ ${name} failed: ${j?.error || r.statusText}`);
      }
    } catch (e: any) {
      alert(`❌ ${name} failed: ${e?.message}`);
    } finally {
      setCronRunBusy(null);
    }
  }

  async function loadOpsReports() {
    try {
      const r = await fetch('/api/admin/ops-reports/list?limit=10', { cache: 'no-store' });
      const j = await r.json();
      if (j?.ok) setOpsReports({ reports: j.reports || [], latest_daily: j.latest_daily, latest_weekly: j.latest_weekly });
    } catch (e) {
      console.warn('Failed to load ops reports:', e);
    }
  }

  async function runReport(type: 'daily' | 'weekly') {
    setRunReportBusy(type);
    try {
      const r = await fetch('/api/admin/ops-reports/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const j = await r.json();
      if (j?.ok) {
        alert(`${type === 'daily' ? 'Daily' : 'Weekly'} report completed. Status: ${j.status}`);
        loadOpsReports();
      } else {
        alert(j?.error || 'Run failed');
      }
    } catch (e: any) {
      alert(e?.message || 'Run failed');
    } finally {
      setRunReportBusy(null);
    }
  }

  React.useEffect(() => { (async () => {
    try {
      const r = await fetch('/api/admin/config?key=flags&key=maintenance&key=llm_budget', { cache: 'no-store' });
      const j = await r.json();
      if (j?.config?.flags) setFlags(j.config.flags);
      if (j?.config?.maintenance) setMaint(j.config.maintenance);
      if (j?.config?.llm_budget) setBudget(j.config.llm_budget);
    } catch {}
    refreshPinboard();
    loadOpsReports();
    loadCronLastRun();
  })(); }, []);
  
  async function refreshPinboard() {
    try {
      const r = await fetch('/api/admin/audit-pinboard', { cache: 'no-store' });
      const j = await r.json();
      if (j?.ok && j?.pinboard) {
        setPinboard(j.pinboard);
        setLastRefresh(new Date().toLocaleTimeString());
      }
    } catch (e) {
      console.warn('Failed to load audit pinboard:', e);
    }
  }

  async function saveFlags() { setBusy(true); try { await saveConfig('flags', flags); alert('Saved'); } catch(e:any){ alert(e?.message||'save failed'); } finally{ setBusy(false);} }
  async function saveMaint() { setBusy(true); try { await saveConfig('maintenance', maint); alert('Saved'); } catch(e:any){ alert(e?.message||'save failed'); } finally{ setBusy(false);} }
  async function saveBudget() { setBusy(true); try { await saveConfig('llm_budget', { daily_usd: Number(budget.daily_usd)||0, weekly_usd: Number(budget.weekly_usd)||0 }); alert('Saved'); } catch(e:any){ alert(e?.message||'save failed'); } finally{ setBusy(false);} }
  async function rollback() { setBusy(true); try { const r = await fetch('/api/admin/ops/rollback-snapshot', { method:'POST' }); const j = await r.json(); if (!r.ok || j?.ok===false) throw new Error(j?.error||'rollback_failed'); alert(`Snapshot set to ${j.snapshotDate}`); } catch(e:any){ alert(e?.message||'failed'); } finally{ setBusy(false);} }
  
  async function autoDisableBudget() {
    if (pinboard?.ai_spending?.over_daily_limit || pinboard?.ai_spending?.over_weekly_limit) {
      setBusy(true);
      try {
        const newFlags = { ...flags, risky_betas: false };
        await saveConfig('flags', newFlags);
        setFlags(newFlags);
        alert('Budget exceeded! Auto-disabled risky betas to control spending.');
        refreshPinboard();
      } catch(e:any) {
        alert(e?.message || 'Auto-disable failed');
      } finally {
        setBusy(false);
      }
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="text-xl font-semibold">Ops & Safety</div>
      
      {/* Audit Pinboard */}
      <section className="rounded border border-neutral-800 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-medium">System Health Pinboard <HelpTip text="Real-time overview of errors, spending, snapshots, and performance issues." /></div>
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-60">Last: {lastRefresh || 'Loading...'}</span>
            <button onClick={refreshPinboard} disabled={busy} className="px-2 py-1 text-xs rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-60">Refresh</button>
          </div>
        </div>
        {pinboard ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            {/* Errors */}
            <div className={`p-2 rounded border ${
              pinboard.errors.count_24h === 0 ? 'bg-green-900/20 border-green-700' :
              pinboard.errors.count_24h < 5 ? 'bg-yellow-900/20 border-yellow-700' :
              'bg-red-900/20 border-red-700'
            }`}>
              <div className="font-medium">Errors (24h)</div>
              <div className="text-lg">{pinboard.errors.count_24h}</div>
              {pinboard.errors.recent.length > 0 && (
                <div className="text-xs mt-1 opacity-80">
                  Latest: {pinboard.errors.recent[0].kind}
                </div>
              )}
            </div>
            
            {/* AI Spending */}
            <div className={`p-2 rounded border ${
              pinboard.ai_spending.over_daily_limit || pinboard.ai_spending.over_weekly_limit ? 'bg-red-900/20 border-red-700' :
              pinboard.ai_spending.daily_usage_pct > 80 || pinboard.ai_spending.weekly_usage_pct > 80 ? 'bg-yellow-900/20 border-yellow-700' :
              'bg-green-900/20 border-green-700'
            }`}>
              <div className="font-medium flex items-center justify-between">
                <span>AI Spend</span>
                {(pinboard.ai_spending.over_daily_limit || pinboard.ai_spending.over_weekly_limit) && (
                  <button onClick={autoDisableBudget} disabled={busy} className="text-xs px-2 py-1 bg-red-600 rounded hover:bg-red-500 disabled:opacity-60">
                    Auto-Disable
                  </button>
                )}
              </div>
              <div className="text-xs">
                Today: ${pinboard.ai_spending.today_usd} ({pinboard.ai_spending.daily_usage_pct}%)
              </div>
              <div className="text-xs">
                Week: ${pinboard.ai_spending.week_usd} ({pinboard.ai_spending.weekly_usage_pct}%)
              </div>
            </div>
            
            {/* Price Snapshots */}
            <div className={`p-2 rounded border ${
              pinboard.price_snapshots.health === 'healthy' ? 'bg-green-900/20 border-green-700' :
              pinboard.price_snapshots.health === 'stale' ? 'bg-yellow-900/20 border-yellow-700' :
              'bg-red-900/20 border-red-700'
            }`}>
              <div className="font-medium">Price Data</div>
              <div className="text-lg capitalize">{pinboard.price_snapshots.health}</div>
              <div className="text-xs opacity-80">
                {pinboard.price_snapshots.latest_date} ({pinboard.price_snapshots.age_hours}h ago)
              </div>
            </div>
            
            {/* Performance */}
            <div className={`p-2 rounded border ${
              pinboard.performance.slow_jobs_24h === 0 ? 'bg-green-900/20 border-green-700' :
              pinboard.performance.slow_jobs_24h < 3 ? 'bg-yellow-900/20 border-yellow-700' :
              'bg-red-900/20 border-red-700'
            }`}>
              <div className="font-medium">Performance</div>
              <div className="text-lg">{pinboard.performance.slow_jobs_24h} slow jobs</div>
              <div className="text-xs opacity-80">
                Rate limits: {pinboard.rate_limits.violations_24h}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-4 opacity-60">Loading health data...</div>
        )}
      </section>

      {/* Discovery Crons */}
      <section className="rounded border border-neutral-800 p-3 space-y-3">
        <div className="font-medium">Discovery Crons <HelpTip text="Run nightly via Vercel (04:30–05:30 UTC). Powers commander hub stats, meta signals, top cards. Run manually here to refresh data." /></div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead><tr className="border-b border-neutral-700"><th className="text-left py-1.5 px-2">Cron</th><th className="text-left py-1.5 px-2">Last run</th><th className="text-left py-1.5 px-2">Action</th></tr></thead>
            <tbody>
              {CRON_KEYS.map((name) => (
                <tr key={name} className="border-b border-neutral-900">
                  <td className="py-1.5 px-2 font-mono">{name}</td>
                  <td className="py-1.5 px-2 text-neutral-400">
                    {cronLastRun[`job:last:${name}`] ? new Date(cronLastRun[`job:last:${name}`]).toLocaleString() : "—"}
                  </td>
                  <td className="py-1.5 px-2">
                    <button onClick={() => runCron(name)} disabled={!!cronRunBusy} className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-60 text-xs">
                      {cronRunBusy === name ? "Running…" : "Run now"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-neutral-500">
          Order: deck-costs → commander-aggregates → meta-signals → top-cards. Or click &quot;Run all&quot; in terminal: <code className="bg-neutral-900 px-1 rounded">npx tsx scripts/run-crons.ts all</code>
        </div>
      </section>

      {/* Scheduled Reports */}
      <section className="rounded border border-neutral-800 p-3 space-y-3">
        <div className="font-medium">Scheduled Reports <HelpTip text="Daily and weekly ops health checks. Stored in ops_reports and posted to Discord." /></div>
        <div className="flex gap-2">
          <button onClick={() => runReport('daily')} disabled={!!runReportBusy} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm">
            {runReportBusy === 'daily' ? 'Running…' : 'Run Daily Now'}
          </button>
          <button onClick={() => runReport('weekly')} disabled={!!runReportBusy} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm">
            {runReportBusy === 'weekly' ? 'Running…' : 'Run Weekly Now'}
          </button>
          <button onClick={loadOpsReports} disabled={!!runReportBusy} className="px-3 py-1.5 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-60 text-sm">Refresh</button>
        </div>
        {opsReports && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {opsReports.latest_daily && (
                <div className="p-2 rounded border border-neutral-700">
                  <div className="font-medium text-neutral-300">Latest Daily</div>
                  <div className="text-xs mt-1">
                    {new Date(opsReports.latest_daily.created_at).toLocaleString()} · {opsReports.latest_daily.status}
                  </div>
                  <div className="text-xs opacity-80 mt-0.5 truncate">{opsReports.latest_daily.summary || '—'}</div>
                </div>
              )}
              {opsReports.latest_weekly && (
                <div className="p-2 rounded border border-neutral-700">
                  <div className="font-medium text-neutral-300">Latest Weekly</div>
                  <div className="text-xs mt-1">
                    {new Date(opsReports.latest_weekly.created_at).toLocaleString()} · {opsReports.latest_weekly.status}
                  </div>
                  <div className="text-xs opacity-80 mt-0.5 truncate">{opsReports.latest_weekly.summary || '—'}</div>
                </div>
              )}
            </div>
            <div className="overflow-auto max-h-60">
              <table className="min-w-full text-sm">
                <thead><tr><th className="text-left py-1 px-2">When</th><th className="text-left py-1 px-2">Type</th><th className="text-left py-1 px-2">Status</th><th className="text-left py-1 px-2">Summary</th><th className="text-left py-1 px-2"></th></tr></thead>
                <tbody>
                  {(opsReports.reports || []).map((r: any) => (
                    <React.Fragment key={r.id}>
                      <tr className="border-t border-neutral-900">
                        <td className="py-1 px-2 font-mono text-xs">{new Date(r.created_at).toLocaleString()}</td>
                        <td className="py-1 px-2">{r.report_type}</td>
                        <td className="py-1 px-2">{r.status}</td>
                        <td className="py-1 px-2 max-w-[200px] truncate" title={r.summary}>{r.summary || '—'}</td>
                        <td className="py-1 px-2">
                          <button onClick={() => setExpandedReportId(expandedReportId === r.id ? null : r.id)} className="text-xs text-blue-400 hover:underline">
                            {expandedReportId === r.id ? 'Hide' : 'Details'}
                          </button>
                        </td>
                      </tr>
                      {expandedReportId === r.id && r.details && (
                        <tr className="border-t border-neutral-900 bg-neutral-950/50">
                          <td colSpan={5} className="py-2 px-2">
                            <pre className="text-xs overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">{JSON.stringify(r.details, null, 2)}</pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  {(!opsReports.reports || opsReports.reports.length === 0) && (
                    <tr><td colSpan={5} className="py-3 text-center opacity-70">No reports yet. Run one above.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <ELI5 heading="Ops & Safety - EMERGENCY CONTROLS" items={[
        '🚨 DANGER ZONE: Kill switches for broken features',
        '🔴 Maintenance Mode: Show banner or completely pause the app',
        '💰 LLM Budget Limits: Set daily/weekly AI spending caps to prevent runaway costs',
        '📊 Audit Pinboard: Recent errors, security events, suspicious activity',
        '⚠️ Feature Flags: widgets, chat_extras, risky_betas - toggle on/off',
        '⏱️ When to use: ONLY DURING EMERGENCIES - bad deploy, security issue, cost spike',
        '🔄 How often: Never (hopefully!), or immediately when something breaks',
        '🛑 Use rollback-snapshot for database disasters',
        '💡 This is your nuclear option - use carefully!',
        'Put a hard daily/weekly cost cap for LLM usage to avoid surprise bills.',
        'If pricing data goes wrong, rollback to yesterday\'s snapshot with one click.'
      ]} />

      {/* Flags & Kill Switches */}
      <section className="rounded border border-neutral-800 p-3 space-y-3">
        <div className="font-medium">Feature Flags & Kill Switches <HelpTip text="Turn whole feature areas on/off instantly. Safe to toggle anytime; takes effect immediately for new requests." /></div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-sm">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!flags.widgets} onChange={e=>setFlags((p:any)=>({...p, widgets:e.target.checked}))}/> <span>Widgets</span></label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!flags.chat_extras} onChange={e=>setFlags((p:any)=>({...p, chat_extras:e.target.checked}))}/> <span>Chat extras</span></label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!flags.risky_betas} onChange={e=>setFlags((p:any)=>({...p, risky_betas:e.target.checked}))}/> <span>Risky betas</span></label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!flags.analytics_clicks_enabled} onChange={e=>setFlags((p:any)=>({...p, analytics_clicks_enabled:e.target.checked}))}/> <span>Click tracking</span></label>
        </div>
        <button onClick={saveFlags} disabled={busy} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm">Save Flags</button>
      </section>

      {/* Maintenance Mode */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Maintenance Mode + Banner <HelpTip text="Show a friendly banner and optionally gate traffic while you fix something. Message appears site‑wide." /></div>
        <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={!!maint.enabled} onChange={e=>setMaint((p:any)=>({...p, enabled:e.target.checked}))}/> <span>Enabled</span></label>
        <input value={maint.message||''} onChange={e=>setMaint((p:any)=>({...p, message:e.target.value}))} placeholder="We’re tinkering…" className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm" />
        <button onClick={saveMaint} disabled={busy} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm">Save Maintenance</button>
      </section>

      {/* Budget caps */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Emergency Budget Caps (LLM) <HelpTip text="Hard limits for AI spend. When reached, non‑critical AI calls are blocked until the next window." /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="text-sm">Daily USD<input type="number" value={budget.daily_usd||0} onChange={e=>setBudget((p:any)=>({...p, daily_usd:e.target.value}))} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" /></label>
          <label className="text-sm">Weekly USD<input type="number" value={budget.weekly_usd||0} onChange={e=>setBudget((p:any)=>({...p, weekly_usd:e.target.value}))} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" /></label>
        </div>
        <button onClick={saveBudget} disabled={busy} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm">Save Budget Caps</button>
      </section>

      {/* Snapshot rollback */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Snapshot Rollback <HelpTip text="If a price import is bad, switch back to yesterday\'s snapshot instantly. Reversible by rebuilding today." /></div>
        <button onClick={rollback} disabled={busy} className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-sm">Rollback to Yesterday</button>
      </section>
    </div>
  );
}
