'use client';

import Link from 'next/link';
import React from 'react';

type RouteMeta = {
  path: string;
  methods: string[];
  category: string;
  risk: 'low' | 'medium' | 'high' | 'critical';
  authRequired: boolean;
  writes: boolean;
  description: string;
  healthCheck?: string;
  confirmationPhrase?: string;
};

type RouteCheck = {
  path: string;
  status: 'ok' | 'forbidden' | 'error' | 'missing_env' | 'slow' | 'skipped';
  httpStatus: number | null;
  ms: number;
  detail?: string;
};

type HealthPayload = {
  ok: boolean;
  generatedAt: string;
  summary: {
    totalRoutes: number;
    writeRoutes: number;
    criticalRoutes: number;
    safeChecks: number;
    ok: number;
    slow: number;
    forbidden: number;
    errors: number;
  };
  routes: RouteMeta[];
  checks: RouteCheck[];
};

type SmokePayload = {
  ok: boolean;
  runId: string;
  passed: number;
  failed: number;
  total: number;
  results: Array<{
    name: string;
    prompt: string;
    passed: boolean;
    failures: string[];
    status: number;
    latencyMs: number;
    preview: string;
  }>;
};

function statusClass(status: RouteCheck['status']) {
  if (status === 'ok') return 'bg-emerald-900/30 text-emerald-300 border-emerald-700';
  if (status === 'slow') return 'bg-amber-900/30 text-amber-300 border-amber-700';
  if (status === 'skipped') return 'bg-neutral-900 text-neutral-400 border-neutral-700';
  if (status === 'forbidden') return 'bg-blue-900/30 text-blue-300 border-blue-700';
  return 'bg-rose-900/30 text-rose-300 border-rose-700';
}

function riskClass(risk: RouteMeta['risk']) {
  if (risk === 'critical') return 'text-rose-300 bg-rose-950/40 border-rose-800';
  if (risk === 'high') return 'text-orange-300 bg-orange-950/40 border-orange-800';
  if (risk === 'medium') return 'text-amber-300 bg-amber-950/40 border-amber-800';
  return 'text-emerald-300 bg-emerald-950/30 border-emerald-800';
}

export default function AdminRouteHealthPage() {
  const [payload, setPayload] = React.useState<HealthPayload | null>(null);
  const [checksRunning, setChecksRunning] = React.useState(false);
  const [smokeRunning, setSmokeRunning] = React.useState(false);
  const [smoke, setSmoke] = React.useState<SmokePayload | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function load(check = false) {
    setError(null);
    if (check) setChecksRunning(true);
    try {
      const res = await fetch(`/api/admin/route-health${check ? '?check=1' : ''}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error || `HTTP ${res.status}`);
      setPayload(json);
    } catch (e: any) {
      setError(e?.message || 'Failed to load route health');
    } finally {
      setChecksRunning(false);
    }
  }

  async function runSmoke() {
    const confirmation = window.prompt('Type RUN to run the live smoke suite.');
    if (confirmation !== 'RUN') return;
    setSmokeRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/live-smoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation }),
      });
      const json = await res.json();
      if (!res.ok && res.status !== 207) throw new Error(json?.error || `HTTP ${res.status}`);
      setSmoke(json);
    } catch (e: any) {
      setError(e?.message || 'Live smoke failed');
    } finally {
      setSmokeRunning(false);
    }
  }

  React.useEffect(() => {
    void load(false);
  }, []);

  const checksByPath = React.useMemo(() => {
    const map = new Map<string, RouteCheck>();
    for (const check of payload?.checks || []) map.set(check.path, check);
    return map;
  }, [payload]);

  return (
    <main className="max-w-7xl mx-auto p-4 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link href="/admin/JustForDavy/command-center" className="text-sm text-neutral-400 hover:text-white">
            ← Command center
          </Link>
          <h1 className="text-2xl font-semibold mt-1">Admin Route Health</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Permission matrix, safe route checks, and one-click live AI smoke reports.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => load(true)}
            disabled={checksRunning}
            className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm"
          >
            {checksRunning ? 'Checking…' : 'Run safe checks'}
          </button>
          <button
            onClick={runSmoke}
            disabled={smokeRunning}
            className="px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-sm"
          >
            {smokeRunning ? 'Running…' : 'Run live smoke'}
          </button>
        </div>
      </div>

      {error && <div className="rounded border border-rose-800 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</div>}

      {payload && (
        <>
          <section className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              ['Routes', payload.summary.totalRoutes],
              ['Write routes', payload.summary.writeRoutes],
              ['Critical', payload.summary.criticalRoutes],
              ['Safe checks', payload.summary.safeChecks],
              ['OK', payload.summary.ok],
              ['Issues', payload.summary.errors + payload.summary.slow],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
                <div className="text-xs text-neutral-500">{label}</div>
                <div className="text-xl font-mono mt-1">{value}</div>
              </div>
            ))}
          </section>

          <section className="rounded-xl border border-neutral-800 overflow-hidden">
            <div className="p-3 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Admin API Permission Matrix</h2>
                <p className="text-xs text-neutral-500">Generated {new Date(payload.generatedAt).toLocaleString()}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-950 text-neutral-400">
                  <tr>
                    <th className="text-left p-2">Route</th>
                    <th className="text-left p-2">Category</th>
                    <th className="text-left p-2">Method</th>
                    <th className="text-left p-2">Risk</th>
                    <th className="text-left p-2">Writes</th>
                    <th className="text-left p-2">Confirm</th>
                    <th className="text-left p-2">Health</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.routes.map((route) => {
                    const check = checksByPath.get(route.path);
                    return (
                      <tr key={route.path} className="border-t border-neutral-900 align-top">
                        <td className="p-2">
                          <div className="font-mono text-xs text-neutral-200">{route.path}</div>
                          <div className="text-xs text-neutral-500 mt-1 max-w-xl">{route.description}</div>
                        </td>
                        <td className="p-2 text-neutral-300">{route.category}</td>
                        <td className="p-2 font-mono text-xs">{route.methods.join(', ')}</td>
                        <td className="p-2">
                          <span className={`px-2 py-0.5 rounded border text-xs ${riskClass(route.risk)}`}>{route.risk}</span>
                        </td>
                        <td className="p-2">{route.writes ? 'Yes' : 'No'}</td>
                        <td className="p-2 font-mono text-xs">{route.confirmationPhrase || '—'}</td>
                        <td className="p-2">
                          {check ? (
                            <div>
                              <span className={`px-2 py-0.5 rounded border text-xs ${statusClass(check.status)}`}>{check.status}</span>
                              <div className="text-xs text-neutral-500 mt-1">
                                {check.httpStatus ?? '—'} · {check.ms}ms
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-neutral-500">{route.healthCheck || 'not checked'}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {smoke && (
        <section className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Live Smoke Report</h2>
              <p className="text-xs text-neutral-500">{smoke.runId}</p>
            </div>
            <div className={smoke.ok ? 'text-emerald-300' : 'text-amber-300'}>
              {smoke.passed}/{smoke.total} passed
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {smoke.results.map((result) => (
              <div
                key={result.name}
                className={`rounded-lg border p-3 ${result.passed ? 'border-emerald-800 bg-emerald-950/20' : 'border-rose-800 bg-rose-950/20'}`}
              >
                <div className="flex justify-between gap-2">
                  <div className="font-medium">{result.name}</div>
                  <div className="text-xs text-neutral-500">{result.status} · {result.latencyMs}ms</div>
                </div>
                {result.failures.length > 0 && (
                  <div className="mt-2 text-xs text-rose-200">{result.failures.join(', ')}</div>
                )}
                <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap text-xs text-neutral-300">{result.preview}</pre>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
